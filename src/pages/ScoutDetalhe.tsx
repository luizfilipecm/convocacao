import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeOverall, FORMA_RANGE } from '../lib/overall'
import {
  SKILLS, SKILL_LABELS,
  type Player, type Scout, type ScoutLink, type ScoutVote, type Skills,
} from '../lib/types'
import SkillEditor, { defaultSkills } from '../components/SkillEditor'

export default function ScoutDetalhe() {
  const { id } = useParams()
  const { isOrganizador, profile } = useAuth()
  const [scout, setScout] = useState<Scout | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [links, setLinks] = useState<ScoutLink[]>([])
  const [votes, setVotes] = useState<ScoutVote[]>([])
  const [newName, setNewName] = useState('')
  const [finalSkills, setFinalSkills] = useState<Skills | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    if (!id) return
    const { data: s } = await supabase.from('scouts').select('*').eq('id', id).single()
    if (!s) return
    setScout(s as Scout)
    const { data: p } = await supabase.from('players').select('*').eq('id', (s as Scout).player_id).single()
    setPlayer(p as Player)
    if (isOrganizador) {
      const [l, v] = await Promise.all([
        supabase.from('scout_links').select('*').eq('scout_id', id).order('created_at'),
        supabase.from('scout_votes').select('*').eq('scout_id', id),
      ])
      setLinks((l.data as ScoutLink[]) ?? [])
      setVotes((v.data as ScoutVote[]) ?? [])
    }
  }
  useEffect(() => { load() }, [id, isOrganizador])

  const medias = useMemo(() => {
    if (!votes.length) return null
    const avg = defaultSkills(0)
    for (const v of votes) for (const s of SKILLS) avg[s] += v.skills[s] ?? 0
    for (const s of SKILLS) avg[s] = Math.round((avg[s] / votes.length) * 10) / 10
    return avg
  }, [votes])

  async function gerarLink() {
    if (!newName.trim() || !id) return
    await supabase.from('scout_links').insert({ scout_id: id, assigned_name: newName.trim() })
    setNewName('')
    load()
  }

  function copiar(token: string) {
    const url = `${window.location.origin}/votar/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  function iniciarFechamento() {
    const base = medias
      ? (Object.fromEntries(SKILLS.map(s => [s, Math.min(10, Math.max(1, Math.round(medias[s])))])) as Skills)
      : (scout?.suggested ?? defaultSkills())
    setFinalSkills(base)
  }

  async function fechar() {
    if (!scout || !player || !finalSkills) return
    const overall = computeOverall(finalSkills, player.aptitude, player.position1, player.position2)
    const forma = Math.min(overall + FORMA_RANGE, Math.max(overall - FORMA_RANGE, player.forma ?? overall))
    await supabase.from('skill_ratings').insert({
      player_id: player.id, source: 'scout', skills: finalSkills, overall, created_by: profile?.id,
    })
    await supabase.from('players').update({ overall, forma: Math.round(forma * 10) / 10 }).eq('id', player.id)
    await supabase.from('scouts').update({ status: 'fechado', closed_at: new Date().toISOString() }).eq('id', scout.id)
    setFinalSkills(null)
    load()
  }

  if (!scout || !player) return <p className="text-zinc-500">Carregando…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        Scout — <Link to={`/jogadores/${player.id}`} className="text-emerald-700 hover:underline">{player.name}</Link>
      </h1>
      <p className="text-sm">
        Status:{' '}
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scout.status === 'aberto' ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200'}`}>
          {scout.status === 'aberto' ? 'Votação aberta' : 'Fechado'}
        </span>
      </p>

      {!isOrganizador && (
        <p className="card text-sm text-zinc-500">
          Os detalhes da votação (links e quem votou) são visíveis apenas para o organizador.
        </p>
      )}

      {isOrganizador && scout.status === 'aberto' && (
        <>
          <div className="card space-y-3">
            <h2 className="font-bold">Links de votação (Voto)</h2>
            <p className="text-xs text-zinc-500">Gere um link por pessoa e mande no zap. Não precisa de login pra votar.</p>
            <div className="flex gap-2">
              <input className="input" placeholder="Nome de quem vai votar"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && gerarLink()} />
              <button className="btn-primary shrink-0" onClick={gerarLink}>Gerar link</button>
            </div>
            <ul className="space-y-1">
              {links.map(l => (
                <li key={l.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                  <span>
                    {l.assigned_name}
                    {l.used_at
                      ? <span className="ml-2 text-xs text-emerald-600">✓ votou</span>
                      : <span className="ml-2 text-xs text-zinc-400">aguardando</span>}
                  </span>
                  <button className="btn-secondary" onClick={() => copiar(l.token)}>
                    {copied === l.token ? 'Copiado!' : 'Copiar link'}
                  </button>
                </li>
              ))}
              {!links.length && <p className="text-sm text-zinc-400">Nenhum link gerado.</p>}
            </ul>
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">Apuração ({votes.length} voto(s))</h2>
            {medias ? (
              <table className="w-full text-sm">
                <tbody>
                  {SKILLS.map(s => (
                    <tr key={s} className="border-b border-zinc-100 last:border-0">
                      <td className="py-1 text-zinc-600">{SKILL_LABELS[s]}</td>
                      <td className="py-1 text-right font-bold">{medias[s]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-zinc-400">Nenhum voto ainda.</p>
            )}
            {scout.suggested && (
              <p className="text-xs text-zinc-500">
                💡 Há uma sugestão automática baseada no desempenho em quadra — ela aparece pré-carregada no fechamento se não houver votos.
              </p>
            )}
            {!finalSkills && (
              <button className="btn-primary" onClick={iniciarFechamento}>Fechar Scout e definir Overall</button>
            )}
          </div>

          {finalSkills && (
            <div className="card space-y-3 border-l-4 border-emerald-600">
              <h2 className="font-bold">Ajuste final (vira o Overall oficial)</h2>
              <SkillEditor skills={finalSkills} onChange={setFinalSkills} />
              <p className="text-sm">Overall final: <b>{computeOverall(finalSkills, player.aptitude, player.position1, player.position2)}</b></p>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={fechar}>Confirmar e fechar</button>
                <button className="btn-secondary" onClick={() => setFinalSkills(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}

      {isOrganizador && scout.status === 'fechado' && (
        <div className="card">
          <h2 className="mb-2 font-bold">Votos registrados</h2>
          <ul className="space-y-1 text-sm">
            {votes.map(v => (
              <li key={v.id} className="border-b border-zinc-100 py-1 last:border-0">
                <b>{v.voter_name}</b> — {SKILLS.map(s => `${SKILL_LABELS[s].slice(0, 3)} ${v.skills[s]}`).join(' · ')}
              </li>
            ))}
            {!votes.length && <p className="text-zinc-400">Fechado sem votos (usou sugestão/ajuste manual).</p>}
          </ul>
        </div>
      )}
    </div>
  )
}
