-- ============================================================
-- CONVOCAÇÃO — Schema do banco (Supabase / Postgres)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- ============================================================

-- ---------- PERFIS (usuários logados) ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'membro' check (role in ('organizador','auxiliar','membro')),
  created_at timestamptz not null default now()
);

-- Primeiro usuário cadastrado vira organizador automaticamente
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'organizador' else 'membro' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- JOGADORES ----------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  category text not null default 'convidado'
    check (category in ('mensalista','frequente','turista','convidado')),
  position1 text not null check (position1 in ('defensor','meia','atacante','goleiro')),
  position2 text not null check (position2 in ('defensor','meia','atacante','goleiro')),
  aptitude int not null default 3 check (aptitude between 1 and 5), -- 1=tot.defensivo 5=tot.ofensivo
  is_goleiro_avulso boolean not null default false, -- goleiro de aluguel (card simples)
  overall numeric(4,1), -- denormalizado: overall da avaliação oficial mais recente
  forma numeric(4,1),   -- nota ajustada (vale pro sorteio)
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- AVALIAÇÕES DE SKILL (registros datados, nunca sobrescritos) ----------
create table if not exists skill_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  source text not null check (source in ('inicial','scout','ajuste')),
  skills jsonb not null, -- {"finalizacao":7,"passe":6,...} escala 1-10
  overall numeric(4,1) not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- SCOUT (avaliação por votação) ----------
