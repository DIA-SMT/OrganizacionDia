# Cuentas Supabase (inventario de free tier)

DIA crea varias cuentas de Supabase usando un mismo correo del municipio con
alias `+N` (por ejemplo `base+14@dominio.gob.ar`), para repartir los proyectos
y quedarse dentro del free tier. Este módulo lleva el registro de esas cuentas
y de qué proyecto vive en cada una, para no perder la cuenta (literal) de
"¿cuál fue el último alias?" y "¿qué hay en +12?".

Es un módulo **interno de DIA**: no lo ven los equipos externos (DITEC).

## Cómo reconstruir el inventario la primera vez

Supabase no permite listar "todas las cuentas de un correo": cada alias es una
cuenta independiente. Pero como todos los `+N` caen en la misma casilla real,
en ese inbox están los correos de "Confirm your signup" / "Welcome to Supabase"
de cada alias. Con eso se arma la lista de aliases y se sabe cuál fue el último.

## Página "Cuentas Supabase"

- **Banner superior:** último alias registrado y próximo número libre
  (`max(alias) + 1`).
- **Nueva cuenta:** al abrir el formulario, el número de alias y el correo se
  pre-completan sugiriendo el siguiente (toma el patrón `+N` del último cargado).
  Campos: número de alias, correo completo, etiqueta opcional, límite de
  proyectos (free tier = 2, editable) y notas.
- **Tarjeta por cuenta:** alias, etiqueta, correo, indicador `X/límite` (se pone
  ámbar cuando la cuenta llegó al tope) y la lista de proyectos vinculados, cada
  uno con un selector para moverlo a otra cuenta o quitarlo.
- **Proyectos sin cuenta:** los proyectos activos que todavía no están asignados,
  con un desplegable para asignarlos.

## Cómo se vincula un proyecto con su cuenta

Cada proyecto tiene el campo `supabase_account_id` (nullable). Se puede asignar:

- desde el alta de proyecto (selector "Cuenta Supabase", visible solo para DIA), o
- desde la propia página de cuentas (asignar / mover / quitar).

Los proyectos que no usan Supabase simplemente quedan sin cuenta.

## Datos y seguridad

- Tabla `public.supabase_accounts`, con RLS restringida a `current_team_slug() = 'dia'`.
- La vista `project_catalog` **no** expone `supabase_account_id`: el vínculo es
  interno y no se comparte entre equipos.
- Migración: `supabase/add_supabase_accounts.sql` (idempotente, va después de
  `add_teams.sql`).

## Posible mejora futura (no implementada)

Sincronización automática contra la Management API de Supabase para listar los
proyectos reales de cada cuenta. Requiere guardar un Personal Access Token por
cuenta, y **ese token da control total de la cuenta** (no hay scope de solo
lectura). Por eso hoy el inventario es manual; si se implementa, los tokens
deben vivir solo del lado del servidor y nunca llegar al navegador.
