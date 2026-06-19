const API_URL = process.env.DASHBOARD_API_URL
const API_SECRET = process.env.ALEXA_API_SECRET

function speechResponse(text, options = {}) {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text,
      },
      shouldEndSession: options.endSession ?? true,
      ...(options.reprompt
        ? {
            reprompt: {
              outputSpeech: {
                type: 'PlainText',
                text: options.reprompt,
              },
            },
          }
        : {}),
      ...(options.directives ? { directives: options.directives } : {}),
    },
  }
}

function slot(intent, name) {
  return intent?.slots?.[name]?.value?.trim() ?? ''
}

function canonicalSlot(intent, name) {
  const slotValue = intent?.slots?.[name]
  const resolved =
    slotValue?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name
  return resolved?.trim() || slotValue?.value?.trim() || ''
}

function apiErrorMessage(payload) {
  return payload?.error || 'El dashboard no pudo completar la operación.'
}

async function callDashboard(event, action, payload = {}) {
  if (!API_URL || !API_SECRET) {
    throw new Error('La Skill todavía no tiene configuradas las variables del dashboard.')
  }

  const userId = event.context?.System?.user?.userId ?? 'sin-identificar'
  const requestId = event.request?.requestId ?? crypto.randomUUID()

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_SECRET}`,
      'Content-Type': 'application/json',
      'X-Alexa-User-Id': userId,
      'X-Alexa-Request-Id': requestId,
    },
    body: JSON.stringify({ action, payload }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(apiErrorMessage(data))
  return data
}

function dialogResponse(event) {
  const intent = event.request.intent

  if (intent.confirmationStatus === 'DENIED') {
    return speechResponse('De acuerdo, cancelé la operación.')
  }

  if (event.request.dialogState !== 'COMPLETED') {
    return {
      version: '1.0',
      response: {
        shouldEndSession: false,
        directives: [{ type: 'Dialog.Delegate', updatedIntent: intent }],
      },
    }
  }

  return null
}

function projectSpeech(project) {
  const parts = [
    `${project.name} está en estado ${project.status}`,
    `con prioridad ${project.priority}`,
    `y un avance del ${project.progress ?? 0} por ciento`,
  ]

  if (project.requesterArea) parts.push(`El área solicitante es ${project.requesterArea}`)
  if (project.stack) parts.push(`El stack es ${project.stack}`)
  if (project.estimatedDelivery) parts.push(`La entrega estimada es ${project.estimatedDelivery}`)
  if (project.description) parts.push(`Descripción: ${project.description}`)
  if (project.note) parts.push(`Nota: ${project.note}`)
  parts.push(`Tiene ${project.pendingTasks ?? 0} tareas pendientes`)

  return `${parts.join('. ')}.`
}

async function handleIntent(event) {
  const intent = event.request.intent
  const intentName = intent.name

  if (intentName === 'DashboardSummaryIntent') {
    const data = await callDashboard(event, 'dashboard_summary')
    if (data.answer) return speechResponse(data.answer)
    const status = data.projectsByStatus ?? {}
    return speechResponse(
      `Hay ${data.totalProjects} proyectos y ${data.pendingTasks} tareas pendientes. ` +
        `${status['En desarrollo'] ?? 0} proyectos están en desarrollo, ` +
        `${status.QA ?? 0} en QA, ${status['En Producción'] ?? 0} en producción ` +
        `y ${status.Pausado ?? 0} pausados.`,
    )
  }

  if (intentName === 'GetProjectIntent') {
    const projectName = slot(intent, 'projectName')
    const data = await callDashboard(event, 'get_project', { projectName })
    return speechResponse(data.answer || projectSpeech(data.project))
  }

  if (intentName === 'ListProjectsIntent') {
    const status = canonicalSlot(intent, 'status')
    const priority = canonicalSlot(intent, 'priority')
    const data = await callDashboard(event, 'list_projects', { status, priority })
    const names = (data.projects ?? []).slice(0, 8).map((project) => project.name)

    if (names.length === 0) return speechResponse('No encontré proyectos con esos filtros.')

    return speechResponse(
      `Encontré ${data.count} proyectos. ${names.join(', ')}${data.count > names.length ? ', entre otros' : ''}.`,
    )
  }

  if (intentName === 'PendingTasksIntent') {
    const projectName = slot(intent, 'projectName')
    const data = await callDashboard(event, 'list_pending_tasks', { projectName })
    const tasks = (data.tasks ?? []).slice(0, 8)

    if (tasks.length === 0) return speechResponse('No hay tareas pendientes para esa consulta.')

    return speechResponse(
      `Hay ${data.count} tareas pendientes. ${tasks
        .map((task) => `${task.title}, prioridad ${task.priority}, estado ${task.status}`)
        .join('. ')}.`,
    )
  }

  if (intentName === 'AskAssistantIntent') {
    const question = slot(intent, 'question')
    const data = await callDashboard(event, 'ask_assistant', { question })
    return speechResponse(data.answer, {
      endSession: false,
      reprompt: '¿Querés consultar algo más?',
    })
  }

  if (intentName === 'PriorityOverviewIntent') {
    const data = await callDashboard(event, 'ask_assistant', {
      question: 'qué proyectos requieren más atención',
    })
    return speechResponse(data.answer, {
      endSession: false,
      reprompt: '¿Querés consultar algo más?',
    })
  }

  if (intentName === 'CreateTaskIntent') {
    const dialog = dialogResponse(event)
    if (dialog) return dialog

    const payload = {
      title: slot(intent, 'taskTitle'),
      projectName: slot(intent, 'projectName'),
      priority: canonicalSlot(intent, 'priority') || 'Media',
      dueDate: slot(intent, 'dueDate'),
    }
    const data = await callDashboard(event, 'create_task', payload)

    return speechResponse(
      `Tarea creada. ${data.task.title}, prioridad ${data.task.priority}, para el proyecto ${data.projectName}.`,
    )
  }

  if (intentName === 'CreateProjectIntent') {
    const dialog = dialogResponse(event)
    if (dialog) return dialog

    const payload = {
      name: slot(intent, 'projectName'),
      status: canonicalSlot(intent, 'status') || 'Planificación',
      priority: canonicalSlot(intent, 'priority') || 'Media',
    }
    const data = await callDashboard(event, 'create_project', payload)

    return speechResponse(
      `Proyecto creado. ${data.project.name}, estado ${data.project.status}, prioridad ${data.project.priority}.`,
    )
  }

  if (intentName === 'AMAZON.HelpIntent') {
    return speechResponse(
      'Podés preguntarme por un proyecto, pedir un resumen, consultar tareas pendientes o crear tareas y proyectos.',
      {
        endSession: false,
        reprompt: '¿Qué querés consultar o gestionar?',
      },
    )
  }

  if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
    return speechResponse('Hasta luego.')
  }

  return speechResponse('No entendí esa solicitud. Probá preguntando por un proyecto o por las tareas pendientes.', {
    endSession: false,
    reprompt: '¿Qué querés consultar?',
  })
}

export const handler = async (event) => {
  try {
    if (event.request?.type === 'LaunchRequest') {
      return speechResponse(
        'Organización DIA está disponible. Podés pedirme un resumen, consultar un proyecto o crear una tarea.',
        {
          endSession: false,
          reprompt: '¿Qué querés hacer?',
        },
      )
    }

    if (event.request?.type === 'IntentRequest') {
      return await handleIntent(event)
    }

    if (event.request?.type === 'SessionEndedRequest') {
      return speechResponse('Hasta luego.')
    }

    return speechResponse('No pude procesar esa solicitud.')
  } catch (error) {
    console.error('Alexa skill error', error)
    return speechResponse(
      error instanceof Error ? error.message : 'Ocurrió un error al conectar con el dashboard.',
      {
        endSession: false,
        reprompt: 'Podés intentar nuevamente.',
      },
    )
  }
}
