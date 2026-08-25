import { TEAM_NAMES, type PeladaPlayer, type Player } from '../lib/types'

/** Dropdown no jogador: trocar por outro atleta (de outro time, extra ou fora) */
export function TrocarSelect({
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
export function Escalacao({
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
