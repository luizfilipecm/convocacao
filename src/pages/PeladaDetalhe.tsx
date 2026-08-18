import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { applyFormaDelta, clampForma } from '../lib/overall'
import { sortearTimes } from '../lib/sorteio'
import { gerarSumula } from '../lib/sumula'
import {
  TEAM_COLORS, TEAM_NAMES,
  type Goal, type Match, type MatchPlayer, type Pelada, type PeladaPlayer, type Player,
} from '../lib/types'

const MATCH_SECONDS = 600 // 10 minutos

export default function PeladaDetalhe() {
  const { id } = useParams()
  const { canEdit, isOrganizador } = useAuth()
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [pps, setPps] = useState<PeladaPlayer[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([])
  const [ultimas5, setUltimas5] = useState<Map<string, number>>(new Map())
  const [showPresenca, setShowPresenca] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [goalModal, setGoalModal] = useState<{ match: Match; team: number; goal?: Goal } | null>(null)
  const [metaModal, setMetaModal] = useState<Match | null>(null)
  const [penaltiModal, setPenaltiModal] = useState<Match | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [novoA, setNovoA] = useState(1)
  const [novoB, setNovoB] = useState(2)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    const [pe, pl, pp, ms] = await Promise.all([
      supabase.from('peladas').select('*').eq('id', id).single(),
      supabase.from('players').select('*').order('name'),
      supabase.from('pelada_players').select('*').eq('pelada_id', id),
      supabase.from('matches').select('*').eq('pelada_id', id).order('ordem'),
    ])
    const peladaData = pe.data as Pelada
    setPelada(peladaData)
    setPlayers((pl.data as Player[]) ?? [])
    setPps((pp.data as PeladaPlayer[]) ?? [])
    const mList = (ms.data as Match[]) ?? []
    setMatches(mList)
    if (mList.length) {
      const ids = mList.map(m => m.id)
      const [gs, mp] = await Promise.all([
        supabase.from('goals').select('*').in('match_id', ids).order('created_at'),
        supabase.from('match_players').select('*').in('match_id', ids),
      ])
      setGoals((gs.data as Goal[]) ?? [])
      setMatchPlayers((mp.data as MatchPlayer[]) ?? [])
    } else {
      setGoals([]); setMatchPlayers([])
    }
    // Presenças nas últimas 5 peladas (para ordenar a lista de seleção do dia)
    if (peladaData) {
      const { data: prev } = await supabase.from('peladas')
        .select('id').neq('id', id).lte('date', peladaData.date)
        .order('date', { ascending: false }).limit(5)
      const prevIds = (prev ?? []).map(p => p.id)
      if (prevIds.length) {
        const { data: pres } = await supabase.from('pelada_players')
          .select('player_id').in('pelada_id', prevIds)
        const counts = new Map<string, number>()
        for (const r of pres ?? []) counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1)
        setUltimas5(counts)
      }
    }
  }
  useEffect(() => { load() }, [id])

  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const presentes = useMemo(() => pps.map(pp => byId.get(pp.player_id)).filter(Boolean) as Player[], [pps, byId])
  const teamOf = (t: number) => pps.filter(pp => pp.team === t)
  const extras = pps.filter(pp => pp.team == null)
  const sorteado = pps.some(pp => pp.team != null)
  const currentMatch = matches.find(m => m.status === 'em_andamento')
  const finished = matches.filter(m => m.status === 'encerrada')
  const aberta = pelada?.status === 'aberta'
  const nome = (pid: string | null) => {
    if (!pid) return '?'
    const p = byId.get(pid)
    return p ? (p.nickname || p.name) : '?'
  }

  // Mensalistas primeiro, depois quem mais jogou nas últimas 5 peladas, depois alfabético
  const listaPresenca = useMemo(() => {
    return players.filter(p => p.active).sort((a, b) => {
      const ma = a.category === 'mensalista' ? 0 : 1
      const mb = b.category === 'mensalista' ? 0 : 1
      if (ma !== mb) return ma - mb
      const ca = ultimas5.get(a.id) ?? 0
      const cb = ultimas5.get(b.id) ?? 0
      if (ca !== cb) return cb - ca
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [players, ultimas5])

  // ---------- Presença ----------
  async function togglePresenca(playerId: string) {
    const existing = pps.find(pp => pp.player_id === playerId)
    if (existing) await supabase.from('pelada_players').delete().eq('id', existing.id)
    else await supabase.from('pelada_players').insert({ pelada_id: id, player_id: playerId })
    load()
  }

  // ---------- Sorteio ----------
  async function sortear() {
    if (currentMatch) { alert('Encerre a partida em andamento antes de ressortear.'); return }
    if (sorteado && !confirm('Ressortear os times? A configuração atual será substituída.')) return
    setBusy(true)
    try {
      const result = sortearTimes(presentes)
      setWarnings(result.warnings)
      const updates = pps.map(pp => {
        let team: number | null = null
        for (const t of [1, 2, 3]) {
          if (result.teams[t].some(p => p.id === pp.player_id)) { team = t; break }
        }
        return supabase.from('pelada_players').update({ team, is_extra: team == null }).eq('id', pp.id)
      })
      await Promise.all(updates)
      load()
    } finally { setBusy(false) }
  }

  // ---------- Troca de jogador (substituição / Rachão) ----------
  async function trocar(pp: PeladaPlayer, alvo: string) {
    if (alvo === 'fora') {
      await supabase.from('pelada_players').update({ team: null, is_extra: true }).eq('id', pp.id)
      await supabase.from('substitutions').insert({
        pelada_id: id, match_id: currentMatch?.id ?? null,
        team: pp.team, out_player: pp.player_id, in_player: null,
      })
    } else {
      const other = pps.find(o => o.id === alvo)
      if (!other) return
      const t1 = pp.team, t2 = other.team
      await Promise.all([
        supabase.from('pelada_players').update({ team: t2, is_extra: t2 == null }).eq('id', pp.id),
        supabase.from('pelada_players').update({ team: t1, is_extra: t1 == null }).eq('id', other.id),
      ])
      await supabase.from('substitutions').insert({
        pelada_id: id, match_id: currentMatch?.id ?? null,
        team: t2, in_player: other.player_id, out_player: pp.player_id,
      })
      // Quem entra num time que está jogando agora passa a contar estatística da partida
      if (currentMatch) {
        const playing = [currentMatch.team_a, currentMatch.team_b]
        const upserts: { match_id: string; player_id: string; team: number }[] = []
        if (t2 != null && playing.includes(t2)) upserts.push({ match_id: currentMatch.id, player_id: pp.player_id, team: t2 })
        if (t1 != null && playing.includes(t1)) upserts.push({ match_id: currentMatch.id, player_id: other.player_id, team: t1 })
        if (upserts.length) {
          await supabase.from('match_players').upsert(upserts, { onConflict: 'match_id,player_id' })
        }
      }
    }
    load()
  }

  // ---------- Partidas ----------
  function proximaInfo() {
    const last = finished[finished.length - 1]
    if (!last?.fica) return { sugA: 1, sugB: 2 }
    const foraDoJogo = [1, 2, 3].find(t => t !== last.team_a && t !== last.team_b) ?? 3
    return { sugA: last.fica, sugB: foraDoJogo }
  }

  useEffect(() => {
    const { sugA, sugB } = proximaInfo()
    setNovoA(sugA); setNovoB(sugB)
  }, [matches.length])

  function streakDe(team: number): number {
    const last = finished[finished.length - 1]
    if (!last || last.fica !== team) return 1
    const prevStreak = last.fica === last.team_a ? last.streak_a : last.streak_b
    return prevStreak + 1
  }
  const metaDe = (streak: number) => (streak >= 4 ? streak - 1 : 2)

  async function iniciarPartida() {
    if (novoA === novoB) { alert('Escolha times diferentes.'); return }
    setBusy(true)
    try {
      const sA = streakDe(novoA), sB = streakDe(novoB)
      const { data, error } = await supabase.from('matches').insert({
        pelada_id: id, ordem: matches.length + 1,
        team_a: novoA, team_b: novoB,
        streak_a: sA, streak_b: sB,
        meta_a: metaDe(sA), meta_b: metaDe(sB),
      }).select().single()
      if (error || !data) { alert('Erro: ' + error?.message); return }
      const m = data as Match
      const roster = pps
        .filter(pp => pp.team === novoA || pp.team === novoB)
        .map(pp => ({ match_id: m.id, player_id: pp.player_id, team: pp.team! }))
      if (roster.length) await supabase.from('match_players').insert(roster)
      load()
    } finally { setBusy(false) }
  }

  async function pausar(m: Match) {
    await supabase.from('matches').update({ paused_at: new Date().toISOString() }).eq('id', m.id)
    load()
  }

  async function retomar(m: Match) {
    if (!m.paused_at) return
    const extra = Math.round((Date.now() - new Date(m.paused_at).getTime()) / 1000)
    await supabase.from('matches')
      .update({ paused_at: null, paused_total_seg: m.paused_total_seg + extra })
      .eq('id', m.id)
    load()
  }

  async function registrarGol(match: Match, teamCredito: number, scorerId: string | null, assistId: string | null, ownGoal: boolean) {
    await supabase.from('goals').insert({
      match_id: match.id, pelada_id: id, team: teamCredito,
      scorer_id: scorerId, assist_id: assistId, own_goal: ownGoal,
    })
    setGoalModal(null)
    if (match.status === 'encerrada') {
      // ajuste manual do organizador em partida já encerrada
      await recomputarPartida(match.id)
      return
    }
    const isA = teamCredito === match.team_a
    const newScore = (isA ? match.score_a : match.score_b) + 1
    await supabase.from('matches').update(isA ? { score_a: newScore } : { score_b: newScore }).eq('id', match.id)
    const meta = isA ? match.meta_a : match.meta_b
    const updated = { ...match, [isA ? 'score_a' : 'score_b']: newScore } as Match
    if (newScore >= meta) {
      // não encerra sozinho: o gol pode ser anulado
      setMetaModal(updated)
    }
    load()
  }

  async function salvarEdicaoGol(goal: Goal, scorerId: string | null, assistId: string | null, ownGoal: boolean) {
    await supabase.from('goals').update({ scorer_id: scorerId, assist_id: assistId, own_goal: ownGoal }).eq('id', goal.id)
    setGoalModal(null)
    const match = matches.find(m => m.id === goal.match_id)
    if (match?.status === 'encerrada') await recomputarPartida(match.id)
    load()
  }

  async function desfazerGol(g: Goal) {
    const match = matches.find(m => m.id === g.match_id)
    if (!match) return
    await supabase.from('goals').delete().eq('id', g.id)
    if (match.status === 'encerrada') {
      await recomputarPartida(match.id)
    } else {
      const isA = g.team === match.team_a
      await supabase.from('matches')
        .update(isA ? { score_a: match.score_a - 1 } : { score_b: match.score_b - 1 })
        .eq('id', match.id)
    }
    load()
  }

  async function encerrarPorTempo(match: Match) {
    if (match.score_a === match.score_b && match.ordem === 1) {
      setPenaltiModal(match) // só a 1ª partida do dia tem pênaltis
      return
    }
    await finalizarPartida(match)
  }

  // ---------- Forma (aplicar / reverter) ----------
  async function aplicarForma(matchId: string, winner: number) {
    const { data: mpData } = await supabase.from('match_players').select('*').eq('match_id', matchId)
    for (const mp of (mpData as MatchPlayer[]) ?? []) {
      const { data: p } = await supabase.from('players').select('forma, overall').eq('id', mp.player_id).single()
      if (!p || p.forma == null || p.overall == null) continue
      const result = mp.team === winner ? 'vitoria' as const : 'derrota' as const
      const nova = applyFormaDelta(p.forma, p.overall, result)
      if (nova === p.forma) continue
      await supabase.from('players').update({ forma: nova }).eq('id', mp.player_id)
      await supabase.from('forma_history').insert({
        player_id: mp.player_id, match_id: matchId,
        old_forma: p.forma, new_forma: nova,
        delta: Math.round((nova - p.forma) * 10) / 10,
      })
    }
  }

  async function reverterForma(matchId: string) {
    const { data: fh } = await supabase.from('forma_history').select('*').eq('match_id', matchId)
    for (const h of fh ?? []) {
      const { data: p } = await supabase.from('players').select('forma, overall').eq('id', h.player_id).single()
      if (!p || p.forma == null || p.overall == null) continue
      await supabase.from('players')
        .update({ forma: clampForma(p.forma - h.delta, p.overall) })
        .eq('id', h.player_id)
    }
    await supabase.from('forma_history').delete().eq('match_id', matchId)
  }

  async function finalizarPartida(match: Match, penaltiWinner?: number) {
    setBusy(true)
    try {
      const { score_a, score_b, team_a, team_b, streak_a, streak_b, meta_a, meta_b } = match
      const winner = score_a > score_b ? team_a : score_b > score_a ? team_b : null
      const inQuadra = streak_a >= streak_b ? team_a : team_b
      const outro = (t: number) => (t === team_a ? team_b : team_a)

      let fica: number
      if (winner != null) {
        const wMeta = winner === team_a ? meta_a : meta_b
        const wScore = winner === team_a ? score_a : score_b
        // Anticovardia: com meta elevada, precisa bater a meta pra continuar
        fica = wMeta > 2 && wScore < wMeta ? outro(winner) : winner
      } else if (penaltiWinner != null) {
        fica = penaltiWinner
      } else {
        const iqMeta = inQuadra === team_a ? meta_a : meta_b
        // vantagem do empate é de quem está em quadra, salvo Anticovardia ativa
        fica = iqMeta > 2 ? outro(inQuadra) : inQuadra
      }

      const pausado = match.paused_total_seg
        + (match.paused_at ? Math.round((Date.now() - new Date(match.paused_at).getTime()) / 1000) : 0)
      const duracao = Math.max(0, Math.min(
        MATCH_SECONDS + 120,
        Math.round((Date.now() - new Date(match.started_at).getTime()) / 1000) - pausado,
      ))
      await supabase.from('matches').update({
        status: 'encerrada', winner, fica,
        penaltis: penaltiWinner != null, penalti_winner: penaltiWinner ?? null,
        paused_at: null, paused_total_seg: pausado,
        ended_at: new Date().toISOString(), duracao_seg: duracao,
      }).eq('id', match.id)

      // Forma: vitória +0.3, derrota -0.3, empate mantém (com teto/piso do Overall)
      if (winner != null) await aplicarForma(match.id, winner)

      setPenaltiModal(null)
      setMetaModal(null)
      load()
    } finally { setBusy(false) }
  }

  // ---------- Ajustes do organizador em partidas encerradas ----------
  async function recomputarPartida(matchId: string) {
    const [{ data: m }, { data: gs }] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).single(),
      supabase.from('goals').select('*').eq('match_id', matchId),
    ])
    if (!m) return
    const match = m as Match
    const list = (gs as Goal[]) ?? []
    const score_a = list.filter(g => g.team === match.team_a).length
    const score_b = list.filter(g => g.team === match.team_b).length
    const winner = score_a > score_b ? match.team_a : score_b > score_a ? match.team_b : null
    await reverterForma(matchId)
    await supabase.from('matches').update({ score_a, score_b, winner }).eq('id', matchId)
    if (winner != null) await aplicarForma(matchId, winner)
    load()
  }

  async function apagarPartida(m: Match) {
    if (!confirm(`Apagar a ${m.ordem}ª partida (${TEAM_NAMES[m.team_a]} ${m.score_a}×${m.score_b} ${TEAM_NAMES[m.team_b]})?\n\nGols, assistências e estatísticas dela somem, e a Forma dos jogadores é revertida.`)) return
    setBusy(true)
    try {
      await reverterForma(m.id)
      await supabase.from('matches').delete().eq('id', m.id)
      load()
    } finally { setBusy(false) }
  }

  // ---------- Rachão / Encerramento ----------
  async function toggleRachao() {
    await supabase.from('peladas').update({ rachao: !pelada!.rachao }).eq('id', pelada!.id)
    load()
  }

  async function encerrarPelada() {
    if (currentMatch) { alert('Encerre a partida em andamento primeiro.'); return }
    if (!confirm('Encerrar a pelada e gerar a Súmula do dia?')) return
    setBusy(true)
    try {
      let sumula = gerarSumula(pelada!.date, players, matches, matchPlayers, goals)

      // Regra automática: convidado com 4+ presenças nas últimas 10 peladas vira frequente
      const { data: ultimas } = await supabase.from('peladas')
        .select('id').order('date', { ascending: false }).limit(10)
      const peladaIds = (ultimas ?? []).map(p => p.id)
      const { data: presAll } = await supabase.from('pelada_players')
        .select('player_id, pelada_id').in('pelada_id', peladaIds)
      const counts = new Map<string, number>()
      for (const pr of presAll ?? []) counts.set(pr.player_id, (counts.get(pr.player_id) ?? 0) + 1)
      const promovidos: string[] = []
      for (const p of players) {
        if (p.category === 'convidado' && (counts.get(p.id) ?? 0) >= 4) {
          await supabase.from('players').update({ category: 'frequente' }).eq('id', p.id)
          promovidos.push(p.nickname || p.name)
        }
      }
      if (promovidos.length) {
        sumula += `\n\n📋 Promoção automática: ${promovidos.join(', ')} agora é/são Frequente(s) (4+ presenças nas últimas 10).`
      }

      await supabase.from('peladas').update({ status: 'encerrada', sumula }).eq('id', pelada!.id)
      load()
    } finally { setBusy(false) }
  }

  if (!pelada) return <p className="text-zinc-500">Carregando…</p>

  const fmt = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }
  const matchGoals = (mId: string) => goals.filter(g => g.match_id === mId)
  const rosterOf = (m: Match, t: number) => matchPlayers.filter(mp => mp.match_id === m.id && mp.team === t)
  const podeTrocar = canEdit && aberta

  const metaTime = metaModal
    ? (metaModal.score_a >= metaModal.meta_a ? metaModal.team_a : metaModal.team_b)
    : null

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Pelada {fmt(pelada.date)}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${aberta ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'}`}>
              {aberta ? 'Em andamento' : 'Encerrada'}
            </span>
            {pelada.rachao && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">🔥 Modo Rachão</span>}
          </div>
        </div>
        {canEdit && aberta && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={toggleRachao}>
              {pelada.rachao ? 'Desativar Rachão' : '🔥 Modo Rachão'}
            </button>
            <button className="btn-danger" onClick={encerrarPelada} disabled={busy}>Encerrar pelada</button>
          </div>
        )}
      </div>

      {/* Súmula */}
      {pelada.sumula && (
        <div className="card border-l-4 border-amber-500">
          <h2 className="mb-2 font-bold">📜 Súmula</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm">{pelada.sumula}</pre>
        </div>
      )}

      {/* Presença */}
      {canEdit && aberta && (
        <div className="card">
          <button className="flex w-full items-center justify-between font-bold" onClick={() => setShowPresenca(!showPresenca)}>
            <span>✅ Presença ({pps.length} confirmado(s))</span>
            <span>{showPresenca ? '▲' : '▼'}</span>
          </button>
          {showPresenca && (
            <>
              <p className="mt-2 text-xs text-zinc-400">
                Ordem: mensalistas → mais presentes nas últimas 5 peladas → alfabética
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                {listaPresenca.map(p => {
                  const marcado = pps.some(pp => pp.player_id === p.id)
                  const c5 = ultimas5.get(p.id) ?? 0
                  return (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm ${marcado ? 'bg-emerald-50' : ''}`}>
                      <input type="checkbox" checked={marcado} onChange={() => togglePresenca(p.id)} className="accent-emerald-600" />
                      <span className="flex-1">
                        {p.category === 'mensalista' && '⭐ '}
                        {p.nickname || p.name}
                        {p.is_goleiro_avulso && ' 🧤'}
                      </span>
                      {c5 > 0 && <span className="text-xs text-zinc-400">{c5}/5</span>}
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sorteio / Times */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Times</h2>
          {canEdit && aberta && pps.length >= 3 && (
            <button className="btn-primary" onClick={sortear} disabled={busy}>
              {sorteado ? '🔁 Ressortear' : '🎲 Sortear times'}
            </button>
          )}
        </div>
        {warnings.map((w, i) => (
          <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {w}</p>
        ))}
        {sorteado ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map(t => {
              const list = teamOf(t)
              const media = list.length
                ? Math.round(list.reduce((s, pp) => s + (byId.get(pp.player_id)?.forma ?? 0), 0) / list.length * 10) / 10
                : 0
              return (
                <div key={t} className="card overflow-hidden p-0">
                  <div className={`flex items-center justify-between px-3 py-2 text-sm font-bold ${TEAM_COLORS[t]}`}>
                    <span>{TEAM_NAMES[t]}</span>
                    <span className="text-xs font-normal">Forma média {media}</span>
                  </div>
                  <Escalacao team={t} pps={pps} byId={byId} nome={nome} podeTrocar={podeTrocar} onTrocar={trocar} />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Confirme as presenças e sorteie os times.</p>
        )}
        {extras.length > 0 && sorteado && (
          <div className="card">
            <h3 className="mb-1 text-sm font-bold text-zinc-600">Extras / fora</h3>
            <ul className="divide-y divide-zinc-100 text-sm">
              {extras.map(pp => (
                <li key={pp.id} className="flex items-center justify-between py-1.5">
                  <span>{nome(pp.player_id)}</span>
                  {podeTrocar && <TrocarSelect pp={pp} pps={pps} nome={nome} onTrocar={trocar} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Partida em andamento */}
      {currentMatch && (
        <div className="card space-y-3 border-2 border-emerald-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">⏱️ Partida {currentMatch.ordem}</h2>
            <div className="flex items-center gap-2">
              <Cronometro match={currentMatch} />
              {canEdit && (currentMatch.paused_at
                ? <button className="btn-primary" onClick={() => retomar(currentMatch)}>▶ Retomar</button>
                : <button className="btn-secondary" onClick={() => pausar(currentMatch)}>⏸ Pausar</button>
              )}
            </div>
          </div>
          <div className="flex items-start justify-center gap-4">
            {[
              { t: currentMatch.team_a, score: currentMatch.score_a, meta: currentMatch.meta_a, streak: currentMatch.streak_a },
              { t: currentMatch.team_b, score: currentMatch.score_b, meta: currentMatch.meta_b, streak: currentMatch.streak_b },
            ].map(({ t, score, meta, streak }) => (
              <div key={t} className="flex-1 text-center">
                <p className={`mx-auto w-fit rounded-full px-3 py-1 text-sm font-bold ${TEAM_COLORS[t]}`}>{TEAM_NAMES[t]}</p>
                <p className="my-1 text-4xl font-bold">{score}</p>
                <p className="text-xs text-zinc-500">
                  meta {meta} gol(s)
                  {meta > 2 && <span className="text-orange-600"> · Anticovardia ({streak}ª seguida)</span>}
                </p>
                {canEdit && (
                  <button className="btn-primary mt-1" onClick={() => setGoalModal({ match: currentMatch, team: t })}>
                    + Gol
                  </button>
                )}
                <div className="mt-2 rounded-lg bg-zinc-50 text-left">
                  <Escalacao team={t} pps={pps} byId={byId} nome={nome} podeTrocar={podeTrocar} onTrocar={trocar} compact />
                </div>
              </div>
            ))}
          </div>
          <ul className="space-y-1 text-sm">
            {matchGoals(currentMatch.id).map(g => (
              <li key={g.id} className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1">
                <span>
                  ⚽ {TEAM_NAMES[g.team]} — {g.own_goal
                    ? `gol contra de ${nome(g.scorer_id)}`
                    : `${nome(g.scorer_id)}${g.assist_id ? ` (assist. ${nome(g.assist_id)})` : ''}`}
                </span>
                {canEdit && <button className="text-xs text-red-500 hover:underline" onClick={() => desfazerGol(g)}>desfazer</button>}
              </li>
            ))}
          </ul>
          {canEdit && (
            <button className="btn-secondary w-full" onClick={() => encerrarPorTempo(currentMatch)} disabled={busy}>
              Encerrar partida (tempo esgotado)
            </button>
          )}
        </div>
      )}

      {/* Próxima partida (matchup sugerido: quem ficou × quem estava de fora) */}
      {canEdit && aberta && sorteado && !currentMatch && (
        <div className="card space-y-3">
          <h2 className="font-bold">{finished.length ? '➡️ Próxima partida' : 'Primeira partida'}</h2>
          <div className="flex items-center gap-2">
            <select className="input" value={novoA} onChange={e => setNovoA(Number(e.target.value))}>
              {[1, 2, 3].map(t => <option key={t} value={t}>{TEAM_NAMES[t]}</option>)}
            </select>
            <span className="font-bold">×</span>
            <select className="input" value={novoB} onChange={e => setNovoB(Number(e.target.value))}>
              {[1, 2, 3].map(t => <option key={t} value={t}>{TEAM_NAMES[t]}</option>)}
            </select>
            <button className="btn-primary shrink-0" onClick={iniciarPartida} disabled={busy}>▶ Iniciar</button>
          </div>
          {(() => {
            const sA = streakDe(novoA), sB = streakDe(novoB)
            return (sA >= 4 || sB >= 4) ? (
              <p className="text-xs text-orange-600">
                🔥 Anticovardia: {sA >= 4 ? `${TEAM_NAMES[novoA]} precisa de ${metaDe(sA)} gols` : `${TEAM_NAMES[novoB]} precisa de ${metaDe(sB)} gols`} pra continuar (derrota segue sendo com 2 sofridos).
              </p>
            ) : null
          })()}
          <div className="grid grid-cols-2 gap-3">
            {[novoA, novoB].map(t => (
              <div key={t} className="overflow-hidden rounded-lg border border-zinc-200">
                <p className={`px-3 py-1.5 text-sm font-bold ${TEAM_COLORS[t]}`}>{TEAM_NAMES[t]}</p>
                <Escalacao team={t} pps={pps} byId={byId} nome={nome} podeTrocar={podeTrocar} onTrocar={trocar} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de partidas */}
      {finished.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">Partidas do dia</h2>
          {isOrganizador && (
            <p className="mb-2 text-xs text-zinc-400">
              Toque numa partida para ver escalações{isOrganizador && ' e fazer ajustes manuais (editar/apagar gols, apagar partida)'}.
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {[...finished].reverse().map(m => (
              <li key={m.id} className="rounded-lg bg-zinc-50">
                <button className="w-full px-3 py-2 text-left" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                  <div className="flex items-center justify-between">
                    <span>
                      <b>{m.ordem}ª</b> — {TEAM_NAMES[m.team_a]} <b>{m.score_a} × {m.score_b}</b> {TEAM_NAMES[m.team_b]}
                      {m.penaltis && ` (pênaltis: ${TEAM_NAMES[m.penalti_winner!]})`}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {m.winner ? `venceu ${TEAM_NAMES[m.winner]}` : 'empate'} · ficou {m.fica ? TEAM_NAMES[m.fica] : '—'}
                    </span>
                  </div>
                </button>
                {expanded === m.id && (
                  <div className="space-y-3 border-t border-zinc-200 px-3 py-2">
                    {/* Gols */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Gols</p>
                      {matchGoals(m.id).length ? (
                        <ul className="space-y-1">
                          {matchGoals(m.id).map(g => (
                            <li key={g.id} className="flex items-center justify-between rounded bg-white px-2 py-1">
                              <span>
                                ⚽ {TEAM_NAMES[g.team]} — {g.own_goal
                                  ? `gol contra de ${nome(g.scorer_id)}`
                                  : `${nome(g.scorer_id)}${g.assist_id ? ` (assist. ${nome(g.assist_id)})` : ''}`}
                              </span>
                              {isOrganizador && (
                                <span className="flex gap-2 text-xs">
                                  <button className="text-blue-600 hover:underline" onClick={() => setGoalModal({ match: m, team: g.team, goal: g })}>editar</button>
                                  <button className="text-red-500 hover:underline" onClick={() => desfazerGol(g)}>apagar</button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-zinc-400">Sem gols (0×0).</p>}
                      {isOrganizador && (
                        <div className="mt-2 flex gap-2">
                          {[m.team_a, m.team_b].map(t => (
                            <button key={t} className="btn-secondary text-xs" onClick={() => setGoalModal({ match: m, team: t })}>
                              + Gol {TEAM_NAMES[t]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Escalações */}
                    <div className="grid grid-cols-2 gap-2">
                      {[m.team_a, m.team_b].map(t => (
                        <div key={t}>
                          <p className={`mb-1 w-fit rounded-full px-2 py-0.5 text-xs font-bold ${TEAM_COLORS[t]}`}>{TEAM_NAMES[t]}</p>
                          <ul className="text-xs text-zinc-600">
                            {rosterOf(m, t).map(mp => <li key={mp.player_id}>{nome(mp.player_id)}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                    {isOrganizador && (
                      <button className="btn-danger text-xs" onClick={() => apagarPartida(m)} disabled={busy}>
                        🗑 Apagar partida
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modal de gol (registro e edição) */}
      {goalModal && (
        <GoalModal
          team={goalModal.team}
          goal={goalModal.goal}
          roster={rosterOf(goalModal.match, goalModal.team)}
          rosterAdversario={rosterOf(goalModal.match, goalModal.team === goalModal.match.team_a ? goalModal.match.team_b : goalModal.match.team_a)}
          nome={nome}
          onCancel={() => setGoalModal(null)}
          onConfirm={(scorerId, assistId, ownGoal) =>
            goalModal.goal
              ? salvarEdicaoGol(goalModal.goal, scorerId, assistId, ownGoal)
              : registrarGol(goalModal.match, goalModal.team, scorerId, assistId, ownGoal)}
        />
      )}

      {/* Modal: meta de gols atingida */}
      {metaModal && metaTime != null && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="mb-2 font-bold">🎯 Meta atingida!</h3>
            <p className="mb-4 text-sm text-zinc-600">
              O time <b>{TEAM_NAMES[metaTime]}</b> chegou a{' '}
              <b>{metaTime === metaModal.team_a ? metaModal.score_a : metaModal.score_b} gol(s)</b>{' '}
              (meta: {metaTime === metaModal.team_a ? metaModal.meta_a : metaModal.meta_b}). Encerrar a partida?
            </p>
            <div className="flex flex-col gap-2">
              <button className="btn-primary" onClick={() => finalizarPartida(metaModal)} disabled={busy}>
                ✅ Encerrar partida
              </button>
              <button className="btn-secondary" onClick={() => setMetaModal(null)}>
                Seguir jogando (gol anulado etc.)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de pênaltis (1ª partida) */}
      {penaltiModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="mb-2 font-bold">Empate na 1ª partida — pênaltis!</h3>
            <p className="mb-3 text-sm text-zinc-600">Quem venceu a disputa? (o resultado segue contando como empate)</p>
            <div className="flex gap-2">
              {[penaltiModal.team_a, penaltiModal.team_b].map(t => (
                <button key={t} className={`flex-1 rounded-lg px-3 py-2 font-bold ${TEAM_COLORS[t]}`}
                  onClick={() => finalizarPartida(penaltiModal, t)}>
                  {TEAM_NAMES[t]}
                </button>
              ))}
            </div>
            <button className="btn-secondary mt-3 w-full" onClick={() => setPenaltiModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Componentes auxiliares ----------

/** Dropdown no jogador: trocar por outro atleta (de outro time, extra ou fora) */
function TrocarSelect({
  pp, pps, nome, onTrocar,
}: {
  pp: PeladaPlayer
  pps: PeladaPlayer[]
  nome: (id: string | null) => string
  onTrocar: (pp: PeladaPlayer, alvo: string) => void
}) {
  const outros = pps.filter(o => o.id !== pp.id && o.team !== pp.team)
  return (
    <select
      className="max-w-28 rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs text-zinc-500"
      value=""
      onChange={e => { if (e.target.value) onTrocar(pp, e.target.value) }}
    >
      <option value="">⇄ trocar</option>
      {pp.team != null && <option value="fora">— Tirar do time (fora)</option>}
      {outros.map(o => (
        <option key={o.id} value={o.id}>
          {nome(o.player_id)} ({o.team ? TEAM_NAMES[o.team] : 'Fora'})
        </option>
      ))}
    </select>
  )
}

/** Lista de jogadores de um time, com dropdown de troca por atleta */
function Escalacao({
  team, pps, byId, nome, podeTrocar, onTrocar, compact,
}: {
  team: number
  pps: PeladaPlayer[]
  byId: Map<string, Player>
  nome: (id: string | null) => string
  podeTrocar: boolean
  onTrocar: (pp: PeladaPlayer, alvo: string) => void
  compact?: boolean
}) {
  const list = pps.filter(pp => pp.team === team)
  return (
    <ul className={`divide-y divide-zinc-100 ${compact ? 'text-xs' : 'text-sm'}`}>
      {list.map(pp => {
        const p = byId.get(pp.player_id)
        const gk = p && (p.position1 === 'goleiro' || p.is_goleiro_avulso)
        return (
          <li key={pp.id} className={`flex items-center justify-between gap-1 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}>
            <span className="truncate">
              {gk && '🧤 '}{nome(pp.player_id)}{' '}
              {!compact && <span className="text-xs text-zinc-400">{p?.forma}</span>}
            </span>
            {podeTrocar && <TrocarSelect pp={pp} pps={pps} nome={nome} onTrocar={onTrocar} />}
          </li>
        )
      })}
      {!list.length && <li className={compact ? 'px-2 py-1 text-zinc-400' : 'px-3 py-1.5 text-zinc-400'}>—</li>}
    </ul>
  )
}

function Cronometro({ match }: { match: Match }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  const pausadoMs = match.paused_total_seg * 1000
    + (match.paused_at ? now - new Date(match.paused_at).getTime() : 0)
  const elapsed = Math.floor((now - new Date(match.started_at).getTime() - pausadoMs) / 1000)
  const remaining = MATCH_SECONDS - elapsed
  const abs = Math.abs(remaining)
  const mm = String(Math.floor(abs / 60)).padStart(2, '0')
  const ss = String(abs % 60).padStart(2, '0')
  if (match.paused_at) {
    return (
      <span className="rounded-lg bg-blue-100 px-3 py-1 font-mono text-xl font-bold text-blue-800">
        ⏸ {remaining <= 0 ? `+${mm}:${ss}` : `${mm}:${ss}`}
      </span>
    )
  }
  return (
    <span className={`rounded-lg px-3 py-1 font-mono text-xl font-bold ${remaining <= 0 ? 'animate-pulse bg-red-600 text-white' : remaining <= 60 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100'}`}>
      {remaining <= 0 ? `+${mm}:${ss}` : `${mm}:${ss}`}
    </span>
  )
}

function GoalModal({
  team, goal, roster, rosterAdversario, nome, onCancel, onConfirm,
}: {
  team: number
  goal?: Goal
  roster: MatchPlayer[]
  rosterAdversario: MatchPlayer[]
  nome: (id: string | null) => string
  onCancel: () => void
  onConfirm: (scorerId: string | null, assistId: string | null, ownGoal: boolean) => void
}) {
  const [ownGoal, setOwnGoal] = useState(goal?.own_goal ?? false)
  const [scorer, setScorer] = useState(goal?.scorer_id ?? '')
  const [assist, setAssist] = useState(goal?.assist_id ?? '')

  const scorers = ownGoal ? rosterAdversario : roster

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5">
        <h3 className="mb-3 font-bold">⚽ {goal ? 'Editar gol' : 'Gol'} do {TEAM_NAMES[team]}</h3>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ownGoal}
            onChange={e => { setOwnGoal(e.target.checked); setScorer(''); setAssist('') }}
            className="accent-red-600" />
          Foi gol contra
        </label>
        <div className="space-y-3">
          <div>
            <label className="label">{ownGoal ? 'Quem fez contra (time adversário)' : 'Quem fez o gol'}</label>
            <select className="input" value={scorer} onChange={e => setScorer(e.target.value)}>
              <option value="">— selecionar —</option>
              {scorers.map(mp => <option key={mp.player_id} value={mp.player_id}>{nome(mp.player_id)}</option>)}
            </select>
          </div>
          {!ownGoal && (
            <div>
              <label className="label">Assistência (opcional)</label>
              <select className="input" value={assist} onChange={e => setAssist(e.target.value)}>
                <option value="">Sem assistência</option>
                {roster.filter(mp => mp.player_id !== scorer).map(mp => (
                  <option key={mp.player_id} value={mp.player_id}>{nome(mp.player_id)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" disabled={!scorer}
            onClick={() => onConfirm(scorer || null, ownGoal ? null : (assist || null), ownGoal)}>
            {goal ? 'Salvar alteração' : 'Confirmar gol'}
          </button>
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
