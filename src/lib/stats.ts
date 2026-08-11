import type { Goal, Match, MatchPlayer } from './types'

export interface PlayerStats {
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  gols: number
  assistencias: number
  golsContra: number
  cleanSheets: number // jogos sem sofrer gol
}

export const emptyStats = (): PlayerStats => ({
  jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
  gols: 0, assistencias: 0, golsContra: 0, cleanSheets: 0,
})

/** Agrega estatísticas por jogador a partir de partidas encerradas. */
export function aggregateStats(
  matches: Match[],
  matchPlayers: MatchPlayer[],
  goals: Goal[],
): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>()
  const get = (id: string) => {
    if (!stats.has(id)) stats.set(id, emptyStats())
    return stats.get(id)!
  }

  const finished = matches.filter(m => m.status === 'encerrada')
  const byMatch = new Map(finished.map(m => [m.id, m]))

  for (const mp of matchPlayers) {
    const m = byMatch.get(mp.match_id)
    if (!m) continue
    const s = get(mp.player_id)
    s.jogos++
    const myScore = mp.team === m.team_a ? m.score_a : m.score_b
    const oppScore = mp.team === m.team_a ? m.score_b : m.score_a
    if (m.winner == null) s.empates++
    else if (m.winner === mp.team) s.vitorias++
    else s.derrotas++
    if (oppScore === 0) s.cleanSheets++
    void myScore
  }

  for (const g of goals) {
    if (!byMatch.get(g.match_id)) continue
    if (g.own_goal) {
      if (g.scorer_id) get(g.scorer_id).golsContra++
    } else {
      if (g.scorer_id) get(g.scorer_id).gols++
      if (g.assist_id) get(g.assist_id).assistencias++
    }
  }

  return stats
}
