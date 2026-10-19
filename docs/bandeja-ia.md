# Bandeja IA

Módulo del Dashboard DIA para la casilla institucional compartida (Gmail / Google
Workspace). Detecta mensajes importantes, sugiere prioridad y categoría, marca
vencimientos y deja historial de cada gestión.

En la oficina todos entran al Dashboard con la cuenta de la DIA, y los días de guardia se
reparten fuera del sistema. Por eso el módulo no maneja responsables, guardias ni
permisos por persona: muestra el panel y la bandeja, igual para todos.

> **Estado actual: conectado a la base; sincronización con Gmail lista, falta habilitarla.** La interfaz lee y escribe en
> Supabase con la sesión (RLS): gestiones de los asuntos, notas, reglas e historial. No
> hay datos de demostración. La bandeja se llena cuando se habilita la sincronización
> (ver "Puesta en marcha de Gmail").

## Rutas

| Ruta | Vista |
| --- | --- |
| `/bandeja-ia` | Panel principal: cartel de bases de Supabase por pausarse, importantes, pendientes, vencimientos, prioridades sin confirmar, lista de atención y posibles eventos aparte |
| `/bandeja-ia/bandeja` | Bandeja inteligente: tabla (escritorio) o tarjetas (mobile), búsqueda y filtros |
| `/bandeja-ia/asunto/[id]` | Detalle: el correo completo (leído de Gmail en el momento) con enlace a Gmail, motivo de prioridad, fechas, notas, historial; cambiar estado, confirmar prioridad, resolver |
| `/bandeja-ia/historial` | Registro de acciones y asuntos cerrados |
| `/bandeja-ia/configuracion` | Reglas de clasificación, estado de Gmail y notificaciones |

Rutas de API (todas requieren sesión):

- `GET /api/bandeja-ia/access`: resuelve en el servidor si la cuenta puede entrar y con qué rol.
- `GET /api/bandeja-ia/gmail/status`: estado de la integración y de las sincronizaciones (qué variables están cargadas, nunca sus valores).
- `POST /api/bandeja-ia/gmail/push`: avisos de Pub/Sub. Pública, autenticada con el JWT firmado por Google.
- `POST /api/bandeja-ia/gmail/cron`: respaldo horario y "Sincronizar ahora". Pública, autenticada con `BANDEJA_IA_CRON_SECRET` o sesión admin.
- `GET /api/bandeja-ia/asuntos/[id]/correo`: la conversación completa de un asunto, leída de Gmail en el momento. No se guarda.
- `POST /api/bandeja-ia/reclasificar`: aplica las reglas actuales a los asuntos existentes (solo admin).

## Acceso

El acceso **no** se hereda del Dashboard. Para entrar hacen falta las tres cosas:

1. Sesión válida de Supabase Auth.
2. Ser integrante activo del equipo **DIA** (`current_team_slug() = 'dia'`). DITEC y
   cualquier otro equipo quedan fuera; además `/bandeja-ia` no figura entre las rutas
   compartidas de `lib/team-access.ts`, así que `TeamGate` los redirige.
3. Una fila activa en `bandeja_ia_permissions` (función `bandeja_ia_current_role()`), con
   rol `admin` (además cambia reglas), `operador` (gestiona asuntos) o `lector` (solo mira).

Hoy hay una sola fila: la cuenta compartida de la DIA, con rol `admin`, cargada a mano
por SQL. Si alguna vez hiciera falta otra cuenta, se agrega igual:

```sql
insert into public.bandeja_ia_permissions (member_id, role, notes)
select id, 'operador', 'Alta manual'
from public.members
where lower(email) = lower('cuenta@smt.gob.ar') and active;
```

Sin la migración aplicada, el permiso sale de la variable **solo servidor**
`BANDEJA_IA_DEMO_ACCESS` (`email:rol` separados por coma). Con la migración se ignora.

Como la cuenta es compartida, el historial muestra que todo lo hizo la cuenta de la DIA:
no distingue personas.

## Datos y escrituras

