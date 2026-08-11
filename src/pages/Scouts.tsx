import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player, Scout } from '../lib/types'

export default function Scouts() {
  const [scouts, setScouts] = useState<(Scout & { players: Pick<Player, 'name' | 'nickname'> })[]>([])

  useEffect(() => {
    supabase.from('scouts')
      .select('*, players(name, nickname)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setScouts((data as never[]) ?? []))
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Scouts</h1>
      <p className="text-sm text-zinc-500">
        O Scout acontece uma vez, no cadastro do jogador (ou quando liberado na 3ª presença).
        Abra o Scout pela página do jogador.
      </p>
      <div className="space-y-2">
        {scouts.map(s => (
          <Link key={s.id} to={`/scouts/${s.id}`} className="card flex items-center justify-between hover:shadow-md">
            <div>
              <p className="font-bold">{s.players?.name}{s.players?.nickname && ` “${s.players.nickname}”`}</p>
              <p className="text-xs text-zinc-500">{new Date(s.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.status === 'aberto' ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200 text-zinc-600'}`}>
              {s.status === 'aberto' ? 'Votação aberta' : 'Fechado'}
            </span>
          </Link>
        ))}
        {!scouts.length && <p className="text-zinc-500">Nenhum Scout ainda.</p>}
      </div>
    </div>
  )
}
