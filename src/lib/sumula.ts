import { aggregateStats } from './stats'
import { TEAM_NAMES, type Goal, type Match, type MatchPlayer, type Player } from './types'

const displayName = (p?: Player) => (p ? (p.nickname || p.name) : 'desconhecido')

/** Gera a Súmula do dia em linguagem informal de futebol. */
export function gerarSumula(
  date: string,
  players: Player[],
  matches: Match[],
  matchPlayers: MatchPlayer[],
  goals: Goal[],
): string {
  const byId = new Map(players.map(p => [p.id, p]))
  const stats = aggregateStats(matches, matchPlayers, goals)
  const finished = matches.filter(m => m.status === 'encerrada')
  const lines: string[] = []

  const [y, mo, d] = date.split('-')
  lines.push(`⚽ SÚMULA DA PELADA — ${d}/${mo}/${y}`)
  lines.push('')

  if (!finished.length) {
    lines.push('Hoje não rolou bola no cronômetro... só resenha. Fica pra próxima!')
    return lines.join('\n')
  }

  lines.push(`Foram ${finished.length} partida(s) disputadas no sufoco de sempre.`)
  lines.push('')

  // Artilheiro
  const entries = [...stats.entries()]
  const topGols = entries.filter(([, s]) => s.gols > 0).sort((a, b) => b[1].gols - a[1].gols)
  if (topGols.length) {
    const [id, s] = topGols[0]
    const empatados = topGols.filter(([, x]) => x.gols === s.gols)
    if (empatados.length > 1) {
      lines.push(`🥇 Artilharia dividida: ${empatados.map(([i]) => displayName(byId.get(i))).join(' e ')} com ${s.gols} gol(s) cada. Ninguém quis deixar barato.`)
    } else {
      lines.push(`🥇 Artilheiro do dia: ${displayName(byId.get(id))}, com ${s.gols} gol(s). Tava impossível, deixa o menino jogar!`)
    }
  }

  // Garçom
  const topAssist = entries.filter(([, s]) => s.assistencias > 0).sort((a, b) => b[1].assistencias - a[1].assistencias)
  if (topAssist.length) {
    const [id, s] = topAssist[0]
    lines.push(`🍽️ Garçom do dia: ${displayName(byId.get(id))}, serviu ${s.assistencias} assistência(s) na bandeja.`)
  }

  // Invicto
  const invictos = entries
    .filter(([, s]) => s.jogos >= 2 && s.derrotas === 0)
    .sort((a, b) => b[1].vitorias - a[1].vitorias)
  if (invictos.length) {
    const [id, s] = invictos[0]
    lines.push(`🛡️ Invicto: ${displayName(byId.get(id))} não perdeu nenhuma (${s.vitorias}V ${s.empates}E em ${s.jogos} jogos). Tava de colete blindado.`)
  }

  // Paredão (mais jogos sem sofrer gol)
  const paredao = entries.filter(([, s]) => s.cleanSheets > 0).sort((a, b) => b[1].cleanSheets - a[1].cleanSheets)
  if (paredao.length) {
    const [id, s] = paredao[0]
    lines.push(`🧱 Paredão: ${displayName(byId.get(id))} saiu de quadra sem sofrer gol em ${s.cleanSheets} partida(s).`)
  }

  // Pereba (gol contra)
  const perebas = entries.filter(([, s]) => s.golsContra > 0).sort((a, b) => b[1].golsContra - a[1].golsContra)
  if (perebas.length) {
    const [id, s] = perebas[0]
    lines.push(`🦆 Pereba do dia: ${displayName(byId.get(id))} mandou ${s.golsContra} contra o próprio patrimônio. Acontece nas melhores famílias.`)
  }

  // Anticovardia — maior sequência em quadra
  const maxStreak = Math.max(...finished.flatMap(m => [m.streak_a, m.streak_b]))
  if (maxStreak >= 4) {
    const m = finished.find(x => x.streak_a === maxStreak || x.streak_b === maxStreak)!
    const team = m.streak_a === maxStreak ? m.team_a : m.team_b
    lines.push(`🔥 Anticovardia em ação: o time ${TEAM_NAMES[team]} emendou ${maxStreak} partidas seguidas em quadra e teve que suar pra continuar vencendo.`)
  }

  // Placar geral por time
  lines.push('')
  lines.push('📊 Saldo dos times no dia:')
  for (const t of [1, 2, 3]) {
    let v = 0, e = 0, dr = 0
    for (const m of finished) {
      if (m.team_a !== t && m.team_b !== t) continue
      if (m.winner == null) e++
      else if (m.winner === t) v++
      else dr++
    }
    if (v + e + dr > 0) lines.push(`   ${TEAM_NAMES[t]}: ${v}V ${e}E ${dr}D`)
  }

  lines.push('')
  lines.push('Bola pra dentro, água na cara e até a próxima! 🍻')
  return lines.join('\n')
}
