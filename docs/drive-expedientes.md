# Expedientes desde Google Drive

El dashboard puede sincronizar PDFs de una carpeta de Drive usando una Google
Service Account. La cuenta no inicia sesion como usuario: se comparte la carpeta
con el email tecnico de la Service Account y el servidor lee los PDFs.

## Variables

Configurar en `.env.local` y Vercel:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID=
DRIVE_SYNC_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
EXPEDIENTES_OCR_MAX_PAGES=5
EXPEDIENTES_OCR_MAX_MB=15
```

`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` debe conservar los saltos de linea como
`\n`, por ejemplo:

```env
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Supabase

Ejecutar:

```sql
supabase/add_expedientes.sql
```

## Google Cloud

1. Crear un proyecto en Google Cloud.
2. Habilitar Google Drive API.
3. Crear una Service Account.
4. Crear una clave JSON.
5. Copiar `client_email` a `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Copiar `private_key` a `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
7. Compartir la carpeta de expedientes con el `client_email`.
8. Copiar el ID de la carpeta de Drive a `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID`.

## Sincronizacion

Desde el dashboard:

1. Abrir `Expedientes`.
2. Presionar `Sincronizar Drive`.

Para cron jobs externos o Vercel Cron, llamar:

```http
POST /api/drive/expedientes/sync
x-sync-secret: valor-de-DRIVE_SYNC_SECRET
```

La sincronizacion guarda nombre, link, fecha de Drive, estado y un pantallazo
inicial basado en metadatos. No ejecuta OCR automaticamente.

## Briefs manuales con OCR

Cada card de expediente tiene un boton `Generar brief`. Al presionarlo:

1. El servidor descarga ese PDF desde Drive.
2. Renderiza hasta `EXPEDIENTES_OCR_MAX_PAGES`.
3. Tesseract OCR reconoce el texto en español.
4. Se construye un brief extractivo y se guarda en Supabase.

El brief persiste en las columnas `summary` y `brief_generated_at`, por lo que
no es necesario volver a procesarlo al recargar la pagina. El boton cambia a
`Regenerar brief` por si se desea actualizarlo.

Controles:

- `EXPEDIENTES_OCR_MAX_PAGES`: paginas maximas procesadas por solicitud.
- `EXPEDIENTES_OCR_MAX_MB`: peso maximo permitido por PDF.

La prioridad sugerida se informa al terminar, pero no reemplaza la prioridad
manual del expediente.
