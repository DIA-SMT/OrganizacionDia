import assert from 'node:assert/strict'
import test from 'node:test'

// Miercoles 14/10/2026 10:00 en Tucuman (13:00 UTC).
const NOW = new Date('2026-10-14T13:00:00Z')

function message(subject: string, snippet = '', fromAddress = 'alguien@organismo.example') {
  return { subject, snippet, fromName: 'Remitente', fromAddress }
}

test('la hora de Tucuman define el dia, aunque en UTC ya sea el siguiente', async () => {
  const { tucumanDateKey, tucumanWeekday } = await import('./time.ts')

  // 02:30 UTC del 15 = 23:30 del 14 en Tucuman.
  assert.equal(tucumanDateKey(new Date('2026-10-15T02:30:00Z')), '2026-10-14')
  assert.equal(tucumanWeekday(new Date('2026-10-15T02:30:00Z')), 3)
})

test('convierte fecha y hora de Tucuman a UTC (UTC-3 sin horario de verano)', async () => {
  const { tucumanDateTimeToIso, startOfWeekKey, addDaysToKey, daysBetweenKeys } = await import('./time.ts')

  assert.equal(tucumanDateTimeToIso('2026-10-14', '10:30'), '2026-10-14T13:30:00.000Z')
  assert.equal(tucumanDateTimeToIso('2026-01-20', '22:00'), '2026-01-21T01:00:00.000Z')
  assert.equal(startOfWeekKey('2026-10-18'), '2026-10-12')
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01')
  assert.equal(daysBetweenKeys('2026-10-14', '2026-10-20'), 6)
})

test('etiqueta vencimientos relativos al dia de Tucuman', async () => {
  const { relativeDueLabel } = await import('./time.ts')

  assert.deepEqual(relativeDueLabel('2026-10-14T20:00:00Z', NOW), { label: 'Vence hoy', tone: 'hoy' })
  assert.equal(relativeDueLabel('2026-10-15T15:00:00Z', NOW).label, 'Vence mañana')
  assert.equal(relativeDueLabel('2026-10-12T15:00:00Z', NOW).tone, 'vencido')
  assert.equal(relativeDueLabel('2026-10-30T15:00:00Z', NOW).tone, 'lejos')
})

test('detecta fechas numericas, con mes en palabras y relativas', async () => {
  const { detectDates } = await import('./rules.ts')

  const dates = detectDates('Plazo hasta el 20/10 a las 12 hs. Reunion el 3 de noviembre. Avisar manana.', NOW)
  assert.deepEqual(
    dates.map((item) => [item.date, item.kind]),
    [
      ['2026-10-15', 'mencion'],
      ['2026-10-20', 'fecha_limite'],
      ['2026-11-03', 'reunion'],
    ],
  )
  assert.equal(dates[1].time, '12:00')
})

test('una fecha sin anio que ya paso hace meses se interpreta en el anio siguiente', async () => {
  const { detectDates } = await import('./rules.ts')

  const [date] = detectDates('Entrega el 10/01', new Date('2026-12-20T13:00:00Z'))
  assert.equal(date.date, '2027-01-10')
})

test('descarta fechas imposibles y "por la manana"', async () => {
  const { detectDates } = await import('./rules.ts')

  assert.deepEqual(detectDates('Vence el 31/02', NOW), [])
  assert.deepEqual(detectDates('Pasamos por la manana', NOW), [])
})

test('resuelve dias de semana hacia adelante', async () => {
  const { detectDates } = await import('./rules.ts')

  // Hoy es miercoles: "el viernes" es el 16; "el miercoles" es el de la semana siguiente.
  assert.equal(detectDates('Reunion el viernes', NOW)[0].date, '2026-10-16')
  assert.equal(detectDates('Reunion el miercoles', NOW)[0].date, '2026-10-21')
})

test('lo urgente es critico y pide respuesta', async () => {
  const { classifyMessage } = await import('./rules.ts')

  const result = classifyMessage(message('URGENTE: informe pendiente'), NOW)
  assert.equal(result.priority, 'critica')
  assert.equal(result.requiresResponse, true)
  assert.ok(result.reasons.some((reason) => reason.includes('Urgencia explícita')))
})

test('una reunion con fecha en las proximas 48 h sube un escalon', async () => {
  const { classifyMessage } = await import('./rules.ts')

  const near = classifyMessage(message('Convocatoria a reunion', 'Nos vemos el 15/10 a las 10:30'), NOW)
  assert.equal(near.category, 'reunion')
  assert.equal(near.priority, 'critica')

  const far = classifyMessage(message('Convocatoria a reunion', 'Nos vemos el 30/10'), NOW)
  assert.equal(far.priority, 'alta')
})

test('los boletines son informativos salvo que otra regla los suba', async () => {
  const { classifyMessage } = await import('./rules.ts')

  assert.equal(classifyMessage(message('Newsletter semanal', 'Por favor no responder'), NOW).priority, 'informativa')
  assert.equal(classifyMessage(message('Boletin: reunion urgente'), NOW).priority, 'critica')
})

test('las reglas ignoran tildes y mayusculas, y no matchean dentro de otras palabras', async () => {
  const { classifyMessage } = await import('./rules.ts')

  assert.equal(classifyMessage(message('INVITACIÓN a la jornada'), NOW).category, 'invitacion')
  // "actores" contiene "acto" pero no es una invitacion.
  assert.equal(classifyMessage(message('Listado de actores del ecosistema'), NOW).category, 'informativo')
})

test('una regla desactivada no aplica', async () => {
  const { classifyMessage, DEFAULT_RULES } = await import('./rules.ts')

  const rules = DEFAULT_RULES.map((rule) => (rule.id === 'urgente' ? { ...rule, active: false } : rule))
  assert.equal(classifyMessage(message('URGENTE'), NOW, rules).priority, 'normal')
})

test('el vencimiento usa primero el plazo y si no la reunion', async () => {
  const { classifyMessage, dueDateFromClassification } = await import('./rules.ts')

  const result = classifyMessage(message('Reunion el 20/10', 'Plazo para enviar el informe: 18/10'), NOW)
  assert.equal(dueDateFromClassification(result)?.date, '2026-10-18')
})
