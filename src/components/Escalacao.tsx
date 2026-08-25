import { TEAM_NAMES, type PeladaPlayer, type Player } from '../lib/types'

const CAPACITY = 7 // 1 goleiro + 6 linha

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
      {pp.team != null && <option value="fora">— Tirar do time (abre vaga)</option>}
      {outros.map(o => (
        <option key={o.id} value={o.id}>
          {nome(o.player_id)} ({o.team ? TEAM_NAMES[o.team] : 'Fora'})
        </option>
      ))}
    </select>
  )
}

/** Lista de jogadores de um time, com troca por atleta e vagas abertas para preencher */
export function Escalacao({
  team, pps, byId, nome, podeTrocar, onTrocar, onAdd, compact,
}: {
  team: number
  pps: PeladaPlayer[]
  byId: Map<string, Player>
  nome: (id: string | null) => string
  podeTrocar: boolean
  onTrocar: (pp: PeladaPlayer, alvo: string) => void
  onAdd?: (pp: PeladaPlayer, team: number) => void
  compact?: boolean
}) {
  const list = pps.filter(pp => pp.team === team)
  const disponiveis = pps.filter(pp => pp.team == null)
  const vagas = Math.max(0, CAPACITY - list.length)
  const pad = compact ? 'px-2 py-1' : 'px-3 py-1.5'
  return (
    <ul className={`divide-y divide-zinc-100 ${compact ? 'text-xs' : 'text-sm'}`}>
      {list.map(pp => {
        const p = byId.get(pp.player_id)
        const gk = p && (p.position1 === 'goleiro' || p.is_goleiro_avulso)
        return (
          <li key={pp.id} className={`flex items-center justify-between gap-1 ${pad}`}>
            <span className="truncate">
              {gk && '🧤 '}{nome(pp.player_id)}{' '}
              {!compact && <span className="text-xs text-zinc-400">{p?.forma}</span>}
            </span>
            {podeTrocar && <TrocarSelect pp={pp} pps={pps} nome={nome} onTrocar={onTrocar} />}
          </li>
        )
      })}
      {/* Vaga aberta: tirar alguém não apaga o slot — dá pra preencher com quem está de fora */}
      {podeTrocar && onAdd && vagas > 0 && (
        <li className={`${pad} bg-zinc-50/60`}>
          <select
            className="w-full rounded border border-dashed border-zinc-300 bg-transparent px-1 py-0.5 text-xs text-zinc-500"
            value=""
            onChange={e => {
              const pp = disponiveis.find(o => o.id === e.target.value)
              if (pp) onAdd(pp, team)
            }}
          >
            <option value="">＋ vaga aberta ({vagas}) — colocar atleta…</option>
            {disponiveis.map(o => (
              <option key={o.id} value={o.id}>{nome(o.player_id)}</option>
            ))}
          </select>
        </li>
      )}
      {!list.length && !(podeTrocar && onAdd) && (
        <li className={`${pad} text-zinc-400`}>—</li>
      )}
    </ul>
  )
}

/** Popup: a substituição é permanente (trocam de time) ou temporária (voltam após a partida)? */
export function SwapModal({
  nomeA, nomeB, temPartida, onConfirm, onCancel,
}: {
  nomeA: string
  nomeB: string
  temPartida: boolean
  onConfirm: (temporary: boolean) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5">
        <h3 className="mb-2 font-bold">⇄ Substituição</h3>
        <p className="mb-4 text-sm text-zinc-600">
          Trocar <b>{nomeA}</b> com <b>{nomeB}</b>. Como?
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn-primary" onClick={() => onConfirm(false)}>
            Permanente — trocam de time
          </button>
          <button className="btn-secondary" onClick={() => onConfirm(true)} disabled={!temPartida}>
            Temporária — voltam aos times originais após a partida
          </button>
          {!temPartida && (
            <p className="text-xs text-zinc-400">
              Substituição temporária só está disponível com uma partida em andamento.
            </p>
          )}
          <button className="text-sm text-zinc-500 hover:underline" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
