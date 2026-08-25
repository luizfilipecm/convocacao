# ⚽ Convocação — Gerenciador de Pelada

Sistema web para gerenciar as peladas do grupo: cadastro de jogadores, Scout por votação,
sorteio de times equilibrados por **Forma**, cronômetro e registro de partidas com
**Anticovardia**, **Modo Rachão**, **Súmula** automática, estatísticas e rankings.

**Stack:** React + Vite + TypeScript + Tailwind · Supabase (Postgres + Auth) · Vercel

---

## 1. Configurar o Supabase (uma vez)

1. Abra o seu projeto no [Supabase](https://supabase.com/dashboard).
2. Vá em **SQL Editor → New query**, cole o conteúdo inteiro de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   Isso cria todas as tabelas, permissões (RLS) e as funções de votação sem login.
   *Já tinha rodado uma versão anterior do schema?* As migrações novas são aplicadas
   **automaticamente em cada deploy da Vercel** se a variável `SUPABASE_DB_URL` estiver
   configurada (veja abaixo). Sem ela, rode manualmente os arquivos `supabase/migration-*.sql`
   no SQL Editor.

### Migrações automáticas no deploy (recomendado)

O build roda [`scripts/migrate.mjs`](scripts/migrate.mjs), que aplica as migrações
pendentes (todas idempotentes) antes de compilar. Para ativar:

1. No Supabase: **Connect** (topo do painel) → aba **Session pooler** → copie a URI
   e substitua `[YOUR-PASSWORD]` pela senha do banco.
2. Na Vercel: projeto → **Settings → Environment Variables** → adicione
   `SUPABASE_DB_URL` com essa URI (Production e Preview) → **Redeploy**.

Sem a variável, o script apenas avisa e o build segue normalmente.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

> A service role key **não** é usada pelo app — guarde-a em segurança e não a coloque no frontend.

## 2. Rodar localmente

```bash
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Acesse http://localhost:5173 e **crie sua conta** — o primeiro usuário cadastrado
vira **Organizador** automaticamente. Os demais entram como *membro* (só leitura);
promova auxiliares mudando o campo `role` na tabela `profiles` (Table Editor)
para `auxiliar`.

> Se o cadastro pedir confirmação de email e você não quiser isso, desative em
> **Authentication → Providers → Email → Confirm email** no Supabase.

## 3. Publicar no GitHub + Vercel

```bash
git remote add origin https://github.com/SEU-USUARIO/convocacao.git
git push -u origin main
```

(Crie antes o repositório vazio `convocacao` em github.com/new.)

Na [Vercel](https://vercel.com/new): **Import** o repositório → framework *Vite*
(detectado sozinho) → em **Environment Variables** adicione
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → **Deploy**.
Todo push na branch `main` gera deploy automático.

---

## Conceitos do sistema

| Termo | Significado |
|---|---|
| **Overall** | Nota fixa de skills, definida pelo Scout — skills-chave da posição pesam mais e a aptidão ofensiva/defensiva desloca os pesos |
| **Forma** | Nota que reage a resultados (+0.3 vitória, −0.3 derrota, teto/piso de ±2 do Overall). É a que vale no sorteio |
| **Scout** | Avaliação de habilidades por votação, feita uma vez por jogador |
| **Voto** | Link de votação de Scout, sem login (`/votar/:token`) |
| **Anticovardia** | A partir da 4ª partida seguida em quadra, a meta de gols pra continuar sobe (3, 4, 5…) |
| **Modo Rachão** | Fim de pelada: times livres, sem limite de tempo, estatísticas continuam contando |
| **Súmula** | Resumo automático do dia em linguagem de pelada |

### Regras implementadas

- **Partida:** até 2 gols ou 10 minutos (com botão de pausa); ao bater a meta de gols
  o sistema *sugere* encerrar num popup (o gol pode ser anulado); pênaltis só no empate
  da 1ª partida do dia; nas demais, a vantagem do empate é de quem está em quadra.
  Ao encerrar, a próxima partida já aparece montada (quem ficou × quem estava de fora),
  com as escalações e dropdown de troca por atleta.
- **Sorteio:** sempre 3 times de 7 (1 goleiro + 6 na linha, máx. 21 vagas; excedente vira
  extra), prioridade: 1 por posição em cada time → equilíbrio de Forma média →
  +1 defensor, depois +1 meia → livre.
- **Seleção dos atletas do dia:** mensalistas primeiro, depois quem mais participou das
  últimas 5 peladas, depois ordem alfabética.
- **Ajustes do organizador:** em partidas encerradas dá pra editar/apagar gols e
  assistências, adicionar gols e apagar a partida inteira — placar, resultado e Forma
  são recalculados (e revertidos) automaticamente.
- **Categorias (cores padronizadas no app inteiro):** Mensalista (azul, promoção manual),
  Frequente (verde), Convidado (laranja), Turista (amarelo). Exceto Mensalista, a categoria
  é automática pelas últimas 6 sessões, recalculada ao encerrar cada sessão:
  0 presenças = Turista · 1 a 3 = Convidado · 4+ = Frequente.
- **Substituições:** trocar dois atletas abre a escolha entre permanente (trocam de time)
  ou temporária (voltam aos times originais quando a partida acaba). Tirar alguém do time
  deixa a vaga aberta na escalação para colocar outro atleta.
- **Cadastro:** aviso de nome ou apelido repetido para evitar atleta duplicado.
- **Scout de jogador novo:** avaliação simples no cadastro; na 3ª presença o sistema
  libera o Scout por votação com sugestão de notas baseada no desempenho.
- **Avaliações de skill são registros datados** — editar nota nunca altera o histórico.
- **Forma auditável** — cada mudança fica em `forma_history` (nota anterior, nova e partida).

## Estrutura

```
supabase/schema.sql      # todo o banco: tabelas, RLS, RPCs de votação
src/lib/                 # overall/forma, sorteio, estatísticas, súmula
src/pages/               # telas (login, jogadores, scouts, peladas, rankings)
src/components/          # layout, editor de skills, badges
```
