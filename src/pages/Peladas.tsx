import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Pelada } from '../lib/types'

export default function Peladas() {
  const { canEdit } = useAuth()
  const navigate = useNavigate()
  const [peladas, setPeladas] = useState<Pelada[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const load = () => {
    supabase.from('peladas').select('*').order('date', { ascending: false })
      .then(({ data }) => setPeladas((data as Pelada[]) ?? []))
  }
  useEffect(load, [])

  async function criar() {
    const { data, error } = await supabase.from('peladas').insert({ date }).select().single()
    if (!error && data) navigate(`/peladas/${(data as Pelada).id}`)
  }

  const fmt = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Peladas</h1>
      {canEdit && (
        <div className="card flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Data</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={criar}>+ Nova pelada</button>
        </div>
      )}
      <div className="space-y-2">
        {peladas.map(p => (
          <Link key={p.id} to={`/peladas/${p.id}`} className="card flex items-center justify-between hover:shadow-md">
            <p className="font-bold">{fmt(p.date)}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === 'aberta' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'}`}>
              {p.status === 'aberta' ? 'Em andamento' : 'Encerrada'}
            </span>
          </Link>
        ))}
        {!peladas.length && <p className="text-zinc-500">Nenhuma pelada registrada.</p>}
      </div>
    </div>
  )
}