- **Capa de datos:** `lib/bandeja-ia/repository.ts` lee todo lo del módulo en una sola
  pasada y escribe con la sesión. `lib/bandeja-ia/store.ts` lo comparte entre
  pantallas y vuelve a leer después de cada acción.
- **Conversión de filas:** `lib/bandeja-ia/db.ts` traduce las filas de la base al modelo
  de la app, sin red y con tests. También arma el historial legible a partir de
  `bandeja_ia_audit_log`.
- **Firmas:** quién confirmó una prioridad o resolvió un asunto lo registran los
  triggers de la base, no el navegador.
- **Reglas:** las reglas por defecto viven en el código (`lib/bandeja-ia/rules.ts`).
  Cuando admin activa o desactiva una, se guarda en `bandeja_ia_rules` y desde ahí pisa a
  la del código.

## Modelo de datos (`supabase/add_bandeja_ia.sql`)

| Tabla | Para qué | Escribe |
| --- | --- | --- |
| `bandeja_ia_permissions` | Permiso específico por integrante (`admin` / `operador` / `lector`) | admin (nunca el propio) |
| `bandeja_ia_settings` | Fila única: casilla, zona horaria, interruptores (arrancan apagados) | admin |
| `bandeja_ia_rules` | Reglas de clasificación editables | admin |
| `bandeja_ia_guard_rotation` | Sin uso (las guardias se organizan fuera del sistema) | — |
| `bandeja_ia_guard_shifts` | Sin uso | — |
| `bandeja_ia_guard_changes` | Sin uso | — |
| `bandeja_ia_messages` | Metadatos de Gmail (sin cuerpo ni adjuntos) | **solo servidor** |
| `bandeja_ia_asuntos` | Gestión por conversación: prioridad, categoría, estado, vencimiento (la columna de responsable no se usa) | operador / servidor |
| `bandeja_ia_asunto_messages` | Vínculo asunto ↔ mensajes | solo servidor |
| `bandeja_ia_notes` | Notas internas (no se editan ni se borran) | operador (firmado) |
| `bandeja_ia_assignments` | Sin uso (no hay responsables) | trigger |
| `bandeja_ia_notifications` | Alertas y confirmaciones de lectura (sin datos sensibles) | servidor; se confirman con `bandeja_ia_acknowledge_notification()` |
| `bandeja_ia_sync_state` | historyId, vencimiento del watch, fallas, próximo reintento | solo servidor (lo ve admin) |
| `bandeja_ia_sync_runs` | Registro de corridas de sincronización | solo servidor (lo ve admin) |
| `bandeja_ia_pubsub_events` | Pushes de Pub/Sub ya recibidos (idempotencia) | solo servidor |
| `bandeja_ia_audit_log` | Auditoría de todos los cambios | triggers; nadie la edita ni la borra |

Las identidades salen de las tablas existentes (`members.id`, vinculado a Supabase Auth
por `auth_user_id`/email). La migración no modifica ninguna tabla existente.

RLS: todas las tablas tienen RLS. Las lecturas exigen `bandeja_ia_has_access()`, la
gestión `bandeja_ia_can_operate()` y la administración `bandeja_ia_is_admin()`. `anon`
no tiene privilegios. Los triggers firman con la cuenta logueada quién confirma la
prioridad o resuelve, así que el navegador no puede falsearlo.

**Validación:** las migraciones se probaron en un Postgres local en memoria (PGlite) con
un stub de Supabase Auth. Se verificó:

- que son idempotentes y que el rollback las revierte por completo;
- los roles admin, operador y lector;
- el acceso denegado para un Admin del Dashboard sin permiso, para DITEC aunque tenga fila de permiso y para un permiso revocado;
- que los mensajes los escribe solo el servidor;
- que las notas quedan firmadas;
- que la auditoría es inmutable;
- que la v2 aplicada sobre la versión anterior completa la configuración y deja que los
  operadores registren ausencias, sin poder armar la rotación ni cambiar reglas.

### Aplicarla

