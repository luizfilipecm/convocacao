import { SKILLS, type Position, type SkillKey, type Skills } from './types'

// Skills de perfil ofensivo/defensivo — a aptidão desloca o peso entre elas.
const OFFENSIVE: SkillKey[] = ['finalizacao', 'drible', 'armacao', 'chute_longo']
const DEFENSIVE: SkillKey[] = ['defesa', 'posicionamento']

// Habilidades que mais pesam em cada posição
export const POSITION_KEY_SKILLS: Record<Position, SkillKey[]> = {
  defensor: ['defesa', 'posicionamento', 'passe_longo', 'resistencia', 'velocidade'],
  meia: ['armacao', 'passe', 'passe_longo', 'posicionamento', 'chute_longo', 'resistencia'],
  atacante: ['finalizacao', 'drible', 'velocidade', 'chute_longo', 'posicionamento'],
  goleiro: ['defesa', 'posicionamento', 'passe_longo'],
}

const POS1_BONUS = 1.5   // peso extra das skills-chave da posição principal
const POS2_BONUS = 0.75  // idem para a posição secundária (quando diferente)
const APT_SHIFT = 0.5    // força da aptidão no deslocamento ofensivo/defensivo

/**
 * Overall = média ponderada das skills.
 * - Skills-chave da(s) posição(ões) preferidas pesam mais.
 * - Aptidão (1=totalmente defensivo … 5=totalmente ofensivo) desloca o peso:
 *   jogador muito ofensivo pesa menos as skills defensivas, e vice-versa.
 */
export function computeOverall(
  skills: Skills,
  aptitude: number,
  position1: Position,
  position2: Position = position1,
): number {
  const t = (aptitude - 3) / 2 // -1 (tot. defensivo) … +1 (tot. ofensivo)
  const key1 = POSITION_KEY_SKILLS[position1]
  const key2 = POSITION_KEY_SKILLS[position2]
  let sum = 0
  let weightSum = 0
  for (const key of SKILLS) {
    let w = 1
    if (key1.includes(key)) w += POS1_BONUS
    if (position2 !== position1 && key2.includes(key)) w += POS2_BONUS
    if (OFFENSIVE.includes(key)) w *= 1 + APT_SHIFT * t
    if (DEFENSIVE.includes(key)) w *= 1 - APT_SHIFT * t
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

export function clampForma(forma: number, overall: number): number {
  const clamped = Math.min(overall + FORMA_RANGE, Math.max(overall - FORMA_RANGE, forma))
  return Math.round(clamped * 10) / 10
}
