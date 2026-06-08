# Especificacion funcional inicial

## Usuarios

- Admin: administra miembros, proyectos, tareas y configuracion.
- PM: organiza prioridades, plazos, responsables y seguimiento.
- Dev: trabaja tareas asignadas, registra avances, PRs e impedimentos.
- QA: revisa tareas en QA y reporta bugs.
- Viewer: consulta estado general.

## Entidades principales

### Proyecto

Representa un sistema, modulo, integracion o mejora tecnica. Debe poder verse por estado, prioridad, responsable tecnico, fecha estimada de entrega y avance.

### Tarea

Representa trabajo accionable dentro de un proyecto. Puede ser feature, bug, mejora, refactor, deploy, documentacion o soporte.

### Impedimento

Representa una condicion que impide avanzar una tarea. Ejemplos: falta acceso, credenciales pendientes, definicion funcional incompleta, dependencia externa caida o decision tecnica pendiente. Debe quedar visible en dashboard hasta resolverse.

### Comentario

Representa avances, decisiones o notas tecnicas asociadas a una tarea o proyecto.

## Pantallas MVP

- Dashboard: metricas, proyectos activos, tareas en revision, tareas para testear, impedimentos y entregas cercanas.
- Proyectos: listado, filtros y alta/edicion.
- Detalle de proyecto: tareas, progreso, links tecnicos, comentarios.
- Tareas: vista por responsable, estado, tipo y prioridad.
- Miembros: equipo, roles y especialidades.
- Impedimentos: lista operativa de trabas abiertas.

## Criterios para primera version usable

- Un admin puede crear miembros.
- Un admin o PM puede crear proyectos.
- Un admin o PM puede crear tareas y asignarlas.
- Un dev puede ver sus tareas.
- Un dev puede mover estado y registrar bloqueo.
- El dashboard muestra impedimentos abiertos y tareas listas para testear.
