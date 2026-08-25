import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchFisico } from '../lib/fisico'
import { sortearTimes } from '../lib/sorteio'
import {
  TEAM_COLORS, TEAM_NAMES,
  type Match, type Pelada, type PeladaPlayer, type Player,
} from '../lib/types'
import { Escalacao, TrocarSelect } from '../components/Escalacao'

export default function Times() {
  const { canEdit } = useAuth()
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [pps, setPps] = useState<PeladaPlayer[]>([])
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const { data: pe } = await supabase.from('peladas')
      .select('*').eq('status', 'aberta')
      .order('date', { ascending: false }).limit(1)
    const p = (pe?.[0] as Pelada) ?? null
    setPelada(p)
    if (p) {
      const [pl, pp, ms] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('pelada_players').select('*').eq('pelada_id', p.id),
        supabase.from('matches').select('*').eq('pelada_id', p.id).eq('status', 'em_andamento').limit(1),
      ])
      setPlayers((pl.data as Player[]) ?? [])
      setPps((pp.data as PeladaPlayer[]) ?? [])
      setCurrentMatch((ms.data?.[0] as Match) ?? null)
    }
    setLoaded(true)
  }
  useEffect(() => { load() }, [])

  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const presentes = useMemo(() => pps.map(pp => byId.get(pp.player_id)).filter(Boolean) as Player[], [pps, byId])
  const extras = pps.filter(pp => pp.team == null)
  const sorteado = pps.some(pp => pp.team != null)
  const nome = (pid: string | null) => {
    if (!pid) return '?'
    const p = byId.get(pid)
    return p ? (p.nickname || p.name) : '?'
  }

  async function sortear() {
    if (!pelada) return
    if (currentMatch) { alert('Encerre a partida em andamento antes de ressortear.'); return }
    if (sorteado && !confirm('Ressortear os times? A configuração atual será substituída.')) return
    setBusy(true)
    try {
      const fisico = await fetchFisico(presentes.map(p => p.id))
      const result = sortearTimes(presentes, fisico)
      setWarnings(result.warnings)
      const updates = pps.map(pp => {
        let team: number | null = null
        for (const t of [1, 2, 3]) {
          if (result.teams[t].some(p => p.id === pp.player_id)) { team = t; break }
        }
        return supabase.from('pelada_players').update({ team, is_extra: team == null }).eq('id', pp.id)
      })
      const results = await Promise.all(updates)
      const failed = results.find(r => r.error)
      if (failed?.error) alert('Erro ao salvar o sorteio: ' + failed.error.message)
      load()
    } finally { setBusy(false) }
  }

  async function trocar(pp: PeladaPlayer, alvo: string) {
    if (!pelada) return
    if (alvo === 'fora') {
      const { error } = await supabase.from('pelada_players').update({ team: null, is_extra: true }).eq('id', pp.id)
      if (error) alert('Erro na troca: ' + error.message)
      await supabase.from('substitutions').insert({
        pelada_id: pelada.id, match_id: currentMatch?.id ?? null,
        team: pp.team, out_player: pp.player_id, in_player: null,
      })
    } else {
      const other = pps.find(o => o.id === alvo)
      if (!other) return
      const t1 = pp.team, t2 = other.team
      const results = await Promise.all([
        supabase.from('pelada_players').update({ team: t2, is_extra: t2 == null }).eq('id', pp.id),
        supabase.from('pelada_players').update({ team: t1, is_extra: t1 == null }).eq('id', other.id),
      ])
      const failed = results.find(r => r.error)
      if (failed?.error) alert('Erro na troca: ' + failed.error.message)
      await supabase.from('substitutions').insert({
        pelada_id: pelada.id, match_id: currentMatch?.id ?? null,
        team: t2, in_player: other.player_id, out_player: pp.player_id,
      })
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

  if (!loaded) return <p className="text-zinc-500">Carregando…</p>

  if (!pelada) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Times</h1>
        <div className="card text-zinc-600">
          Nenhuma sessão de pelada aberta agora. Inicie uma em{' '}
          <Link to="/peladas" className="text-emerald-700 hover:underline">Peladas</Link>.
        </div>
      </div>
    )
  }

  const fmt = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Times</h1>
          <p className="text-sm text-zinc-500">
            Pelada de {fmt(pelada.date)} ·{' '}
            <Link to={`/peladas/${pelada.id}`} className="text-emerald-700 hover:underline">abrir painel completo</Link>
          </p>
        </div>
        {canEdit && pps.length >= 3 && (
          <button className="btn-primary" onClick={sortear} disabled={busy}>
            {sorteado ? '🔁 Ressortear' : '🎲 Sortear times'}
          </button>
        )}
      </div>

      {currentMatch && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ⏱️ Partida em andamento: {TEAM_NAMES[currentMatch.team_a]} × {TEAM_NAMES[currentMatch.team_b]} — trocas feitas aqui valem para ela.
        </p>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {w}</p>
      ))}

      {sorteado ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map(t => {
              const list = pps.filter(pp => pp.team === t)
              const media = list.length
                ? Math.round(list.reduce((s, pp) => s + (byId.get(pp.player_id)?.forma ?? 0), 0) / list.length * 10) / 10
                : 0
              return (
                <div key={t} className="card overflow-hidden p-0">
                  <div className={`flex items-center justify-between px-3 py-2 text-sm font-bold ${TEAM_COLORS[t]}`}>
                    <span>{TEAM_NAMES[t]}</span>
                    <span className="text-xs font-normal">Forma média {media}</span>
                  </div>
                  <Escalacao team={t} pps={pps} byId={byId} nome={nome} podeTrocar={canEdit} onTrocar={trocar} />
                </div>
              )
            })}
          </div>
          {extras.length > 0 && (
            <div className="card">
              <h3 className="mb-1 text-sm font-bold text-zinc-600">Extras / fora</h3>
              <ul className="divide-y divide-zinc-100 text-sm">
                {extras.map(pp => (
                  <li key={pp.id} className="flex items-center justify-between py-1.5">
                    <span>{nome(pp.player_id)}</span>
                    {canEdit && <TrocarSelect pp={pp} pps={pps} nome={nome} onTrocar={trocar} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="card text-zinc-600">
          Times ainda não sorteados. Confirme as presenças no{' '}
          <Link to={`/peladas/${pelada.id}`} className="text-emerald-700 hover:underline">painel da pelada</Link>{' '}
          e sorteie por lá ou aqui.
        </div>
      )}
    </div>
  )
}
