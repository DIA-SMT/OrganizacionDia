'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const https = require('https');

const DASHBOARD_HOST = 'organizacion-dia.vercel.app';
const DASHBOARD_PATH = '/api/alexa';
const API_SECRET = 'PEGAR_AQUI_ALEXA_API_SECRET';

function response(text, shouldEndSession = true, directives) {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession,
      ...(directives ? { directives } : {}),
      ...(!shouldEndSession
        ? {
            reprompt: {
              outputSpeech: {
                type: 'PlainText',
                text: '¿Qué querés consultar o gestionar?',
              },
            },
          }
        : {}),
    },
  };
}

function slot(intent, name) {
  return intent?.slots?.[name]?.value?.trim() || '';
}

function resolvedSlot(intent, name) {
  return (
    intent?.slots?.[name]?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name?.trim() ||
    slot(intent, name)
  );
}

function callDashboard(event, action, payload = {}) {
  const requestId = event.request?.requestId || `alexa-${Date.now()}`;
  const userId = event.context?.System?.user?.userId || 'sin-identificar';
  const body = JSON.stringify({ action, payload });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: DASHBOARD_HOST,
        path: DASHBOARD_PATH,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_SECRET}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Alexa-User-Id': userId,
          'X-Alexa-Request-Id': requestId,
        },
      },
      (apiResponse) => {
        let raw = '';
        apiResponse.on('data', (chunk) => {
          raw += chunk;
        });
        apiResponse.on('end', () => {
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            reject(new Error('El dashboard respondió con un formato inválido.'));
            return;
          }

          if (apiResponse.statusCode < 200 || apiResponse.statusCode >= 300) {
            reject(new Error(data.error || 'El dashboard no pudo completar la operación.'));
            return;
          }

          resolve(data);
        });
      },
    );

    request.on('error', reject);
    request.setTimeout(12000, () => request.destroy(new Error('El dashboard tardó demasiado en responder.')));
    request.write(body);
    request.end();
  });
}

function projectSpeech(project) {
  const parts = [
    `${project.name} está en estado ${project.status}`,
    `con prioridad ${project.priority}`,
    `y un avance del ${project.progress || 0} por ciento`,
  ];

  if (project.requesterArea) parts.push(`El área solicitante es ${project.requesterArea}`);
  if (project.stack) parts.push(`El stack es ${project.stack}`);
  if (project.estimatedDelivery) parts.push(`La entrega estimada es ${project.estimatedDelivery}`);
  if (project.description) parts.push(`Descripción: ${project.description}`);
  if (project.note) parts.push(`Nota: ${project.note}`);
  parts.push(`Tiene ${project.pendingTasks || 0} tareas pendientes`);

  return `${parts.join('. ')}.`;
}

function delegateDialog(event) {
  const intent = event.request.intent;

  if (intent.confirmationStatus === 'DENIED') {
    return response('De acuerdo, cancelé la operación.');
  }

  if (event.request.dialogState !== 'COMPLETED') {
    return response('', false, [{ type: 'Dialog.Delegate', updatedIntent: intent }]);
  }

  return null;
}

async function handleIntent(event) {
  const intent = event.request.intent;

  switch (intent.name) {
    case 'DashboardSummaryIntent': {
      const data = await callDashboard(event, 'dashboard_summary');
      const status = data.projectsByStatus || {};
      return response(
        `Hay ${data.totalProjects} proyectos y ${data.pendingTasks} tareas pendientes. ` +
          `${status['En desarrollo'] || 0} están en desarrollo, ${status.QA || 0} en QA, ` +
          `${status['En Producción'] || 0} en producción y ${status.Pausado || 0} pausados.`,
      );
    }

    case 'GetProjectIntent': {
      const data = await callDashboard(event, 'get_project', {
        projectName: slot(intent, 'projectName'),
      });
      return response(projectSpeech(data.project));
    }

    case 'ListProjectsIntent': {
      const data = await callDashboard(event, 'list_projects', {
        status: resolvedSlot(intent, 'status'),
        priority: resolvedSlot(intent, 'priority'),
      });
      const names = (data.projects || []).slice(0, 8).map((project) => project.name);
      if (!names.length) return response('No encontré proyectos con esos filtros.');
      return response(
        `Encontré ${data.count} proyectos. ${names.join(', ')}${data.count > names.length ? ', entre otros' : ''}.`,
      );
    }

    case 'PendingTasksIntent': {
      const data = await callDashboard(event, 'list_pending_tasks', {
        projectName: slot(intent, 'projectName'),
      });
      const tasks = (data.tasks || []).slice(0, 8);
      if (!tasks.length) return response('No hay tareas pendientes para esa consulta.');
      return response(
        `Hay ${data.count} tareas pendientes. ${tasks
          .map((task) => `${task.title}, prioridad ${task.priority}, estado ${task.status}`)
          .join('. ')}.`,
      );
    }

    case 'AskAssistantIntent': {
      const question = slot(intent, 'question');
      const data = await callDashboard(event, 'ask_assistant', { question });
      return response(data.answer, false);
    }

    case 'CreateTaskIntent': {
      const dialog = delegateDialog(event);
      if (dialog) return dialog;
      const data = await callDashboard(event, 'create_task', {
        title: slot(intent, 'taskTitle'),
        projectName: slot(intent, 'projectName'),
        priority: resolvedSlot(intent, 'priority') || 'Media',
        dueDate: slot(intent, 'dueDate'),
      });
      return response(
        `Tarea creada. ${data.task.title}, prioridad ${data.task.priority}, para el proyecto ${data.projectName}.`,
      );
    }

    case 'CreateProjectIntent': {
      const dialog = delegateDialog(event);
      if (dialog) return dialog;
      const data = await callDashboard(event, 'create_project', {
        name: slot(intent, 'projectName'),
        status: resolvedSlot(intent, 'status') || 'Planificación',
        priority: resolvedSlot(intent, 'priority') || 'Media',
      });
      return response(
        `Proyecto creado. ${data.project.name}, estado ${data.project.status}, prioridad ${data.project.priority}.`,
      );
    }

    case 'AMAZON.HelpIntent':
      return response(
        'Podés pedirme un resumen, consultar proyectos y tareas, o crear una tarea o proyecto.',
        false,
      );

    case 'AMAZON.CancelIntent':
    case 'AMAZON.StopIntent':
      return response('Hasta luego.');

    default:
      return response('No entendí esa solicitud. Probá preguntando por un proyecto.', false);
  }
}

exports.handler = async (event) => {
  try {
    if (API_SECRET === 'PEGAR_AQUI_ALEXA_API_SECRET') {
      return response('Falta configurar el secreto de conexión de la Skill.');
    }

    if (event.request?.type === 'LaunchRequest') {
      return response(
        'Organización DIA está disponible. Podés pedirme un resumen, consultar un proyecto o crear una tarea.',
        false,
      );
    }

    if (event.request?.type === 'IntentRequest') {
      return await handleIntent(event);
    }

    return response('No pude procesar esa solicitud.');
  } catch (error) {
    console.error(error);
    return response(error.message || 'Ocurrió un error al conectar con el dashboard.', false);
  }
};
