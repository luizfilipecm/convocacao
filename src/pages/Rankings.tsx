import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { aggregateStats, type PlayerStats } from '../lib/stats'
import type { Goal, Match, MatchPlayer, Player } from '../lib/types'

type Tab = 'artilharia' | 'assistencias' | 'vitorias' | 'desempenho'

const TABS: { key: Tab; label: string }[] = [
  { key: 'artilharia', label: '⚽ Artilharia' },
  { key: 'assistencias', label: '🍽️ Assistências' },
  { key: 'vitorias', label: '🏆 Vitórias' },
  { key: 'desempenho', label: '📈 Desempenho' },
]

export default function Rankings() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [mp, setMp] = useState<MatchPlayer[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [tab, setTab] = useState<Tab>('artilharia')

  useEffect(() => {
    supabase.from('players').select('*').then(({ data }) => setPlayers((data as Player[]) ?? []))
    supabase.from('matches').select('*').eq('status', 'encerrada').then(({ data }) => setMatches((data as Match[]) ?? []))
    supabase.from('match_players').select('*').then(({ data }) => setMp((data as MatchPlayer[]) ?? []))
    supabase.from('goals').select('*').then(({ data }) => setGoals((data as Goal[]) ?? []))
  }, [])

  const stats = useMemo(() => aggregateStats(matches, mp, goals), [matches, mp, goals])

  const rows = useMemo(() => {
    const byId = new Map(players.map(p => [p.id, p]))
    const list: { player: Player; s: PlayerStats; value: number; detail: string }[] = []
    for (const [id, s] of stats) {
      const player = byId.get(id)
      if (!player) continue
      let value = 0, detail = ''
      if (tab === 'artilharia') { value = s.gols; detail = `${s.gols} gol(s) em ${s.jogos} jogos` }
      if (tab === 'assistencias') { value = s.assistencias; detail = `${s.assistencias} assistência(s)` }
      if (tab === 'vitorias') { value = s.vitorias; detail = `${s.vitorias}V ${s.empates}E ${s.derrotas}D` }
      if (tab === 'desempenho') {
        if (player.forma == null || player.overall == null || s.jogos < 3) continue
        value = Math.round((player.forma - player.overall) * 10) / 10
        detail = `Forma ${player.forma} vs Overall ${player.overall}`
      }
      if (tab !== 'desempenho' && value === 0) continue
      list.push({ player, s, value, detail })
    }
    return list.sort((a, b) => b.value - a.value).slice(0, 20)
  }, [stats, players, tab])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Rankings</h1>
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${tab === t.key ? 'bg-emerald-600 font-semibold text-white' : 'bg-white text-zinc-600 hover:bg-zinc-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'desempenho' && (
        <p className="text-xs text-zinc-500">
          Diferença entre Forma e Overall (mínimo 3 jogos) — positivo rende acima da nota, negativo abaixo.
        </p>
      )}
      <div className="card divide-y divide-zinc-100">
        {rows.map((r, i) => (
          <Link key={r.player.id} to={`/jogadores/${r.player.id}`} className="flex items-center gap-3 py-2 hover:bg-zinc-50">
            <span className={`w-8 text-center font-bold ${i < 3 ? 'text-amber-500' : 'text-zinc-400'}`}>
              {i + 1}º
            </span>
            <div className="flex-1">
              <p className="font-semibold">{r.player.nickname || r.player.name}</p>
              <p className="text-xs text-zinc-500">{r.detail}</p>
            </div>
            <span className={`text-lg font-bold ${tab === 'desempenho' ? (r.value > 0 ? 'text-emerald-600' : r.value < 0 ? 'text-red-600' : '') : ''}`}>
              {tab === 'desempenho' && r.value > 0 ? '+' : ''}{r.value}
            </span>
          </Link>
        ))}
        {!rows.length && <p className="py-4 text-center text-zinc-500">Sem dados ainda — bora jogar!</p>}
      </div>
    </div>
  )
}