1. Hacer un backup de la base.
2. Instalación nueva: ejecutar `supabase/add_bandeja_ia.sql` (ya incluye la v2 y la v3).
   Base que ya corrió la versión anterior: ejecutar `supabase/update_bandeja_ia_v2.sql` y
   después `supabase/update_bandeja_ia_v3.sql`.
3. Dar de alta el primer admin, a mano:

   ```sql
   insert into public.bandeja_ia_permissions (member_id, role, notes)
   select id, 'admin', 'Alta inicial'
   from public.members
   where lower(email) = lower('persona@smt.gob.ar') and active;
   ```

4. Para revertir: `supabase/rollback_bandeja_ia.sql`. Borra los datos del módulo; si hace
   falta, exportar antes la auditoría.

Qué agrega la v2 (`supabase/update_bandeja_ia_v2.sql`, ya aplicada en la base). Son
cambios pensados para guardias y responsables; la interfaz actual ya no los usa, pero
no molestan:

- `guard_weekdays` y `guard_anchor_date` en `bandeja_ia_settings`, es decir, los días con
  guardia y el lunes desde el que cuenta la rotación. Sin estas columnas la rotación
  arranca el lunes de la semana actual y se corre cada semana.
- La lista de permisos pasa a ser visible para quien tiene acceso, para poder asignar
  asuntos a otra persona.
- Los operadores pueden dar de alta y borrar excepciones de guardia (ausencias,
  intercambios); antes solo podía admin.

## Sincronización con Gmail

```
Gmail (casilla institucional)
   │  users.watch (INBOX)                     ┌──────────────────────────────────┐
   ├────────────► Google Cloud Pub/Sub ──push──►│ POST /api/bandeja-ia/gmail/push   │
   │                                           │  · valida el JWT OIDC de Google   │
   │  history.list / messages.get             │  · registra el aviso una sola vez │
   │  (format=metadata, solo lectura)         │  · corre la sync incremental      │
   ◄───────────────────────────────────────────┤                                   │
                                               └────────────────┬─────────────────┘
   GitHub Actions cada hora ──► POST /api/bandeja-ia/gmail/cron │
   (o "Sincronizar ahora")       · renueva el aviso (vence a    ▼
                                   los 7 días)      Supabase (service role, solo servidor)
                                 · trae lo pendiente  mensajes → asuntos (reglas)
```

**Una sola casilla.** La casilla institucional se autoriza una vez, con OAuth 2.0 y el
scope `gmail.readonly`. El refresh token queda en las variables del servidor; nadie más
recibe tokens de Gmail.

**Secretos.** Client ID, client secret, refresh token y secreto del cron van **solo** en
variables del servidor (Vercel y `.env.local`). Nunca llevan `NEXT_PUBLIC_`. El access
token vive en memoria del servidor (`lib/bandeja-ia/gmail/client.ts`). Si aparece una
variable de Gmail con `NEXT_PUBLIC_`, `readGmailStatus()` la informa y bloquea la
integración.

**Cómo funciona** (`lib/bandeja-ia/gmail/`):

- `sync.ts` es el motor. Está separado de Gmail y de Supabase por interfaces y se testea
  con datos en memoria (`sync.test.mts`). Lo que hace:
  - renueva el aviso de Gmail (watch) si vence en menos de un día;
  - la primera vez hace una sincronización inicial: los últimos
    `bandeja_ia_settings.initial_sync_days` días, hasta 300 correos;
  - después, incremental desde el último `historyId`;
  - guarda los metadatos y crea un asunto por conversación, clasificado con las reglas.
    Si ya existía, le sube la prioridad (salvo que una persona la haya confirmado),
    actualiza el vencimiento si el nuevo es más cercano y lo reabre si estaba cerrado.
- `supabase-store.ts` hace las lecturas y escrituras con service role. La auditoría
  registra estos cambios como "Sistema".
- `pubsub-auth.ts` verifica la firma RS256 del push contra las claves públicas de
  Google, y además la audiencia, el emisor, el vencimiento y, si se configuró, la cuenta
  de servicio.
- `runner.ts` evita dos corridas a la vez en la misma instancia. Si igual coinciden, las
  restricciones `unique` de la base evitan duplicados.

