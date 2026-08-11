import type { Player, Position } from './types'

export interface SorteioResult {
  teams: Record<number, Player[]> // 1..3
  extras: Player[]
  warnings: string[]
}

const LINE_POSITIONS: Position[] = ['defensor', 'meia', 'atacante']
const MAX_PER_TEAM = 6 // 1 goleiro + 5 linha (18 vagas no total)

const formaOf = (p: Player) => p.forma ?? p.overall ?? 5

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const isGoleiro = (p: Player) => p.position1 === 'goleiro' || p.is_goleiro_avulso

function playsPosition(p: Player, pos: Position): boolean {
  return p.position1 === pos || p.position2 === pos
}

function teamAvg(team: Player[]): number {
  const line = team.filter(p => !isGoleiro(p))
  const list = line.length ? line : team
  if (!list.length) return 0
  return list.reduce((s, p) => s + formaOf(p), 0) / list.length
}

function variance(teams: Record<number, Player[]>): number {
  const avgs = [1, 2, 3].map(t => teamAvg(teams[t]))
  const mean = avgs.reduce((a, b) => a + b, 0) / 3
  return avgs.reduce((s, a) => s + (a - mean) ** 2, 0) / 3
}

// Cada time precisa de pelo menos 1 defensor, 1 meia e 1 atacante
// (posição secundária pode cobrir). Checagem por matching guloso.
function coversPositions(team: Player[]): boolean {
  const line = team.filter(p => !isGoleiro(p))
  if (line.length < 3) return line.length === 0 // time vazio ou incompleto demais não bloqueia
  const used = new Set<string>()
  for (const pos of LINE_POSITIONS) {
    const primary = line.find(p => !used.has(p.id) && p.position1 === pos)
    const any = primary ?? line.find(p => !used.has(p.id) && playsPosition(p, pos))
    if (!any) return false
    used.add(any.id)
  }
  return true
}

export function sortearTimes(presentes: Player[]): SorteioResult {
  const warnings: string[] = []
  const teams: Record<number, Player[]> = { 1: [], 2: [], 3: [] }
  const extras: Player[] = []

  // --- Goleiros: um fixo por time ---
  const goleiros = shuffle(presentes.filter(isGoleiro)).sort((a, b) => formaOf(b) - formaOf(a))
  const linha = shuffle(presentes.filter(p => !isGoleiro(p)))

  goleiros.slice(0, 3).forEach((g, i) => teams[i + 1].push(g))
  // Goleiro excedente que joga na linha entra no sorteio; senão vira extra
  for (const g of goleiros.slice(3)) {
    if (g.position2 !== 'goleiro' && !g.is_goleiro_avulso) linha.push(g)
    else extras.push(g)
  }
  if (goleiros.length < 3) {
    warnings.push(`Só ${goleiros.length} goleiro(s) presente(s) — time(s) sem goleiro fixo.`)
  }

  // --- Vagas de linha: distribuir o mais parelho possível (máx. 5 por time) ---
  const totalLinha = Math.min(linha.length, 15)
  const sizes = [0, 0, 0]
  for (let i = 0; i < totalLinha; i++) sizes[i % 3]++

  const pool = [...linha].sort((a, b) => formaOf(b) - formaOf(a))
  const lineCount = (t: number) => teams[t].filter(p => !isGoleiro(p)).length
  const hasSpace = (t: number) => lineCount(t) < sizes[t - 1]

  // Prioridade 1: cobrir defensor/meia/atacante em cada time
  for (const pos of LINE_POSITIONS) {
    const order = [1, 2, 3].sort((a, b) => teamAvg(teams[a]) - teamAvg(teams[b]))
    for (const t of order) {
      if (!hasSpace(t)) continue
      if (teams[t].some(p => !isGoleiro(p) && playsPosition(p, pos))) continue
      const idx = pool.findIndex(p => p.position1 === pos)
      const idx2 = idx >= 0 ? idx : pool.findIndex(p => playsPosition(p, pos))
      if (idx2 >= 0) {
        teams[t].push(pool.splice(idx2, 1)[0])
      }
    }
  }

  // Prioridades 2 e 3: equilíbrio de Forma, preferindo +1 defensor e depois +1 meia
  const fillOrder: Player[] = [
    ...pool.filter(p => p.position1 === 'defensor'),
    ...pool.filter(p => p.position1 === 'meia'),
    ...pool.filter(p => p.position1 !== 'defensor' && p.position1 !== 'meia'),
  ]
  for (const p of fillOrder) {
    const open = [1, 2, 3].filter(hasSpace)
    if (!open.length) { extras.push(p); continue }
    const t = open.sort((a, b) => teamAvg(teams[a]) - teamAvg(teams[b]))[0]
    teams[t].push(p)
  }

  // --- Otimização local: trocas que reduzem a diferença de Forma média ---
  for (let iter = 0; iter < 400; iter++) {
    const t1 = 1 + Math.floor(Math.random() * 3)
    let t2 = 1 + Math.floor(Math.random() * 3)
    if (t1 === t2) t2 = (t2 % 3) + 1
    const l1 = teams[t1].filter(p => !isGoleiro(p))
    const l2 = teams[t2].filter(p => !isGoleiro(p))
    if (!l1.length || !l2.length) continue
    const p1 = l1[Math.floor(Math.random() * l1.length)]
    const p2 = l2[Math.floor(Math.random() * l2.length)]
    const before = variance(teams)
    teams[t1] = teams[t1].map(p => (p.id === p1.id ? p2 : p))
    teams[t2] = teams[t2].map(p => (p.id === p2.id ? p1 : p))
    const ok = coversPositions(teams[t1]) && coversPositions(teams[t2])
    if (!ok || variance(teams) >= before) {
      // desfaz
      teams[t1] = teams[t1].map(p => (p.id === p2.id ? p1 : p))
      teams[t2] = teams[t2].map(p => (p.id === p1.id ? p2 : p))
    }
  }

  for (const t of [1, 2, 3]) {
    if (!coversPositions(teams[t])) {
      warnings.push(`Time ${t} ficou sem cobrir todas as posições — ajuste manual recomendado.`)
    }
  }
  if (presentes.length > MAX_PER_TEAM * 3) {
    warnings.push(`${extras.length} jogador(es) como extra (limite de 18 vagas).`)
  }

  return { teams, extras, warnings }
}
