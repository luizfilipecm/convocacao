import { supabase } from './supabase'
import type { Skills } from './types'

/**
 * Nota física por jogador: (velocidade + resistência) / 2,
 * tirada da avaliação de skills mais recente de cada um.
 */
export async function fetchFisico(playerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!playerIds.length) return map
  const { data } = await supabase.from('skill_ratings')
    .select('player_id, skills, created_at')
    .in('player_id', playerIds)
    .order('created_at', { ascending: false })
  for (const r of (data ?? []) as { player_id: string; skills: Skills }[]) {
    if (!map.has(r.player_id)) {
      map.set(r.player_id, ((r.skills.velocidade ?? 5) + (r.skills.resistencia ?? 5)) / 2)
    }
  }
  return map
}