| Situación | Qué pasa |
| --- | --- |
| Pub/Sub manda el mismo aviso dos veces | Se registra en `bandeja_ia_pubsub_events` y el segundo se ignora |
| Aviso con un historyId ya procesado | Se ignora (`isStaleNotification`) |
| historyId vencido (404 de Gmail) | Se marca resincronización completa |
| Error de Gmail (429, 5xx, cuota) | Reintento con espera exponencial de 30 s a 30 min |
| Token revocado (401) | Estado "Hay que volver a autorizar la casilla" en Configuración |
| Corrida cortada por tiempo | No avanza el historyId; la próxima retoma sin duplicar |
| Mensaje borrado antes de leerlo | Se ignora |
| Integración apagada | `push` responde 204 (Pub/Sub no reintenta) y `cron` responde 200 sin hacer nada |

**Monitoreo:** Configuración → Integración con Gmail muestra:
- el estado, la última sincronización y cuándo vence el aviso;
- las fallas seguidas, el último error y las últimas 5 corridas;
- qué variables están cargadas (nunca sus valores);
- el botón **Sincronizar ahora** (solo admin).

**Ver el correo completo.** Al abrir un asunto, el servidor le pide a Gmail la
conversación entera (`threads.get`, solo lectura) y la manda al navegador sin guardarla
en la base ni en caches (`Cache-Control: no-store`). Solo la ve quien tiene permiso de
Bandeja IA y puede ver ese asunto (RLS).

Se muestra en un iframe aislado:
- `sandbox` sin `allow-scripts`: el correo no puede ejecutar código ni tocar el Dashboard;
- CSP que bloquea todo lo externo;
- links que abren en otra pestaña.

Las imágenes:
- las incrustadas (logos, firmas, `cid:`) se embeben y se ven siempre;
- las externas quedan ocultas hasta tocar "Mostrar imágenes", porque suelen ser píxeles
  de rastreo.

El botón **Abrir en Gmail** lleva a la conversación en la cuenta de la casilla.

**Lo que no hace, a propósito:**
- No responde, no envía, no borra, no mueve ni etiqueta correos; el cliente no tiene
  métodos para eso.
- No guarda cuerpos ni adjuntos. Los adjuntos se listan con nombre y tamaño, y se abren
  desde Gmail.
- El extracto se usa en memoria para clasificar y solo se guarda si
  `bandeja_ia_settings.store_snippets` está en `true` (por defecto, no).
- No manda contenido a ninguna IA externa.

## Reglas y notificaciones

- **Prioridades:**
  - crítica (aviso de pausa de Supabase, urgencia explícita, o plazo/reunión alta dentro de las 48 h);
  - alta (autoridades, plazos, reuniones, posibles eventos);
  - normal;
  - informativa (boletines y avisos automáticos).
- **Categorías:** base por pausarse, posible evento, reunión, fecha límite, requiere
  respuesta, documentación, informativo.
- **Base por pausarse** (regla `supabase_pausa`, la primera de todas). Son los avisos de
  Supabase de que un proyecto se va a pausar o ya se pausó por inactividad: todas las
  bases del equipo están ahí y una base pausada tira abajo el proyecto.
  - Exige que el remitente sea de Supabase (`from_keywords`) y busca "pause", "paused",
    "inactivity", "pausar", etc.
  - Quedan con prioridad crítica y aparecen en un cartel rojo arriba del panel hasta que
    se resuelven.
- **Posible evento** (regla `invitacion`): invitaciones a eventos, jornadas, actos o
  capacitaciones. Prioridad alta, y en el panel van en su propia sección, separadas de
  "Requieren atención".
- **Reclasificar:** las reglas se aplican solas a los correos nuevos. Para los asuntos que
  ya existen, Configuración tiene el botón **Reclasificar asuntos**. Cambia la categoría
  de todos y la prioridad solo de los que nadie confirmó a mano. Escribe con service
  role, así que en el historial figura como "Sistema".
