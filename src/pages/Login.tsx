import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { configurado, supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError('Email ou senha inválidos.')
      } else {
        const { error, data } = await supabase.auth.signUp({
          email, password,
          options: { data: { name } },
        })
        if (error) setError(error.message)
        else if (!data.session) setInfo('Conta criada! Confirme seu email para entrar.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-800 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold">⚽ Convocação</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">Gerenciador de pelada</p>
        {!configurado && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ Supabase não configurado — copie <code>.env.example</code> para <code>.env</code> e preencha as chaves do projeto.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="label">Nome</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-emerald-700 hover:underline"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo('') }}
        >
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
