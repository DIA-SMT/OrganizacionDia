# Conectar un Migue al dashboard

La sección **Migue** del dashboard muestra, para cada asistente de IA, cuántas
conversaciones tuvo, cómo terminaron, qué le preguntan y qué no supo responder.
Los números los manda cada bot: cuando atiende una conversación, le avisa al
dashboard con un pedido HTTP. Esta guía es para el equipo que mantiene el bot.

Migue DIA (el chat del dashboard) ya reporta solo, desde este repo. Su chat es de
preguntas sueltas, así que cuenta **cada pregunta** como una conversación.

## 1. Pedir la clave

Cada Migue tiene su propia clave. La genera alguien de DIA con acceso al repo:

```bash
npm run migue:token -- turismo
```

El comando imprime la clave (se muestra una sola vez) y un SQL para ejecutar en
Supabase > SQL Editor, que guarda solo su hash. El nombre (`turismo`) es el slug
del Migue en `lib/migue.ts`. Correrlo de nuevo reemplaza la clave anterior.

La clave va en el servidor del bot, por ejemplo como `MIGUE_API_KEY`. Nunca en
el frontend ni en el repo.

## 2. Enviar cada conversación

```
POST https://<dominio-del-dashboard>/api/migue/conversaciones
Authorization: Bearer <MIGUE_API_KEY>
Content-Type: application/json
```

```json
{
  "conversations": [
    {
      "conversation_id": "wa-2f9c1e",
      "started_at": "2026-09-28T14:03:00-03:00",
      "ended_at": "2026-09-28T14:09:30-03:00",
      "channel": "WhatsApp",
      "messages": 8,
      "outcome": "resuelta",
      "feedback": "positiva",
      "avg_response_ms": 1800,
      "tokens_in": 2400,
      "tokens_out": 610,
      "cost_usd": 0.0021,
      "topic": "Agenda cultural"
    }
  ]
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `conversation_id` | sí | Id de la conversación en el bot (máx. 200 caracteres; más largo se rechaza). No puede ser el teléfono ni el nombre del vecino. |
| `started_at` | sí | Fecha y hora ISO 8601 **con zona horaria** (`-03:00` o `Z`). Sin zona se rechaza. Hasta 400 días hacia atrás. |
| `outcome` | sí | `resuelta`, `derivada` (pasó a una persona) o `sin_respuesta` (el bot no supo contestar). |
| `messages` | no | Mensajes totales de la conversación (vecino + bot). Máx. 100.000. |
| `ended_at` | no | Última actividad, también con zona horaria. |
| `channel` | no | `WhatsApp`, `Web`, `App`... (máx. 30 caracteres). |
| `feedback` | no | `positiva` o `negativa`, si el bot pide valoración. |
| `avg_response_ms` | no | Tiempo promedio que tardó el bot en responder, en milisegundos (máx. 600.000). Si no se envía, esa conversación no cuenta para el promedio. |
| `tokens_in`, `tokens_out`, `cost_usd` | no | Consumo del modelo (tokens hasta 100 millones, costo menor a 1.000 USD). OpenRouter los devuelve en `usage` (el costo, pidiendo `"usage": { "include": true }`). |
| `topic` | no | Tema de la consulta, corto (máx. 80). Sirve para "Temas más consultados". |
| `unanswered_question` | no | Solo con `outcome: "sin_respuesta"`: la pregunta que no supo responder (se recorta a 300). |

Respuesta: `{ "stored": 1, "rejected": [] }`. Si alguna conversación viene mal,
se guardan las demás y la mala aparece en `rejected` con el motivo.

### Una conversación, varios envíos

No hace falta detectar cuándo "termina" una charla. El bot puede enviar la
conversación después de cada respuesta con los valores **acumulados** y el mismo
`conversation_id`: la fila se actualiza. Por ejemplo, en WhatsApp, un id por
sesión (el de la plataforma, o uno propio que cambie después de 30 minutos sin
mensajes).

Gana siempre el envío más reciente: si llega tarde un envío viejo (un reintento
atrasado, con menos mensajes o una actividad anterior), se ignora y no pisa lo
que ya estaba.

Se pueden mandar hasta 500 conversaciones por pedido. Si el envío falla, que el
bot lo reintente más tarde: reenviar lo mismo no duplica nada. Las filas con un
dato inválido vuelven en `rejected`; reenviarlas sin corregirlas no sirve.

### Ejemplo en Node

```js
async function reportarAMigue(conversacion) {
  try {
    await fetch(`${process.env.DASHBOARD_URL}/api/migue/conversaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MIGUE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversations: [conversacion] }),
    })
  } catch (error) {
    // Nunca frenar la respuesta al vecino por esto.
    console.warn('No se pudo reportar a Migue', error)
  }
}
```

## Datos personales

El dashboard mide el uso, no guarda conversaciones. No enviar teléfonos, nombres,
DNI, direcciones ni el texto de la charla. La única excepción es
`unanswered_question`: si el vecino escribió datos personales en esa pregunta,
el bot tiene que quitarlos antes de enviarla (o no mandarla).

Como segunda barrera, el dashboard tapa al recibirla correos, números de
documento o teléfono, alturas de calle y nombres presentados ("soy ..."). No
atrapa todos los nombres, así que la responsabilidad sigue siendo del bot.

## Qué se ve en el dashboard

- **Efectividad** = conversaciones `resuelta` / total.
- **Satisfacción** = `positiva` / (`positiva` + `negativa`). Queda vacía si el bot
  no pide valoración.
- Los días se cuentan en hora de Tucumán.
- Un Migue con clave que todavía no mandó nada aparece como "Esperando datos";
  uno que no reporta hace más de 3 días, como "Inactivo".

La estructura de la base está en `supabase/add_migue.sql`: la tabla
`migue_conversations`, la vista diaria `migue_daily_stats` y las funciones
`migue_top_topics` y `migue_top_unanswered`.
