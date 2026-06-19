# Integración Alexa - Organización DIA

## Arquitectura

```text
Echo Dot
  -> Alexa Custom Skill
  -> AWS Lambda
  -> POST /api/alexa
  -> Supabase
```

La Lambda no contiene credenciales de Supabase. Solo conoce la URL del dashboard
y un secreto compartido. La API de Next.js es la única que utiliza
`SUPABASE_SERVICE_ROLE_KEY`.

## Funciones disponibles

- Resumen general del dashboard.
- Consulta detallada de un proyecto.
- Listado por estado o prioridad.
- Consulta de tareas pendientes.
- Creación de tareas con confirmación.
- Creación de proyectos con confirmación.

## 1. Preparar Supabase

En Supabase:

1. Abrir el proyecto.
2. Ir a **SQL Editor**.
3. Crear una consulta nueva.
4. Pegar y ejecutar `supabase/add_alexa_activity_log.sql`.
5. Ir a **Project Settings > API Keys**.
6. Copiar la clave secreta de servidor. Puede aparecer como `service_role` en
   proyectos antiguos o como una secret key `sb_secret_...` en proyectos nuevos.

No colocar esa clave en ninguna variable `NEXT_PUBLIC_*`.

## 2. Variables del dashboard

Agregar localmente y en Vercel:

```env
SUPABASE_SERVICE_ROLE_KEY=clave_privada_de_supabase
ALEXA_API_SECRET=secreto_largo_compartido
ALEXA_ALLOWED_USER_IDS=
```

Durante la primera prueba, `ALEXA_ALLOWED_USER_IDS` puede quedar vacío. Después de
obtener el identificador real del usuario Alexa, configurarlo y volver a desplegar:

```env
ALEXA_ALLOWED_USER_IDS=amzn1.ask.account.identificador
```

## 3. Crear la Lambda

1. Entrar a AWS Console.
2. Abrir **Lambda**.
3. Elegir **Create function > Author from scratch**.
4. Nombre: `organizacion-dia-alexa`.
5. Runtime: una versión vigente de Node.js compatible con `fetch`, por ejemplo Node.js 22.
6. Arquitectura: `x86_64`.
7. Crear la función.
8. Copiar el contenido de `alexa-skill/lambda/index.mjs` en `index.mjs`.
9. Configurar el handler como:

```text
index.handler
```

10. En **Configuration > Environment variables**, agregar:

```env
DASHBOARD_API_URL=https://organizacion-dia.vercel.app/api/alexa
ALEXA_API_SECRET=el_mismo_secreto_configurado_en_vercel
```

11. Desplegar la función.
12. Copiar su ARN.

## 4. Crear la Alexa Custom Skill

1. Entrar a <https://developer.amazon.com/alexa/console/ask>.
2. Elegir **Create Skill**.
3. Nombre: `Organización DIA`.
4. Tipo de experiencia: **Other**.
5. Modelo: **Custom**.
6. Hosting: **Provision your own**.
7. Elegir el idioma que usa el Echo Dot.
8. En **Interaction Model > JSON Editor**, pegar
   `alexa-skill/interaction-model-es.json`.
9. Guardar y seleccionar **Build Model**.
10. En **Endpoint**, seleccionar AWS Lambda ARN.
11. Pegar el ARN de la función en la región correspondiente.
12. Guardar.

## 5. Vincular Lambda con Alexa

En AWS Lambda:

1. Seleccionar **Add trigger**.
2. Elegir **Alexa Skills Kit**.
3. Pegar el Skill ID que muestra Alexa Developer Console.
4. Guardar.

Esto limita las invocaciones de la Lambda a esa Skill.

## 6. Primera prueba

En Alexa Developer Console:

1. Abrir **Test**.
2. Activar `Skill testing is enabled in Development`.
3. Probar:

```text
abre organización día
dame un resumen
cómo está Bot Turismo
cuáles son las tareas pendientes
creá una tarea revisar login para Bot Turismo con prioridad alta
```

Para operaciones de escritura, Alexa debe pedir confirmación antes de ejecutar.

## 7. Restringir el usuario Alexa

Después de una primera petición exitosa:

1. Abrir Supabase.
2. Revisar `alexa_activity_log`.
3. Copiar `alexa_user_id`.
4. Configurar ese valor en `ALEXA_ALLOWED_USER_IDS` en Vercel.
5. Volver a desplegar.

Para múltiples usuarios:

```env
ALEXA_ALLOWED_USER_IDS=id_usuario_1,id_usuario_2
```

## 8. Seguridad

- No exponer `SUPABASE_SERVICE_ROLE_KEY`.
- No registrar `ALEXA_API_SECRET` en Git.
- Mantener confirmación obligatoria para escrituras.
- Revisar periódicamente `alexa_activity_log`.
- Rotar `ALEXA_API_SECRET` si se filtra.
- Agregar Account Linking antes de habilitar la Skill para usuarios externos.

## 9. Variables de Vercel

Las variables deben cargarse en **Settings > Environment Variables** para
Production, Preview y Development:

| Key | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de Supabase |
| `ALEXA_API_SECRET` | Secreto largo compartido |
| `ALEXA_ALLOWED_USER_IDS` | Vacío en primera prueba; luego IDs permitidos |