create table if not exists scouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  suggested jsonb, -- sugestão automática de notas (jogador com 3+ presenças)
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists scout_links (
  id uuid primary key default gen_random_uuid(),
  scout_id uuid not null references scouts(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  assigned_name text not null, -- pra quem o organizador mandou o link
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists scout_votes (
  id uuid primary key default gen_random_uuid(),
  scout_id uuid not null references scouts(id) on delete cascade,
  link_id uuid references scout_links(id) on delete set null,
  voter_name text not null, -- visível só pro organizador (RLS)
  skills jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- PELADAS ----------
create table if not exists peladas (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  status text not null default 'aberta' check (status in ('aberta','encerrada')),
  rachao boolean not null default false, -- Modo Rachão ativo
  sumula text,
  created_at timestamptz not null default now()
);

create table if not exists pelada_players (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team int check (team between 1 and 3), -- null = extra / sem time
  is_extra boolean not null default false,
  unique (pelada_id, player_id)
);

-- ---------- PARTIDAS ----------
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas(id) on delete cascade,
  ordem int not null,
  team_a int not null check (team_a between 1 and 3),
  team_b int not null check (team_b between 1 and 3),
  score_a int not null default 0,
  score_b int not null default 0,
  meta_a int not null default 2, -- meta de gols (Anticovardia)
  meta_b int not null default 2,
  streak_a int not null default 1, -- nº desta partida na sequência do time em quadra
  streak_b int not null default 1,
  penaltis boolean not null default false,
  penalti_winner int, -- time que venceu nos pênaltis (só 1ª partida do dia)
  paused_at timestamptz,               -- cronômetro pausado desde
  paused_total_seg int not null default 0, -- tempo total pausado acumulado
  status text not null default 'em_andamento'
    check (status in ('em_andamento','encerrada')),
  winner int, -- null = empate
  fica int,   -- time que permanece em quadra
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duracao_seg int
);

-- Elenco de cada partida (snapshot — quem estava em quadra conta estatística)
create table if not exists match_players (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team int not null check (team between 1 and 3),
  primary key (match_id, player_id)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  pelada_id uuid not null references peladas(id) on delete cascade,
  team int not null check (team between 1 and 3), -- time que marcou (leva o gol no placar)
  scorer_id uuid references players(id) on delete set null,
  assist_id uuid references players(id) on delete set null,
  own_goal boolean not null default false, -- scorer_id = quem fez contra
  created_at timestamptz not null default now()
);

-- ---------- HISTÓRICO DE FORMA (auditoria) ----------
create table if not exists forma_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  old_forma numeric(4,1) not null,
  new_forma numeric(4,1) not null,
  delta numeric(3,1) not null,
  created_at timestamptz not null default now()
);

-- ---------- SUBSTITUIÇÕES (auditoria) ----------
create table if not exists substitutions (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  team int,
  out_player uuid references players(id),
  in_player uuid references players(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table profiles enable row level security;
alter table players enable row level security;
alter table skill_ratings enable row level security;
alter table scouts enable row level security;
alter table scout_links enable row level security;
alter table scout_votes enable row level security;
alter table peladas enable row level security;
alter table pelada_players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table goals enable row level security;
alter table forma_history enable row level security;
alter table substitutions enable row level security;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Perfis: cada um vê todos, só organizador altera papéis (via update)
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update_self" on profiles for update to authenticated
  using (id = auth.uid() or my_role() = 'organizador');

-- Leitura geral para autenticados
create policy "players_select" on players for select to authenticated using (true);
create policy "ratings_select" on skill_ratings for select to authenticated using (true);
create policy "scouts_select" on scouts for select to authenticated using (true);
create policy "peladas_select" on peladas for select to authenticated using (true);
create policy "pp_select" on pelada_players for select to authenticated using (true);
create policy "matches_select" on matches for select to authenticated using (true);
create policy "mp_select" on match_players for select to authenticated using (true);
create policy "goals_select" on goals for select to authenticated using (true);
create policy "fh_select" on forma_history for select to authenticated using (true);
create policy "subs_select" on substitutions for select to authenticated using (true);

-- Quem votou em quem: só organizador enxerga
create policy "links_select" on scout_links for select to authenticated
  using (my_role() = 'organizador');
create policy "votes_select" on scout_votes for select to authenticated
  using (my_role() = 'organizador');

-- Escrita: organizador e auxiliar (regras finas ficam no app)
create policy "players_write" on players for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "ratings_write" on skill_ratings for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "peladas_write" on peladas for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "pp_write" on pelada_players for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "matches_write" on matches for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "mp_write" on match_players for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "goals_write" on goals for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "fh_write" on forma_history for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));
create policy "subs_write" on substitutions for all to authenticated
  using (my_role() in ('organizador','auxiliar'))
  with check (my_role() in ('organizador','auxiliar'));

-- Scout: só organizador cria/fecha/gera links
create policy "scouts_write" on scouts for all to authenticated
  using (my_role() = 'organizador')
  with check (my_role() = 'organizador');
create policy "links_write" on scout_links for all to authenticated
  using (my_role() = 'organizador')
  with check (my_role() = 'organizador');

-- ============================================================
-- RPCs para votação sem login (Voto)
-- ============================================================

-- Dados do scout a partir do token do link (anon pode chamar)
create or replace function get_scout_by_token(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link scout_links; v_scout scouts; v_player players;
begin
  select * into v_link from scout_links where token = p_token;
  if v_link is null then return json_build_object('error', 'link_invalido'); end if;
  if v_link.used_at is not null then return json_build_object('error', 'ja_votou'); end if;
  select * into v_scout from scouts where id = v_link.scout_id;
  if v_scout.status <> 'aberto' then return json_build_object('error', 'scout_fechado'); end if;
  select * into v_player from players where id = v_scout.player_id;
  return json_build_object(
    'player_name', v_player.name,
    'nickname', v_player.nickname,
    'assigned_name', v_link.assigned_name
  );
end $$;

-- Registrar o voto (marca o link como usado)
create or replace function submit_scout_vote(p_token text, p_skills jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_link scout_links; v_scout scouts;
begin
  select * into v_link from scout_links where token = p_token for update;
  if v_link is null then return json_build_object('error', 'link_invalido'); end if;
  if v_link.used_at is not null then return json_build_object('error', 'ja_votou'); end if;
  select * into v_scout from scouts where id = v_link.scout_id;
  if v_scout.status <> 'aberto' then return json_build_object('error', 'scout_fechado'); end if;
  insert into scout_votes (scout_id, link_id, voter_name, skills)
  values (v_link.scout_id, v_link.id, v_link.assigned_name, p_skills);
  update scout_links set used_at = now() where id = v_link.id;
  return json_build_object('ok', true);
end $$;

grant execute on function get_scout_by_token(text) to anon;
grant execute on function submit_scout_vote(text, jsonb) to anon;
