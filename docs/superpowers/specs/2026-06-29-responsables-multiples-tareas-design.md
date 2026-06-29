# Responsables multiples en tareas

## Objetivo

Permitir asignar cualquier cantidad de integrantes activos del equipo a una tarea al crearla o editarla.

## Datos

Se reutiliza `public.task_assignees`, cuya restriccion unica `(task_id, member_id)` evita duplicados. Las tareas se consultan con la relacion anidada hacia `members`; no se requieren columnas ni migraciones nuevas.

## Interfaz

- Selector multiple con checkboxes y resumen de seleccionados.
- Avatares y nombres visibles dentro de cada tarea.
- Mismo control en creacion y edicion.
- Opcion de dejar una tarea sin responsables.

## Guardado

- Al crear, insertar una fila por responsable seleccionado.
- Al editar, calcular responsables agregados y quitados.
- Eliminar solo relaciones quitadas y hacer `upsert` solo de las agregadas.
- Mantener el modal abierto y mostrar el error si alguna operacion falla.

## Verificacion

- Probar calculo de altas y bajas sin duplicados.
- Comprobar creacion, carga y edicion con dos o mas integrantes.
- Ejecutar pruebas, lint y build.
