# Plan: Multi-equipo (DIA + DITEC) y detección de cruces de proyectos

## Contexto

Hoy el dashboard es mono-equipo: todo usuario autenticado ve y edita todo (las políticas RLS
de Supabase son `authenticated using (true)` para lectura y escritura). No existe el concepto
de "equipo": `members` y `projects` pertenecen implícitamente a DIA.

El objetivo es que la DITEC tenga sus cuentas y cargue sus proyectos con sus repos, para que
ambos equipos detecten a tiempo si están desarrollando lo mismo (caso real: "Complejo
Deportivo" fue desarrollado en paralelo por los dos equipos sin saberlo).

## Decisiones de diseño (acordadas 2026-08-11)

| Tema | Decisión |
| --- | --- |
| Visibilidad entre equipos | Solo la **ficha** del proyecto (nombre, descripción, estado, repos, responsable). El detalle interno (tareas, comentarios, documentos, expedientes, commits) es privado de cada equipo. |
| Alcance de DITEC | Catálogo liviano: dan de alta y mantienen sus proyectos. No usan tareas/kanban/expedientes. |
| Detección de cruces | Alerta de similitud al crear/editar proyecto **+** panel permanente de posibles cruces. |
| Escalabilidad | Diseño multi-equipo genérico (tabla `teams`); sumar una tercera área no requiere tocar código. |

## Riesgo principal a resolver primero

Con las políticas RLS actuales, crear una cuenta DITEC hoy le daría acceso total de lectura
**y escritura** a todos los datos de DIA (incluidos expedientes y documentos). Por eso la
Etapa 0 (aislamiento por equipo) es prerrequisito duro antes de entregar cualquier cuenta.

---

## Etapa 0 — Fundaciones: concepto de equipo y aislamiento (prerrequisito)

> **Estado: implementada en código (2026-08-11).** Pendiente: ejecutar
> `supabase/add_teams.sql` en el SQL Editor de Supabase y verificar con un
> usuario de prueba (ver "Cómo aplicar y verificar" al final).

**Objetivo:** que cada fila de datos pertenezca a un equipo y que la base lo haga cumplir.

- **DB (nueva migración `add_teams.sql`):**
  - Tabla `teams` (`id`, `name`, `slug`, `color`, `active`, `created_at`). Seed: `dia`, `ditec`.
  - Columna `team_id` en `members` y `projects` (not null, FK a `teams`).
    Backfill: todo lo existente → equipo DIA.
  - Funciones SQL helper: `current_member_id()` y `current_team_id()` (a partir de `auth.uid()`).
- **RLS real (reemplaza las políticas abiertas):**
  - `projects`: lectura de la ficha para todos los autenticados; escritura solo si
    `team_id = current_team_id()`.
  - Tablas de detalle (`tasks`, `task_assignees`, `comments`, `project_documents`,
    `project_commits`, `blockers`, expedientes): lectura y escritura solo si el proyecto
    pertenece al equipo del usuario.
  - `members`: cada uno ve los miembros de su equipo (y lo mínimo necesario del resto, p. ej.
    nombre del responsable de un proyecto ajeno).
  - Como RLS no filtra columnas, la ficha cruzada se expone vía una **vista
    `project_catalog`** con solo los campos públicos (nombre, descripción, estado, prioridad,
    repos, responsable, equipo, fechas).
- **App:**
  - `AuthContext` y `/api/auth/me` exponen `teamId`/`teamSlug` además de `role`/`memberId`.
  - Las queries existentes siguen funcionando (RLS filtra solo lo del equipo propio).

**Listo cuando:** un usuario DIA ve exactamente lo mismo que hoy; un usuario de prueba DITEC
no puede leer tareas/documentos/expedientes de DIA ni escribir sobre sus proyectos.

## Etapa 1 — Cuentas DITEC y su espacio de trabajo

**Objetivo:** DITEC entra al dashboard y gestiona su catálogo de proyectos.

- Alta de usuarios DITEC (Supabase Auth + `members` con `team_id = ditec`).
- Navegación por equipo: para DITEC el sidebar muestra solo "Mis proyectos" y el catálogo
  cruzado; se ocultan tareas, expedientes, equipo DIA, testing, etc.
- Alta/edición de proyecto: el `team_id` se asigna automáticamente según el usuario
  (sin selector).
- Ajustes menores del formulario de proyecto para el caso DITEC (campos mínimos:
  nombre, descripción, estado, repos, responsable funcional).

**Listo cuando:** un usuario DITEC puede loguearse, cargar un proyecto con su repo,
editarlo, y no ve nada interno de DIA.

## Etapa 2 — Catálogo cruzado de proyectos

**Objetivo:** cada equipo puede revisar qué está haciendo el otro.

- Nueva página "Proyectos por equipo" (o "Radar"): lista sobre `project_catalog` con
  todos los proyectos de todos los equipos.
- Badge de equipo (DIA / DITEC) con el color del equipo, filtros por equipo y estado,
  y búsqueda por nombre/descripción.
- La ficha de un proyecto ajeno muestra solo los campos públicos, con link al repo.

**Listo cuando:** desde DIA se ve el listado de proyectos DITEC con su ficha y viceversa.

## Etapa 3 — Detección de cruces

**Objetivo:** que el sistema avise solo, sin depender de que alguien mire el catálogo.

- **Similitud en Postgres:** extensiones `pg_trgm` + `unaccent`; función
  `find_similar_projects(name, description, repo_url)` que compara contra proyectos de
  otros equipos (trigram sobre nombre normalizado + keywords de descripción + match exacto
  de repo/URL).
- **Alerta en el alta:** al crear o editar un proyecto, si hay similitud por encima del
  umbral se muestra un aviso no bloqueante: "⚠ DITEC tiene un proyecto parecido:
  *Complejo Deportivo* — revisá antes de continuar".
- **Tabla `project_overlaps`:** pares detectados (`project_a`, `project_b`, `score`,
  `status`: pendiente / confirmado / descartado, `reviewed_by`, `reviewed_at`). Evita
  repetir avisos ya descartados.
- **Panel "Posibles cruces":** listado de pares con acciones "confirmar cruce" /
  "descartar", visible para ambos equipos.

**Listo cuando:** crear un proyecto llamado "Complejo Deportivo 2" con uno similar del otro
equipo dispara el aviso, y el par queda registrado en el panel.

## Etapa 4 — Adopción y pulido

**Objetivo:** que la herramienta se use de verdad.

- Notificación al detectar un cruce nuevo (correo o aviso del asistente DIA a ambos
  responsables).
- Carga inicial de los proyectos DITEC (planilla → seed SQL o carga asistida).
- Mini guía de uso para DITEC (una página en `docs/`).
- Métricas simples en el panel: cruces detectados, confirmados, descartados.

---

## Orden y dependencias

```
Etapa 0 (aislamiento)  →  Etapa 1 (cuentas DITEC)  →  Etapa 2 (catálogo)  →  Etapa 3 (detección)  →  Etapa 4 (adopción)
```

Las etapas 2 y 3 pueden desarrollarse en paralelo una vez terminada la 1.
El valor mínimo entregable es Etapa 0 + 1 + 2: con eso ya nadie se pisa si revisa el catálogo;
la Etapa 3 lo vuelve automático.

---

## Etapa 0 — Cómo aplicar y verificar

**Archivos involucrados:**

- `supabase/add_teams.sql` — migración idempotente para la base existente
  (teams, team_id, funciones helper, triggers, políticas RLS, vista `project_catalog`).
- `supabase/schema.sql` — actualizado para que una instalación desde cero nazca multi-equipo.
- `app/api/auth/me/route.ts` y `context/AuthContext.tsx` — exponen `teamId`, `teamSlug`
  y `teamName`; si la base todavía no está migrada, hacen fallback al esquema anterior
  (por eso el orden deploy/migración es indistinto).
- `types/domain.ts` — tipo `Team`.

**Pasos:**

1. Ejecutar `supabase/add_teams.sql` en el SQL Editor de Supabase (se puede re-ejecutar).
2. Verificar como usuario DIA: el dashboard se ve exactamente igual que antes.
3. Crear un usuario de prueba en Supabase Auth + una fila en `members` con
   `team_id = (select id from teams where slug = 'ditec')`.
4. Loguearse con ese usuario y confirmar que: no ve proyectos/tareas/expedientes de DIA,
   no puede editarlos (probar un update directo por consola), y sí ve la ficha de los
   proyectos DIA vía `select * from project_catalog`.

**Decisiones técnicas tomadas:**

- El `team_id` de un insert se completa por trigger con el equipo del usuario logueado;
  los inserts con service role (Alexa, imports, sync de GitHub) caen en DIA.
- Un usuario autenticado **sin** fila en `members` ya no ve ningún dato (antes veía todo).
- `expedientes` y `alexa_activity_log` quedaron restringidos al equipo `dia`.
- `schema_idempotent.sql` ya no crea políticas: la fuente de verdad de RLS es
  `add_teams.sql` (evita que una re-ejecución vieja reabra el acceso).
- Pendiente para revisar en Etapa 1: políticas del bucket de Storage de documentos
  (hoy no están versionadas en el repo).
