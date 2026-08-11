import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Jogadores from './pages/Jogadores'
import JogadorDetalhe from './pages/JogadorDetalhe'
import Scouts from './pages/Scouts'
import ScoutDetalhe from './pages/ScoutDetalhe'
import Votar from './pages/Votar'
import Peladas from './pages/Peladas'
import PeladaDetalhe from './pages/PeladaDetalhe'
import Rankings from './pages/Rankings'

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-zinc-500">Carregando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/votar/:token" element={<Votar />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/jogadores" element={<Protected><Jogadores /></Protected>} />
      <Route path="/jogadores/:id" element={<Protected><JogadorDetalhe /></Protected>} />
      <Route path="/scouts" element={<Protected><Scouts /></Protected>} />
      <Route path="/scouts/:id" element={<Protected><ScoutDetalhe /></Protected>} />
      <Route path="/peladas" element={<Protected><Peladas /></Protected>} />
      <Route path="/peladas/:id" element={<Protected><PeladaDetalhe /></Protected>} />
      <Route path="/rankings" element={<Protected><Rankings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
