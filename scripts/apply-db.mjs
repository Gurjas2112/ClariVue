// One-off migration/seed runner for the cloud Supabase project (no psql needed).
// Usage:  DB_URL="postgresql://..." node --experimental ... handled via npx -p pg
//   npx -p pg node scripts/apply-db.mjs <sqlfile> [<sqlfile> ...]
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = process.env.DB_URL
if (!url) {
  console.error('DB_URL env var is required')
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Provide at least one .sql file path')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  for (const f of files) {
    const sql = readFileSync(f, 'utf8')
    process.stdout.write(`Applying ${f} ... `)
    await client.query(sql)
    console.log('ok')
  }
  console.log('All SQL applied successfully.')
} catch (err) {
  console.error('\nFailed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
