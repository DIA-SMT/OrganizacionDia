-- Importacion inicial de proyectos/repos DIA-SMT.
-- Se puede ejecutar varias veces: actualiza metadatos y conserva el progreso existente.

with incoming (
  name,
  description,
  requester_area,
  stack,
  repository_url,
  status,
  priority,
  progress
) as (
  values
    ('secgeneral-dashboard', 'Dashboard ejecutivo para seguimiento del POA 2026 de Secretaria General, con chatbot integrado y automatizacion via cron jobs.', 'Secretaria General', 'Dashboard + IA + Cron jobs', 'https://github.com/DIA-SMT/secgeneral-dashboard', 'En desarrollo', 'Alta', 0),
    ('BotTurismo-BackyFront', 'Asistente virtual de turismo para San Miguel de Tucuman con WhatsApp, ManyChat, IA, memoria conversacional y Agenda Cultural Municipal.', 'Turismo', 'WhatsApp + ManyChat + OpenRouter/Gemini', 'https://github.com/DIA-SMT/BotTurismo-BackyFront', 'En desarrollo', 'Alta', 0),
    ('paginaDIM', 'Sitio web multipagina de la Direccion de Inteligencia Municipal desarrollado en Next.js.', 'DIM', 'Next.js', 'https://github.com/DIA-SMT/paginaDIM', 'En desarrollo', 'Media', 0),
    ('dashboard-dra', 'Calendario y gestor de reuniones para la DRA con asistente virtual de agenda impulsado por IA.', 'DRA', 'Dashboard + OpenRouter', 'https://github.com/DIA-SMT/dashboard-dra', 'En desarrollo', 'Alta', 0),
    ('educacivil', 'Plataforma educativa de educacion civica con cursos, lecciones, rating, gestion de alumnos y panel de administracion.', 'Educacion Civica', 'Plataforma educativa', 'https://github.com/DIA-SMT/educacivil', 'En desarrollo', 'Alta', 0),
    ('formularios-dim', 'Sistema de gestion de formularios DIM con procesamiento de documentos mediante IA y analisis de PDFs convertidos a imagenes.', 'DIM', 'Documentos + OpenRouter', 'https://github.com/DIA-SMT/formularios-dim', 'En desarrollo', 'Alta', 0),
    ('migue-BackyFront', 'Proyecto privado frontend/backend en JavaScript.', 'DIA', 'JavaScript Frontend/Backend', 'https://github.com/DIA-SMT/migue-BackyFront', 'En desarrollo', 'Media', 0),
    ('Dashboard-Planificacion-Urbana', 'Tablero de gestion de proyectos de obra urbana con vistas de tabla, Kanban y Gantt, empresas, responsables, hitos y avance automatico.', 'Planificacion Urbana', 'Dashboard + Kanban + Gantt', 'https://github.com/DIA-SMT/Dashboard-Planificacion-Urbana', 'En desarrollo', 'Alta', 0),
    ('contadurIA', 'MVP de asistente de IA para Contaduria Municipal con embeddings y procesamiento de documentos legales y contables.', 'Contaduria', 'IA + Embeddings + Documentos', 'https://github.com/DIA-SMT/contadurIA', 'En desarrollo', 'Alta', 0),
    ('palacio-deportes', 'Landing page del Palacio de los Deportes de San Miguel de Tucuman con keepalive para Supabase Free Tier.', 'Deportes', 'Landing + Supabase', 'https://github.com/DIA-SMT/palacio-deportes', 'En desarrollo', 'Media', 0),
    ('cimt-connect', 'Plataforma web del CIMT con chatbot LIA integrado, desarrollada con TanStack Start.', 'CIMT', 'TanStack Start + Chatbot', 'https://github.com/DIA-SMT/cimt-connect', 'En desarrollo', 'Alta', 0),
    ('BotAmbiente-Front', 'Frontend del chatbot de la Secretaria de Ambiente de SMT, desarrollado en Next.js y conectado al backend de IA.', 'Ambiente', 'Next.js + Chatbot', 'https://github.com/DIA-SMT/BotAmbiente-Front', 'En desarrollo', 'Alta', 0),
    ('ces-connect', 'Plataforma de conexion para el CES generada con Lovable.', 'CES', 'Lovable', 'https://github.com/DIA-SMT/ces-connect', 'En desarrollo', 'Media', 0),
    ('clon-cat', 'Fork de ces-connect adaptado para modificaciones especificas del proyecto CAT.', 'CAT', 'Fork Lovable', 'https://github.com/DIA-SMT/clon-cat', 'Pausado', 'Media', 0),
    ('GeneracionNotaIA-FRONT', 'Frontend privado del sistema de generacion automatica de notas y documentos oficiales mediante IA.', 'DIA', 'Frontend + IA documental', 'https://github.com/DIA-SMT/GeneracionNotaIA-FRONT', 'En desarrollo', 'Alta', 0),
    ('botEspiritual', 'Bot conversacional con modo avatar y experiencia interactiva experimental de IA.', 'DIA', 'Bot + Avatar + IA', 'https://github.com/DIA-SMT/botEspiritual', 'En desarrollo', 'Media', 0),
    ('comunicaci-n', 'Dashboard de gestion de comunicaciones municipales con notificaciones via Gmail integrado.', 'Comunicacion', 'Dashboard + Gmail', 'https://github.com/DIA-SMT/comunicaci-n', 'En desarrollo', 'Alta', 0),
    ('botAmbiente-back', 'Backend Node.js del chatbot de Ambiente con LangChain, OpenRouter, Supabase y ManyChat para WhatsApp.', 'Ambiente', 'Node.js + LangChain + Supabase + ManyChat', 'https://github.com/DIA-SMT/botAmbiente-back', 'En desarrollo', 'Alta', 0),
    ('LluvIA', 'Plataforma de analisis de riesgo hidrico con visor de PDFs e integracion de documentos fuente sobre lluvias e inundaciones.', 'Riesgo Hidrico', 'IA + PDFs + Documentos', 'https://github.com/DIA-SMT/LluvIA', 'En desarrollo', 'Alta', 0),
    ('tablero-riesgo-hidrico', 'Tablero de visualizacion de riesgo hidrico para el Area Metropolitana de SMT con modelacion hidraulica y estudios tecnicos.', 'Riesgo Hidrico', 'Dashboard + Modelacion hidraulica', 'https://github.com/DIA-SMT/tablero-riesgo-hidrico', 'En desarrollo', 'Alta', 0),
    ('ensenIA-smt', 'Plataforma educativa EnsenIA para SMT construida con React, TypeScript y Vite.', 'Educacion', 'React + TypeScript + Vite', 'https://github.com/DIA-SMT/ensenIA-smt', 'En desarrollo', 'Alta', 0),
    ('complejos-deportivos', 'Aplicacion web para gestion o visualizacion de complejos deportivos municipales en Next.js.', 'Deportes', 'Next.js', 'https://github.com/DIA-SMT/complejos-deportivos', 'En desarrollo', 'Media', 0),
    ('agentes-transito', 'MVP de sistema de control y gestion para agentes de transito a pie con roles RRHH, Admin y Agente, turnos, jornadas y metricas.', 'Transito', 'Gestion operativa + Dashboard', 'https://github.com/DIA-SMT/agentes-transito', 'En desarrollo', 'Alta', 0),
    ('speech-lab', 'Laboratorio Agora IA para analisis y edicion de discursos politicos con GPT y Gemini.', 'DIA', 'GPT + Gemini', 'https://github.com/DIA-SMT/speech-lab', 'En desarrollo', 'Media', 0),
    ('GeneracionNotaIA-BACK', 'Backend privado del sistema de generacion automatica de notas oficiales con IA.', 'DIA', 'Backend + IA documental', 'https://github.com/DIA-SMT/GeneracionNotaIA-BACK', 'En desarrollo', 'Alta', 0),
    ('Generador-Diplomas-DIA', 'Herramienta privada en Python para generacion automatica de diplomas de la Direccion de IA.', 'DIA', 'Python', 'https://github.com/DIA-SMT/Generador-Diplomas-DIA', 'En desarrollo', 'Media', 0),
    ('apiFuncioarios', 'API privada en JavaScript para la gestion de funcionarios municipales.', 'Funcionarios', 'JavaScript API', 'https://github.com/DIA-SMT/apiFuncioarios', 'En desarrollo', 'Media', 0),
    ('obrapublica-dashboard', 'Dashboard privado para seguimiento de obras publicas municipales.', 'Obra Publica', 'Dashboard', 'https://github.com/DIA-SMT/obrapublica-dashboard', 'En desarrollo', 'Alta', 0),
    ('obrapublica-dashboard-cpu-munismt', 'Version extendida del dashboard de obras publicas para la Coordinacion de Planificacion Urbana de la Municipalidad de SMT.', 'Planificacion Urbana', 'Dashboard obras publicas', 'https://github.com/DIA-SMT/obrapublica-dashboard-cpu-munismt', 'En desarrollo', 'Alta', 0)
),
updated as (
  update public.projects p
  set
    description = i.description,
    requester_area = i.requester_area,
    stack = i.stack,
    repository_url = i.repository_url,
    status = i.status,
    priority = i.priority,
    active = true,
    updated_at = now()
  from incoming i
  where p.name = i.name
  returning p.name
)
insert into public.projects (
  name,
  description,
  requester_area,
  stack,
  repository_url,
  status,
  priority,
  progress
)
select
  i.name,
  i.description,
  i.requester_area,
  i.stack,
  i.repository_url,
  i.status,
  i.priority,
  i.progress
from incoming i
where not exists (
  select 1
  from public.projects p
  where p.name = i.name
);
