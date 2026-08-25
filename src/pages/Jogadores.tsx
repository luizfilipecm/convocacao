import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeOverall } from '../lib/overall'
import {
  APTITUDE_LABELS, CATEGORIES, CATEGORY_LABELS, POSITIONS, POSITION_LABELS,
  type Player, type Position, type Skills,
} from '../lib/types'
import SkillEditor, { defaultSkills } from '../components/SkillEditor'
import { CategoryBadge, Notas, PositionsBadge } from '../components/PlayerBadges'

export default function Jogadores() {
  const { canEdit, profile } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filtro, setFiltro] = useState('')

  // form state
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [category, setCategory] = useState<Player['category']>('convidado')
  const [pos1, setPos1] = useState<Position>('meia')
  const [pos2, setPos2] = useState<Position>('meia')
  const [aptitude, setAptitude] = useState(3)
  const [avulso, setAvulso] = useState(false)
  const [notaAvulso, setNotaAvulso] = useState(5)
  const [skills, setSkills] = useState<Skills>(defaultSkills())

  const load = () => {
    supabase.from('players').select('*').eq('active', true).order('name')
      .then(({ data }) => setPlayers((data as Player[]) ?? []))
  }
  useEffect(load, [])

  // Aviso de nome/apelido repetido no cadastro
  const norm = (s: string) => s.trim().toLowerCase()
  const duplicado = players.find(p =>
    (name.trim() && norm(p.name) === norm(name))
    || (nickname.trim() && p.nickname && norm(p.nickname) === norm(nickname)),
  )

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (duplicado && !confirm(
      `⚠️ Já existe um atleta com esse nome/apelido: ${duplicado.name}${duplicado.nickname ? ` “${duplicado.nickname}”` : ''}.\n\nCadastrar mesmo assim?`,
    )) return
    setBusy(true)
    try {
      const finalSkills = avulso ? defaultSkills(notaAvulso) : skills
      const overall = computeOverall(finalSkills, aptitude, avulso ? 'goleiro' : pos1, avulso ? 'goleiro' : pos2)
      const { data, error } = await supabase.from('players').insert({
        name, nickname: nickname || null, category,
        position1: avulso ? 'goleiro' : pos1,
        position2: avulso ? 'goleiro' : pos2,
        aptitude, is_goleiro_avulso: avulso,
        overall, forma: overall,
        created_by: profile?.id,
      }).select().single()
      if (error || !data) { alert('Erro ao salvar: ' + error?.message); return }
      await supabase.from('skill_ratings').insert({
        player_id: (data as Player).id, source: 'inicial',
        skills: finalSkills, overall, created_by: profile?.id,
      })
      setShowForm(false)
      setName(''); setNickname(''); setSkills(defaultSkills()); setAvulso(false)
      load()
    } finally {
      setBusy(false)
    }
  }

  const filtered = players.filter(p =>
    (p.name + ' ' + (p.nickname ?? '')).toLowerCase().includes(filtro.toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jogadores</h1>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Fechar' : '+ Novo jogador'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <h2 className="font-bold">Cadastrar jogador</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Apelido (opcional)</label>
              <input className="input" value={nickname} onChange={e => setNickname(e.target.value)} />
            </div>
            {duplicado && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
                ⚠️ Já existe um atleta parecido: <b>{duplicado.name}</b>
                {duplicado.nickname && <> “{duplicado.nickname}”</>} — confira se não é a mesma pessoa.
              </p>
            )}
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value as Player['category'])}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={avulso} onChange={e => setAvulso(e.target.checked)} className="accent-emerald-600" />
                Goleiro avulso / de aluguel
              </label>
            </div>
            {!avulso && (
              <>
                <div>
                  <label className="label">Posição preferida 1</label>
                  <select className="input" value={pos1} onChange={e => setPos1(e.target.value as Position)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Posição preferida 2 (repita para ficar fixo)</label>
                  <select className="input" value={pos2} onChange={e => setPos2(e.target.value as Position)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Aptidão: {APTITUDE_LABELS[aptitude]}</label>
                  <input type="range" min={1} max={5} value={aptitude}
                    onChange={e => setAptitude(Number(e.target.value))}
                    className="w-full accent-emerald-600" />
                </div>
              </>
            )}
          </div>

          {avulso ? (
            <div>
              <label className="label">Nota geral do goleiro: {notaAvulso}</label>
              <input type="range" min={1} max={10} value={notaAvulso}
                onChange={e => setNotaAvulso(Number(e.target.value))}
                className="w-full accent-emerald-600" />
            </div>
          ) : (
            <div>
              <p className="label">Avaliação inicial simples (o Scout por votação vem depois)</p>
              <SkillEditor skills={skills} onChange={setSkills} />
              <p className="mt-2 text-sm text-zinc-500">
                Overall calculado: <b>{computeOverall(skills, aptitude, pos1, pos2)}</b>
              </p>
            </div>
          )}

          <button className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar jogador'}</button>
        </form>
      )}

      <input className="input" placeholder="Buscar jogador…" value={filtro} onChange={e => setFiltro(e.target.value)} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map(p => (
          <Link key={p.id} to={`/jogadores/${p.id}`} className="card flex items-center justify-between hover:shadow-md">
            <div>
              <p className="font-bold">
                {p.name}
                {p.nickname && <span className="ml-1 font-normal text-zinc-500">“{p.nickname}”</span>}
                {p.is_goleiro_avulso && <span className="ml-1 text-xs">🧤 aluguel</span>}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <CategoryBadge category={p.category} />
                <PositionsBadge player={p} />
              </div>
            </div>
            <Notas player={p} />
          </Link>
        ))}
        {!filtered.length && <p className="text-zinc-500">Nenhum jogador cadastrado ainda.</p>}
      </div>
    </div>
  )
}
