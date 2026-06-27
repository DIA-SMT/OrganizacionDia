# Filtro anual de expedientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un selector que filtre expedientes por el año de `drive_created_at`.

**Architecture:** Extraer la obtención y comparación de años a un helper puro para probar la lógica sin renderizar React. El componente calculará las opciones desde los expedientes cargados y combinará el año seleccionado con búsqueda y estado.

**Tech Stack:** TypeScript, React 19, Next.js 16, Node Test Runner.

---

### Task 1: Lógica y selector anual

**Files:**
- Create: `lib/expediente-years.ts`
- Create: `lib/expediente-years.test.mts`
- Modify: `components/expedientes-screen.tsx`

- [ ] **Step 1: Escribir la prueba fallida**

```ts
test('obtiene años únicos y descendentes', () => {
  assert.deepEqual(getAvailableYears(['2024-01-01', '2026-02-01', '2024-06-01', 'invalida']), [2026, 2024])
})

test('filtra por año sin excluir fechas inválidas cuando se muestran todos', () => {
  assert.equal(matchesYear('2026-02-01', '2026'), true)
  assert.equal(matchesYear('2025-02-01', '2026'), false)
  assert.equal(matchesYear('invalida', 'Todos'), true)
})
```

- [ ] **Step 2: Ejecutar la prueba y confirmar que falla**

Run: `node --no-warnings --test lib/expediente-years.test.mts`

Expected: FAIL porque `lib/expediente-years.ts` todavía no existe.

- [ ] **Step 3: Implementar el helper mínimo**

```ts
export function getAvailableYears(values: string[]) {
  return [...new Set(values.map((value) => new Date(value).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a)
}

export function matchesYear(value: string, selectedYear: string) {
  if (selectedYear === 'Todos') return true
  return new Date(value).getFullYear() === Number(selectedYear)
}
```

- [ ] **Step 4: Integrar el selector**

Agregar estado `year`, calcular `availableYears` con `useMemo`, sumar `matchesYear(expediente.drive_created_at, year)` al filtro y renderizar un `<select>` con `Todos los años` y los años disponibles. El selector se mostrará tanto en expedientes activos como archivados.

- [ ] **Step 5: Verificar**

Run: `node --no-warnings --test lib/expediente-years.test.mts`

Expected: 2 tests PASS.

Run: `npm run lint && npm run build`

Expected: ambos comandos terminan con código 0.

- [ ] **Step 6: Commit**

```bash
git add lib/expediente-years.ts lib/expediente-years.test.mts components/expedientes-screen.tsx
git commit -m "Agrega filtro anual de expedientes"
```
