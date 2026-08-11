import { SKILLS, type SkillKey, type Skills } from './types'

// Skills de perfil ofensivo/defensivo — a aptidão desloca o peso entre elas.
const OFFENSIVE: SkillKey[] = ['finalizacao', 'drible', 'armacao', 'chute_longo']
const DEFENSIVE: SkillKey[] = ['defesa', 'posicionamento']

/**
 * Overall = média ponderada das skills.
 * Aptidão (1=totalmente defensivo … 5=totalmente ofensivo) ajusta os pesos:
 * jogador muito ofensivo pesa menos as skills defensivas, e vice-versa.
 */
export function computeOverall(skills: Skills, aptitude: number): number {
  const t = (aptitude - 3) / 2 // -1 (tot. defensivo) … +1 (tot. ofensivo)
  let sum = 0
  let weightSum = 0
  for (const key of SKILLS) {
    let w = 1
    if (OFFENSIVE.includes(key)) w = 1 + 0.35 * t
    if (DEFENSIVE.includes(key)) w = 1 - 0.35 * t
    sum += (skills[key] ?? 0) * w
    weightSum += w
  }
  return Math.round((sum / weightSum) * 10) / 10
}

export const FORMA_DELTA = 0.3   // vitória soma, derrota subtrai
export const FORMA_RANGE = 2     // Forma fica no máximo ±2 do Overall

export function applyFormaDelta(forma: number, overall: number, result: 'vitoria' | 'derrota'): number {
  const delta = result === 'vitoria' ? FORMA_DELTA : -FORMA_DELTA
  const next = forma + delta
  const clamped = Math.min(overall + FORMA_RANGE, Math.max(overall - FORMA_RANGE, next))
  return Math.round(clamped * 10) / 10
}
