# Organizacion DIA

Sistema interno para gestionar proyectos de programacion del equipo DIA.

## Objetivo

Centralizar proyectos, tareas tecnicas, responsables, revisiones, testeos, impedimentos y entregas en una herramienta simple para uso interno.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth + Postgres
- Lucide React para iconos

## Funcionalidades base

- Dashboard de proyectos activos.
- Seguimiento de avance por proyecto.
- Tareas tecnicas por estado, responsable y tipo.
- Miembros del equipo con rol y especialidad.
- Impedimentos abiertos/resueltos para detectar que tareas no pueden avanzar.
- Comentarios o avances por tarea/proyecto.
- Links a repositorio, ambiente de prueba, produccion, issue, PR y branch.

## Estados definidos

### Proyectos

- Backlog
- Planificacion
- En desarrollo
- QA
- Deployado
- Mantenimiento
- Pausado

### Tareas

- Backlog
- Pendiente
- En desarrollo
- En revision
- QA
- Bloqueada
- Terminada

## Puesta en marcha

1. Instalar dependencias:

```powershell
npm install
```

2. Crear `.env.local` desde `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

3. Crear una base nueva en Supabase.

4. Ejecutar el esquema:

```text
supabase/schema.sql
```

5. Opcional: cargar datos de ejemplo:

```text
supabase/seed.sql
```

6. Iniciar desarrollo:

```powershell
npm run dev
```

7. Abrir:

```text
http://localhost:3000
```

## Orden recomendado de desarrollo

1. Conectar dashboard a Supabase.
2. Agregar login.
3. Crear CRUD de miembros.
4. Crear CRUD de proyectos.
5. Crear CRUD de tareas y asignaciones.
6. Agregar vista de impedimentos.
7. Agregar comentarios/avances.
8. Agregar reportes y notificaciones.

## Notas de seguridad

El esquema inicial permite lectura y escritura a cualquier usuario autenticado para acelerar el desarrollo interno. Antes de produccion conviene endurecer RLS para que solo `Admin` y `PM` puedan crear proyectos, y para que cada dev actualice solo sus tareas asignadas.
