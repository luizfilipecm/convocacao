import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

const links = [
  { to: '/', label: 'Início' },
  { to: '/peladas', label: 'Peladas' },
  { to: '/times', label: 'Times' },
  { to: '/jogadores', label: 'Jogadores' },
  { to: '/scouts', label: 'Scouts' },
  { to: '/rankings', label: 'Rankings' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-emerald-700 text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-bold">⚽ Convocação</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-emerald-100">
              {profile?.name}
              {profile?.role !== 'membro' && (
                <span className="ml-1 rounded bg-emerald-900/40 px-1.5 py-0.5 text-xs capitalize">{profile?.role}</span>
              )}
            </span>
            <button onClick={signOut} className="rounded bg-emerald-800 px-2 py-1 text-xs hover:bg-emerald-900">Sair</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1 text-sm ${isActive ? 'bg-white text-emerald-800 font-semibold' : 'text-emerald-100 hover:bg-emerald-600'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