- **Fechas:** detecta `15/10`, `15-10-2026`, `15 de octubre`, `hoy`, `mañana`,
  `el viernes` y horarios como `10:30 hs`. Todo se interpreta en
  `America/Argentina/Tucuman` (UTC-3, sin horario de verano).
- **Confirmación humana:** la prioridad sugerida queda "sin confirmar" hasta que un
  operador la confirma o la corrige. Queda firmado.
- **Alertas** (`lib/bandeja-ia/notifications.ts`):
  - Llevan solo un título genérico, la prioridad, la categoría y el enlace al Dashboard.
    **Nunca** incluyen remitente, asunto ni contenido.
  - Se generan para: asunto crítico o alto nuevo y vencimiento próximo.
  - `shouldDispatch()` bloquea todo envío salvo que estén encendidos Gmail, las alertas y, para Telegram, también Telegram.
  - Hoy está todo apagado y **no se genera ninguna alerta real**. El contador del sidebar
    cuenta los asuntos abiertos críticos y altos de la base.
- **Telegram (futuro):** `telegramText()` arma el mensaje neutro. Faltan el bot, el
  vínculo integrante ↔ chat y la autorización.

## Variables de entorno (todas solo servidor)

| Variable | Uso |
| --- | --- |
| `BANDEJA_IA_DEMO_ACCESS` | Permisos solo mientras no se aplique la migración (después se ignora) |
| `BANDEJA_IA_GMAIL_ENABLED` | Interruptor general (`true` para habilitar). Apagado por defecto |
| `BANDEJA_IA_GMAIL_CLIENT_ID` / `BANDEJA_IA_GMAIL_CLIENT_SECRET` | Cliente OAuth de Google Cloud |
| `BANDEJA_IA_GMAIL_REFRESH_TOKEN` | Token de la casilla institucional (autorización única) |
| `BANDEJA_IA_GMAIL_MAILBOX` | Dirección de la casilla autorizada |
| `BANDEJA_IA_PUBSUB_TOPIC` | `projects/<proyecto>/topics/<topic>` |
| `BANDEJA_IA_PUBSUB_AUDIENCE` | Audiencia esperada en el JWT del push: la URL de `/api/bandeja-ia/gmail/push` |
| `BANDEJA_IA_PUBSUB_SERVICE_ACCOUNT` | Recomendada: email de la cuenta de servicio de la suscripción push |
| `BANDEJA_IA_CRON_SECRET` | Secreto del cron (también como secret del repo en GitHub Actions) |
| `BANDEJA_IA_ALERTS_ENABLED` / `BANDEJA_IA_TELEGRAM_ENABLED` | Alertas (apagadas por defecto) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya existente; la sincronización escribe con service role |

No se modificó `.env.example` ni ningún `.env`. Estas variables se cargan a mano cuando
corresponda.

## Puesta en marcha de Gmail

Ya hecho (2026-10-19):
- en la base, `add_bandeja_ia.sql` y `update_bandeja_ia_v2.sql`, y el permiso de la cuenta de la DIA;
- en Google Cloud, el proyecto, Gmail API, la pantalla de consentimiento (interna), el
  cliente OAuth, el refresh token, el tema `bandeja-ia-gmail` y la suscripción push con
  la cuenta de servicio `bandeja-ia-push`;
- el deploy en producción, con la sincronización funcionando.

Para la versión con avisos de Supabase y posibles eventos:

1. **Antes del deploy**, correr `supabase/update_bandeja_ia_v3.sql`. Agrega la categoría
   `base_pausa` y la columna `from_keywords`. Si se despliega sin esto, los avisos de
   Supabase no se pueden guardar.
2. Desplegar y, en Configuración, tocar **Reclasificar asuntos** para aplicar las reglas
   nuevas a lo que ya está.

Pendiente:
- **Secret del repo en GitHub:** `BANDEJA_IA_CRON_SECRET` (Settings → Secrets and
  variables → Actions), con el mismo valor que en Vercel, para el cron horario.
- **Alertas:** siguen apagadas. Se encienden de forma explícita
  (`BANDEJA_IA_ALERTS_ENABLED` y `bandeja_ia_settings.alerts_enabled`) cuando se decida.
