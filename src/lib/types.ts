export const SKILLS = [
  'finalizacao', 'passe', 'chute_longo', 'passe_longo', 'defesa',
  'armacao', 'drible', 'velocidade', 'resistencia', 'posicionamento',
] as const

export type SkillKey = (typeof SKILLS)[number]
export type Skills = Record<SkillKey, number>

export const SKILL_LABELS: Record<SkillKey, string> = {
  finalizacao: 'Finalização',
  passe: 'Passe',
  chute_longo: 'Chute longo',
  passe_longo: 'Passe longo',
  defesa: 'Defesa',
  armacao: 'Armação',
  drible: 'Drible',
  velocidade: 'Velocidade',
  resistencia: 'Resistência',
  posicionamento: 'Posicionamento',
}

export const POSITIONS = ['defensor', 'meia', 'atacante', 'goleiro'] as const
export type Position = (typeof POSITIONS)[number]
export const POSITION_LABELS: Record<Position, string> = {
  defensor: 'Defensor', meia: 'Meia', atacante: 'Atacante', goleiro: 'Goleiro',
}

export const CATEGORIES = ['mensalista', 'frequente', 'turista', 'convidado'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABELS: Record<Category, string> = {
  mensalista: 'Mensalista', frequente: 'Frequente', turista: 'Turista', convidado: 'Convidado',
}

// Cores oficiais de cada tier de assiduidade — usar SEMPRE estas em todo o app
export const CATEGORY_COLORS: Record<Category, string> = {
  mensalista: 'bg-blue-100 text-blue-800',
  frequente: 'bg-emerald-100 text-emerald-800',
  convidado: 'bg-orange-100 text-orange-800',
  turista: 'bg-yellow-100 text-yellow-800',
}

export const APTITUDE_LABELS: Record<number, string> = {
  1: 'Totalmente defensivo',
  2: 'Defensivo',
  3: 'Equilibrado',
  4: 'Ofensivo',
  5: 'Totalmente ofensivo',
}

export const TEAM_NAMES: Record<number, string> = { 1: 'Preto', 2: 'Branco', 3: 'Vermelho' }
export const TEAM_COLORS: Record<number, string> = {
  1: 'bg-zinc-800 text-white',
  2: 'bg-white text-zinc-900 border border-zinc-300',
  3: 'bg-red-600 text-white',
}

export interface Profile {
  id: string
  name: string
  role: 'organizador' | 'auxiliar' | 'membro'
}

export interface Player {
  id: string
  name: string
  nickname: string | null
  category: Category
  position1: Position
  position2: Position
  aptitude: number
  is_goleiro_avulso: boolean
  overall: number | null
  forma: number | null
  active: boolean
  created_at: string
}

export interface SkillRating {
  id: string
  player_id: string
  source: 'inicial' | 'scout' | 'ajuste'
  skills: Skills
  overall: number
  created_at: string
}

export interface Scout {
  id: string
  player_id: string
  status: 'aberto' | 'fechado'
  suggested: Skills | null
  created_at: string
  closed_at: string | null
}

export interface ScoutLink {
  id: string
  scout_id: string
  token: string
  assigned_name: string
  used_at: string | null
}

export interface ScoutVote {
  id: string
  scout_id: string
  voter_name: string
  skills: Skills
  created_at: string
}

export interface Pelada {
  id: string
  date: string
  status: 'aberta' | 'encerrada'
  rachao: boolean
  sumula: string | null
}

export interface PeladaPlayer {
  id: string
  pelada_id: string
  player_id: string
  team: number | null
  is_extra: boolean
}

export interface Match {
  id: string
  pelada_id: string
  ordem: number
  team_a: number
  team_b: number
  score_a: number
  score_b: number
  meta_a: number
  meta_b: number
  streak_a: number
  streak_b: number
  penaltis: boolean
  penalti_winner: number | null
  paused_at: string | null
  paused_total_seg: number
  status: 'em_andamento' | 'encerrada'
  winner: number | null
  fica: number | null
  started_at: string
  ended_at: string | null
  duracao_seg: number | null
}

export interface MatchPlayer {
  match_id: string
  player_id: string
  team: number
}

export interface Goal {
  id: string
  match_id: string
  pelada_id: string
  team: number
  scorer_id: string | null
  assist_id: string | null
  own_goal: boolean
  created_at: string
}
