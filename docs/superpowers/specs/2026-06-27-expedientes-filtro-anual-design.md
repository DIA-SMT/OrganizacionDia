# Filtro anual de expedientes

## Objetivo

Permitir filtrar expedientes por el año de su fecha `drive_created_at`, manteniendo los filtros y el orden existentes.

## Interfaz

- Agregar un selector compacto junto a los filtros de estado.
- La opción inicial será `Todos los años`.
- Los años se obtendrán de los expedientes cargados y aparecerán en orden descendente.
- El selector también estará disponible en la vista de expedientes archivados.

## Comportamiento

- El filtro anual se combinará con la búsqueda textual y el filtro de estado.
- Un expediente coincide cuando el año local de `drive_created_at` es igual al año seleccionado.
- Fechas inválidas no generarán opciones y solo aparecerán al seleccionar `Todos los años`.
- No se requieren cambios en Supabase ni nuevas consultas: el filtrado será local sobre los datos ya cargados.

## Verificación

- Probar que los años disponibles sean únicos y estén ordenados de mayor a menor.
- Probar que seleccionar un año muestre únicamente expedientes creados en ese año.
- Ejecutar lint y build de Next.js.
