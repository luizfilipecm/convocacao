import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeOverall, FORMA_RANGE } from '../lib/overall'
import { aggregateStats, emptyStats } from '../lib/stats'
import {
  APTITUDE_LABELS, CATEGORIES, CATEGORY_LABELS, POSITIONS, POSITION_LABELS, SKILLS,
  type Goal, type Match, type MatchPlayer, type Player, type Position,
  type Scout, type SkillRating, type Skills,
} from '../lib/types'
import SkillEditor, { defaultSkills } from '../components/SkillEditor'
import { CategoryBadge } from '../components/PlayerBadges'

export default function JogadorDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canEdit, isOrganizador, profile } = useAuth()
  const [player, setPlayer] = useState<Player | null>(null)
  const [ratings, setRatings] = useState<SkillRating[]>([])
  const [presencas, setPresencas] = useState(0)
  const [scout, setScout] = useState<Scout | null>(null)
  const [mp, setMp] = useState<MatchPlayer[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [formaHist, setFormaHist] = useState<{ old_forma: number; new_forma: number; delta: number; created_at: string }[]>([])
  const [editSkills, setEditSkills] = useState<Skills | null>(null)
  const [editData, setEditData] = useState(false)

  async function load() {
    if (!id) return
    const [p, r, pp, sc, mpr, fh] = await Promise.all([
      supabase.from('players').select('*').eq('id', id).single(),
      supabase.from('skill_ratings').select('*').eq('player_id', id).order('created_at', { ascending: false }),
      supabase.from('pelada_players').select('id', { count: 'exact', head: true }).eq('player_id', id),
      supabase.from('scouts').select('*').eq('player_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('match_players').select('*').eq('player_id', id),
      supabase.from('forma_history').select('old_forma,new_forma,delta,created_at').eq('player_id', id).order('created_at', { ascending: false }).limit(10),
    ])
    setPlayer(p.data as Player)
    setRatings((r.data as SkillRating[]) ?? [])
    setPresencas(pp.count ?? 0)
    setScout((sc.data?.[0] as Scout) ?? null)
    const mps = (mpr.data as MatchPlayer[]) ?? []
    setMp(mps)
    setFormaHist(fh.data ?? [])
    if (mps.length) {
      const matchIds = mps.map(m => m.match_id)
      const [ms, gs] = await Promise.all([
        supabase.from('matches').select('*').in('id', matchIds),
        supabase.from('goals').select('*').in('match_id', matchIds),
      ])
      setMatches((ms.data as Match[]) ?? [])
      setGoals((gs.data as Goal[]) ?? [])
    }
  }
  useEffect(() => { load() }, [id])

  const stats = useMemo(() => {
    const all = aggregateStats(matches, mp, goals)
    return all.get(id!) ?? emptyStats()
  }, [matches, mp, goals, id])

  if (!player) return <p className="text-zinc-500">Carregando…</p>

  const latestSkills: Skills = ratings[0]?.skills ?? defaultSkills()
  const desempenho = player.forma != null && player.overall != null
    ? Math.round((player.forma - player.overall) * 10) / 10
    : null

  async function saveNewRating() {
    if (!editSkills || !player) return
    const overall = computeOverall(editSkills, player.aptitude, player.position1, player.position2)
    // Forma se mantém, mas re-ancorada no teto/piso do novo Overall
    const forma = Math.min(overall + FORMA_RANGE, Math.max(overall - FORMA_RANGE, player.forma ?? overall))
    await supabase.from('skill_ratings').insert({
      player_id: player.id, source: 'ajuste', skills: editSkills, overall, created_by: profile?.id,
    })
    await supabase.from('players').update({ overall, forma: Math.round(forma * 10) / 10 }).eq('id', player.id)
    setEditSkills(null)
    load()
  }

  async function saveData(form: { nickname: string; position1: Position; position2: Position; aptitude: number; category: Player['category'] }) {
    if (!player) return
    const updates: Record<string, unknown> = {
      nickname: form.nickname || null,
      position1: form.position1, position2: form.position2,
      aptitude: form.aptitude,
    }
    if (isOrganizador) updates.category = form.category
    const mudouCalculo = form.aptitude !== player.aptitude
      || form.position1 !== player.position1 || form.position2 !== player.position2
    if (mudouCalculo && ratings[0]) {
      // aptidão/posições mudaram → recalcula overall da avaliação vigente (vale só daqui pra frente)
      updates.overall = computeOverall(ratings[0].skills, form.aptitude, form.position1, form.position2)
    }
    await supabase.from('players').update(updates).eq('id', player.id)
    setEditData(false)
    load()
  }

  async function abrirScout() {
    if (!player) return
    // Sugestão: skills atuais ajustadas pelo desempenho (resultados + forma vs overall)
    const winAdj = stats.jogos ? ((stats.vitorias - stats.derrotas) / stats.jogos) * 1.5 : 0
    const formaAdj = desempenho ?? 0
    const adj = Math.round((winAdj + formaAdj / 2) * 2) / 2
    const suggested = Object.fromEntries(
      SKILLS.map(s => [s, Math.min(10, Math.max(1, Math.round(latestSkills[s] + adj)))]),
    )
    const { data, error } = await supabase.from('scouts')
      .insert({ player_id: player.id, suggested }).select().single()
    if (error) { alert('Erro: ' + error.message); return }
    navigate(`/scouts/${(data as Scout).id}`)
  }

  async function desativar() {
    if (!confirm(`Desativar ${player!.name}? Ele some das listas mas o histórico fica.`)) return
    await supabase.from('players').update({ active: false }).eq('id', player!.id)
    navigate('/jogadores')
  }

  const teveScout = ratings.some(r => r.source === 'scout') || !!scout

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {player.name}
            {player.nickname && <span className="ml-2 text-lg font-normal text-zinc-500">“{player.nickname}”</span>}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <CategoryBadge category={player.category} />
            {player.is_goleiro_avulso && <span className="text-sm">🧤 Goleiro de aluguel</span>}
            <span className="text-sm text-zinc-500">
              {POSITION_LABELS[player.position1]}
              {player.position2 !== player.position1 && ` / ${POSITION_LABELS[player.position2]}`}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Aptidão: {APTITUDE_LABELS[player.aptitude]} · {presencas} presença(s)</p>
        </div>
        <div className="flex gap-3 text-center">
          <div className="rounded-xl bg-zinc-800 px-4 py-2 text-white">
            <p className="text-[10px] uppercase opacity-70">Overall</p>
            <p className="text-2xl font-bold">{player.overall ?? '—'}</p>
          </div>
          <div className="rounded-xl bg-emerald-600 px-4 py-2 text-white">
            <p className="text-[10px] uppercase opacity-70">Forma</p>
            <p className="text-2xl font-bold">{player.forma ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-bold">Estatísticas</h2>
        <div className="grid grid-cols-4 gap-2 text-center sm:grid-cols-8">
          {[
            ['Jogos', stats.jogos], ['V', stats.vitorias], ['E', stats.empates], ['D', stats.derrotas],
            ['Gols', stats.gols], ['Assist.', stats.assistencias], ['S/ sofrer', stats.cleanSheets], ['Contra', stats.golsContra],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-zinc-50 py-2">
              <p className="text-lg font-bold">{v}</p>
              <p className="text-xs text-zinc-500">{l}</p>
            </div>
          ))}
        </div>
        {desempenho != null && (
          <p className="mt-3 text-sm">
            Desempenho vs. Overall:{' '}
            <b className={desempenho > 0 ? 'text-emerald-600' : desempenho < 0 ? 'text-red-600' : ''}>
              {desempenho > 0 ? '+' : ''}{desempenho}
            </b>
            {desempenho > 0.5 ? ' — rendendo acima da nota 📈' : desempenho < -0.5 ? ' — devendo em quadra 📉' : ' — na média'}
          </p>
        )}
      </div>

      {isOrganizador && !teveScout && (
        <div className="card border-l-4 border-blue-500">
          <h2 className="font-bold">Scout por votação</h2>
          {presencas >= 3 ? (
            <>
              <p className="my-2 text-sm text-zinc-600">
                Jogador já tem {presencas} presenças — Scout liberado, com sugestão de notas baseada no desempenho.
              </p>
              <button className="btn-primary" onClick={abrirScout}>Abrir Scout</button>
            </>
          ) : (
            <p className="my-2 text-sm text-zinc-500">
              O Scout de verdade libera na 3ª presença ({presencas}/3). Por enquanto vale a avaliação simples inicial.
            </p>
          )}
        </div>
      )}
      {scout && (
        <div className="card border-l-4 border-blue-500 flex items-center justify-between">
          <p className="text-sm">Scout {scout.status === 'aberto' ? 'em andamento' : 'fechado'}</p>
          <button className="btn-secondary" onClick={() => navigate(`/scouts/${scout.id}`)}>Ver Scout</button>
        </div>
      )}

      {canEdit && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Skills (avaliação vigente)</h2>
            {!editSkills && (
              <button className="btn-secondary" onClick={() => setEditSkills({ ...latestSkills })}>
                Nova avaliação
              </button>
            )}
          </div>
          {editSkills ? (
            <>
              <p className="text-xs text-zinc-500">
                Isso cria um novo registro datado — o histórico anterior não é alterado e as estatísticas passadas ficam intactas.
              </p>
              <SkillEditor skills={editSkills} onChange={setEditSkills} />
              <p className="text-sm">Novo Overall: <b>{computeOverall(editSkills, player.aptitude, player.position1, player.position2)}</b></p>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={saveNewRating}>Salvar avaliação</button>
                <button className="btn-secondary" onClick={() => setEditSkills(null)}>Cancelar</button>
              </div>
            </>
          ) : (
            <SkillEditor skills={latestSkills} onChange={() => {}} disabled />
          )}
        </div>
      )}

      {canEdit && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Dados do jogador</h2>
            <button className="btn-secondary" onClick={() => setEditData(!editData)}>{editData ? 'Fechar' : 'Editar'}</button>
          </div>
          {editData && <EditDataForm player={player} isOrganizador={isOrganizador} onSave={saveData} />}
          {isOrganizador && (
            <button className="btn-danger" onClick={desativar}>Desativar jogador</button>
          )}
        </div>
      )}

      {formaHist.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">Histórico de Forma (auditoria)</h2>
          <ul className="space-y-1 text-sm">
            {formaHist.map((h, i) => (
              <li key={i} className="flex justify-between border-b border-zinc-100 py-1 last:border-0">
                <span>{new Date(h.created_at).toLocaleDateString('pt-BR')} — {h.old_forma} → {h.new_forma}</span>
                <b className={h.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {h.delta > 0 ? '+' : ''}{h.delta}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-bold">Histórico de avaliações</h2>
        <ul className="space-y-1 text-sm">
          {ratings.map(r => (
            <li key={r.id} className="flex justify-between border-b border-zinc-100 py-1 last:border-0">
              <span>{new Date(r.created_at).toLocaleDateString('pt-BR')} — {r.source === 'inicial' ? 'Avaliação inicial' : r.source === 'scout' ? 'Scout' : 'Ajuste'}</span>
              <b>Overall {r.overall}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function EditDataForm({
  player, isOrganizador, onSave,
}: {
  player: Player
  isOrganizador: boolean
  onSave: (f: { nickname: string; position1: Position; position2: Position; aptitude: number; category: Player['category'] }) => void
}) {
  const [nickname, setNickname] = useState(player.nickname ?? '')
  const [position1, setPosition1] = useState(player.position1)
  const [position2, setPosition2] = useState(player.position2)
  const [aptitude, setAptitude] = useState(player.aptitude)
  const [category, setCategory] = useState(player.category)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Apelido</label>
        <input className="input" value={nickname} onChange={e => setNickname(e.target.value)} />
      </div>
      <div>
        <label className="label">Categoria {!isOrganizador && '(só organizador altera)'}</label>
        <select className="input" value={category} disabled={!isOrganizador}
          onChange={e => setCategory(e.target.value as Player['category'])}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Posição 1</label>
        <select className="input" value={position1} onChange={e => setPosition1(e.target.value as Position)}>
          {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Posição 2</label>
        <select className="input" value={position2} onChange={e => setPosition2(e.target.value as Position)}>
          {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Aptidão: {APTITUDE_LABELS[aptitude]}</label>
        <input type="range" min={1} max={5} value={aptitude}
          onChange={e => setAptitude(Number(e.target.value))} className="w-full accent-emerald-600" />
      </div>
      <div>
        <button className="btn-primary" onClick={() => onSave({ nickname, position1, position2, aptitude, category })}>
          Salvar dados
        </button>
      </div>
    </div>
  )
}
