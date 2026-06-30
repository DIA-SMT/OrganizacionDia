import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('incluye una migracion idempotente para cachear commits', async () => {
  const migration = await readFile(new URL('../../supabase/add_project_commits.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.project_commits/i)
  assert.match(migration, /unique\s*\(project_id, sha\)/i)
  assert.match(migration, /committed_at/i)
})

test('el endpoint guarda commits y utiliza cache', async () => {
  const source = await readFile(new URL('../../app/api/github/project-commits/route.ts', import.meta.url), 'utf8')
  assert.match(source, /getSupabaseAdminClient/)
  assert.match(source, /\.from\('project_commits'\)\.upsert/)
  assert.match(source, /loadCachedCommits/)
})
