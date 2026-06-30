import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('incluye una migracion idempotente para responsables de proyectos', async () => {
  const migration = await readFile(new URL('../supabase/add_project_members.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.project_members/i)
  assert.match(migration, /unique\s*\(project_id, member_id\)/i)
  assert.match(migration, /authenticated read project members/i)
  assert.match(migration, /authenticated write project members/i)
})

test('la pantalla de proyectos permite editar responsables', async () => {
  const source = await readFile(new URL('../components/projects-screen.tsx', import.meta.url), 'utf8')
  assert.match(source, /MemberMultiSelect/)
  assert.match(source, /\.from\('project_members'\)/)
  assert.match(source, /Responsables del proyecto/)
  assert.match(source, /projectMembersAvailable/)
  assert.match(source, /disabled=\{!projectMembersAvailable\}/)
})
