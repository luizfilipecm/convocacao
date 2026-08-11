import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Pelada, Player } from '../lib/types'

export default function Dashboard() {
  const { canEdit } = useAuth()
  const navigate = useNavigate()
  const [peladaAberta, setPeladaAberta] = useState<Pelada | null>(null)
  const [ultimaPelada, setUltimaPelada] = useState<Pelada | null>(null)
  const [nPlayers, setNPlayers] = useState(0)

  useEffect(() => {
    supabase.from('peladas').select('*').eq('status', 'aberta').order('date', { ascending: false }).limit(1)
      .then(({ data }) => setPeladaAberta(data?.[0] ?? null))
    supabase.from('peladas').select('*').eq('status', 'encerrada').order('date', { ascending: false }).limit(1)
      .then(({ data }) => setUltimaPelada(data?.[0] ?? null))
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('active', true)
      .then(({ count }) => setNPlayers(count ?? 0))
  }, [])

  async function novaPelada() {
    const { data, error } = await supabase.from('peladas')
      .insert({ date: new Date().toISOString().slice(0, 10) })
      .select().single()
    if (!error && data) navigate(`/peladas/${(data as Pelada).id}`)
  }

  const fmt = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Início</h1>

      {peladaAberta ? (
        <Link to={`/peladas/${peladaAberta.id}`} className="card block border-l-4 border-emerald-600 hover:shadow-md">
          <p className="text-sm font-semibold text-emerald-700">🔴 Pelada em andamento</p>
          <p className="text-lg font-bold">{fmt(peladaAberta.date)}</p>
          <p className="text-sm text-zinc-500">Toque para abrir o painel do dia</p>
        </Link>
      ) : canEdit ? (
        <div className="card">
          <p className="mb-3 text-zinc-600">Nenhuma pelada em andamento.</p>
          <button className="btn-primary" onClick={novaPelada}>+ Começar pelada de hoje</button>
        </div>
      ) : (
        <div className="card text-zinc-600">Nenhuma pelada em andamento.</div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Link to="/jogadores" className="card hover:shadow-md">
          <p className="text-3xl font-bold">{nPlayers}</p>
          <p className="text-sm text-zinc-500">Jogadores ativos</p>
        </Link>
        <Link to="/rankings" className="card hover:shadow-md">
          <p className="text-3xl">🏆</p>
          <p className="text-sm text-zinc-500">Rankings</p>
        </Link>
        {ultimaPelada && (
          <Link to={`/peladas/${ultimaPelada.id}`} className="card hover:shadow-md">
            <p className="text-lg font-bold">{fmt(ultimaPelada.date)}</p>
            <p className="text-sm text-zinc-500">Última pelada</p>
          </Link>
        )}
      </div>
    </div>
  )
}
