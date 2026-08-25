// Migrações automáticas do banco, executadas no build da Vercel.
// Precisa da variável de ambiente SUPABASE_DB_URL (connection string do Postgres,
// Supabase → Connect → Session pooler). Sem ela, o script apenas avisa e segue —
// o build nunca quebra por causa disso.
import pg from 'pg'

// Toda entrada aqui deve ser IDEMPOTENTE (if not exists etc.), pois roda em todo deploy.
const MIGRATIONS = [
  'alter table matches add column if not exists paused_at timestamptz',
  'alter table matches add column if not exists paused_total_seg int not null default 0',
  'alter table substitutions add column if not exists temporary boolean not null default false',
]

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.log('[migrate] SUPABASE_DB_URL não definida — pulando migrações (defina no painel da Vercel para ativar).')
  process.exit(0)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  for (const sql of MIGRATIONS) {
    await client.query(sql)
    console.log('[migrate] ok:', sql)
  }
  console.log(`[migrate] ${MIGRATIONS.length} migração(ões) aplicadas/verificadas.`)
} catch (err) {
  console.error('[migrate] ERRO ao aplicar migrações:', err.message)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
