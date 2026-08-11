import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Skills } from '../lib/types'
import SkillEditor, { defaultSkills } from '../components/SkillEditor'

type State =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; playerName: string; voterName: string }
  | { status: 'done' }

const ERROS: Record<string, string> = {
  link_invalido: 'Link inválido. Confere com o organizador se o link tá certo.',
  ja_votou: 'Esse link já foi usado — voto registrado, valeu!',
  scout_fechado: 'Essa votação já foi encerrada pelo organizador.',
}

export default function Votar() {
  const { token } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [skills, setSkills] = useState<Skills>(defaultSkills())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    supabase.rpc('get_scout_by_token', { p_token: token }).then(({ data, error }) => {
      if (error || !data) { setState({ status: 'error', code: 'link_invalido' }); return }
      if (data.error) { setState({ status: 'error', code: data.error }); return }
      setState({ status: 'ready', playerName: data.player_name, voterName: data.assigned_name })
    })
  }, [token])

  async function votar() {
    if (!token) return
    setBusy(true)
    const { data, error } = await supabase.rpc('submit_scout_vote', { p_token: token, p_skills: skills })
    setBusy(false)
    if (error || data?.error) { setState({ status: 'error', code: data?.error ?? 'link_invalido' }); return }
    setState({ status: 'done' })
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-emerald-800 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-center text-xl font-bold">⚽ Scout — Convocação</h1>

        {state.status === 'loading' && <p className="text-center text-zinc-500">Carregando…</p>}

        {state.status === 'error' && (
          <p className="mt-4 text-center text-zinc-700">{ERROS[state.code] ?? ERROS.link_invalido}</p>
        )}

        {state.status === 'done' && (
          <div className="mt-4 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 font-bold">Voto registrado!</p>
            <p className="text-sm text-zinc-500">Valeu por avaliar. Pode fechar essa página.</p>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <p className="mb-4 text-center text-sm text-zinc-600">
              Fala, <b>{state.voterName}</b>! Dá sua nota de 1 a 10 pras habilidades de{' '}
              <b>{state.playerName}</b>. Só o organizador vê quem votou.
            </p>
            <SkillEditor skills={skills} onChange={setSkills} />
            <button className="btn-primary mt-5 w-full" onClick={votar} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar voto'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
