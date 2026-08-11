import { CATEGORY_LABELS, POSITION_LABELS, type Player } from '../lib/types'

const catColor: Record<string, string> = {
  mensalista: 'bg-emerald-100 text-emerald-800',
  frequente: 'bg-blue-100 text-blue-800',
  turista: 'bg-amber-100 text-amber-800',
  convidado: 'bg-zinc-200 text-zinc-700',
}

export function CategoryBadge({ category }: { category: Player['category'] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catColor[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

export function PositionsBadge({ player }: { player: Player }) {
  const positions = player.position1 === player.position2
    ? POSITION_LABELS[player.position1]
    : `${POSITION_LABELS[player.position1]} / ${POSITION_LABELS[player.position2]}`
  return <span className="text-xs text-zinc-500">{positions}</span>
}

export function Notas({ player }: { player: Player }) {
  return (
    <div className="flex gap-2 text-center">
      <div className="rounded-lg bg-zinc-100 px-2 py-1">
        <p className="text-[10px] uppercase text-zinc-500">Overall</p>
        <p className="font-bold">{player.overall ?? '—'}</p>
      </div>
      <div className="rounded-lg bg-emerald-50 px-2 py-1">
        <p className="text-[10px] uppercase text-emerald-600">Forma</p>
        <p className="font-bold text-emerald-700">{player.forma ?? '—'}</p>
      </div>
    </div>
  )
}
