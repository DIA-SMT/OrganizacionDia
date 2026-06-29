# Identidad visual global DIA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar una paleta tecnológica azul, violeta y coral a toda la aplicación en modo claro y oscuro sin modificar layouts ni funcionalidad.

**Architecture:** Centralizar colores semánticos como variables CSS y consumirlos mediante clases reutilizables y valores arbitrarios de Tailwind. Actualizar primero los shells compartidos y luego las pantallas funcionales, conservando colores semánticos de estados.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, CSS custom properties, Framer Motion.

---

### Task 1: Tokens y superficies globales

**Files:**
- Modify: `app/globals.css`
- Create: `lib/theme-tokens.test.mts`

- [ ] **Step 1: Escribir una prueba fallida de tokens**

```ts
test('define los tokens de ambos temas', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  for (const token of ['--dia-bg', '--dia-surface', '--dia-surface-raised', '--dia-border', '--dia-primary', '--dia-violet', '--dia-coral', '--dia-text', '--dia-muted']) {
    assert.match(css, new RegExp(`${token}:`))
  }
  assert.match(css, /\.dark\s*\{/)
})
```

- [ ] **Step 2: Ejecutar la prueba y confirmar que falla**

Run: `node --no-warnings --test lib/theme-tokens.test.mts`

Expected: FAIL porque los tokens todavía no existen.

- [ ] **Step 3: Definir los tokens y estilos base**

```css
:root {
  --dia-bg: #f4f7fc;
  --dia-surface: #ffffff;
  --dia-surface-raised: #eef3ff;
  --dia-border: #d9e2f2;
  --dia-primary: #2563eb;
  --dia-violet: #7c3aed;
  --dia-coral: #e84a5f;
  --dia-text: #0b1635;
  --dia-muted: #60708f;
}

.dark {
  --dia-bg: #070b1c;
  --dia-surface: #0e1630;
  --dia-surface-raised: #141f42;
  --dia-border: #24325e;
  --dia-primary: #4f7cff;
  --dia-violet: #8b5cf6;
  --dia-coral: #ff5b6e;
  --dia-text: #f4f7ff;
  --dia-muted: #a8b3cf;
}
```

Aplicar los tokens al `body`, selección de texto, foco visible, scrollbar y clases compartidas `.dia-surface`, `.dia-control` y `.dia-primary-action`.

- [ ] **Step 4: Ejecutar la prueba**

Run: `node --no-warnings --test lib/theme-tokens.test.mts`

Expected: PASS.

### Task 2: Shell, dashboard y autenticación

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `components/dashboard-view.tsx`
- Modify: `components/cursor-ai-background.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/forgot-password/page.tsx`
- Modify: `app/reset-password/page.tsx`

- [ ] **Step 1: Sustituir superficies estructurales**

Usar las clases semánticas globales para fondo, sidebar, header, buscador, cards y controles. Ejemplo:

```tsx
const shellClass = 'bg-[var(--dia-bg)] text-[var(--dia-text)]'
const surfaceClass = 'border-[var(--dia-border)] bg-[var(--dia-surface)]'
const mutedClass = 'text-[var(--dia-muted)]'
```

- [ ] **Step 2: Actualizar acentos interactivos**

```tsx
className="bg-[var(--dia-primary)] text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--dia-primary)]"
```

Mantener amarillo para desarrollo, verde para producción, violeta para MVP y coral para pausado/error.

- [ ] **Step 3: Adaptar el fondo de IA**

Cambiar líneas verdes a azul/violeta mediante los tokens, manteniendo la misma cantidad de elementos y animaciones.

### Task 3: Pantallas funcionales y overlays

**Files:**
- Modify: `components/projects-screen.tsx`
- Modify: `components/tasks-screen.tsx`
- Modify: `components/team-screen.tsx`
- Modify: `components/commit-history-screen.tsx`
- Modify: `components/task-history-screen.tsx`
- Modify: `components/expedientes-screen.tsx`
- Modify: `components/testing-screen.tsx`
- Modify: `components/trash-screen.tsx`
- Modify: `components/blockers-screen.tsx`
- Modify: `components/project-create-button.tsx`
- Modify: `components/task-create-button.tsx`
- Modify: `components/virtual-assistant.tsx`

- [ ] **Step 1: Reemplazar fondos y bordes no semánticos**

Aplicar `var(--dia-bg)`, `var(--dia-surface)`, `var(--dia-surface-raised)` y `var(--dia-border)` en paneles, cards, menús, modales y formularios.

- [ ] **Step 2: Reemplazar azules hardcodeados**

Cambiar `#1677f2`, `#1769e0`, `#1554c7`, `#eaf3ff` y equivalentes por `var(--dia-primary)` o una superficie elevada según su función.

- [ ] **Step 3: Normalizar estados interactivos**

```tsx
className="transition-colors duration-300 hover:border-[var(--dia-primary)]/60 hover:bg-[var(--dia-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dia-primary)]"
```

- [ ] **Step 4: Conservar colores informativos**

No reemplazar indiscriminadamente `red`, `amber`, `emerald` o `violet` cuando representen prioridad, advertencia, producción o MVP.

### Task 4: Verificación y correcciones

**Files:**
- Modify: cualquiera de los archivos anteriores únicamente si la revisión detecta contraste o desbordes.

- [ ] **Step 1: Ejecutar comprobaciones automáticas**

Run: `node --no-warnings --test lib/theme-tokens.test.mts lib/project-filters.test.mts`

Expected: todas las pruebas PASS.

Run: `npm run lint`

Expected: código 0, sin errores.

Run: `npm run build`

Expected: código 0 y 28 rutas generadas.

- [ ] **Step 2: Revisar visualmente en escritorio**

Verificar dashboard, proyectos, tareas, equipo, historial y expedientes en claro y oscuro a `1440x900`. Confirmar contraste, hover, foco, modales y gráficos.

- [ ] **Step 3: Revisar visualmente en móvil**

Verificar las mismas rutas a `390x844`. Confirmar que sidebar, filtros, botones y textos no se superpongan ni desborden.

- [ ] **Step 4: Revisar el diff**

Run: `git diff --check`

Expected: sin errores de espacios ni marcadores de conflicto.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/login/page.tsx app/forgot-password/page.tsx app/reset-password/page.tsx components lib/theme-tokens.test.mts
git commit -m "Actualiza identidad visual global del dashboard"
```
