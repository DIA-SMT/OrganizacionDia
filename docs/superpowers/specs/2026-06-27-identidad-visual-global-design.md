# Identidad visual global DIA

## Objetivo

Aplicar a toda la aplicación una identidad tecnológica inspirada en la referencia visual, manteniendo la estructura, funcionalidad, legibilidad y rendimiento actuales.

## Estrategia

La paleta se centralizará mediante variables CSS semánticas. Los componentes consumirán colores por función (`background`, `surface`, `border`, `primary`, `accent`, `danger`) en lugar de repetir valores aislados. No se realizará un rediseño de layouts.

## Paleta

### Modo oscuro

- Fondo: `#070B1C`
- Superficie: `#0E1630`
- Superficie elevada: `#141F42`
- Borde: `#24325E`
- Azul principal: `#4F7CFF`
- Violeta: `#8B5CF6`
- Coral: `#FF5B6E`
- Texto fuerte: `#F4F7FF`
- Texto secundario: `#A8B3CF`

### Modo claro

- Fondo: `#F4F7FC`
- Superficie: `#FFFFFF`
- Superficie elevada: `#EEF3FF`
- Borde: `#D9E2F2`
- Azul principal: `#2563EB`
- Violeta: `#7C3AED`
- Coral: `#E84A5F`
- Texto fuerte: `#0B1635`
- Texto secundario: `#60708F`

## Colores semánticos

- Azul: acciones principales, selección, navegación activa y enlaces.
- Violeta: estados secundarios y MVP aprobado.
- Coral: errores, pausados y prioridad alta/crítica.
- Amarillo: proyectos en desarrollo y advertencias.
- Verde: producción, éxito y confirmaciones.
- Blanco o neutro: planificación y prioridad baja.

## Componentes afectados

- Fondo global, tipografía y selección de texto.
- Sidebar, encabezado, buscador y controles de sesión.
- Cards, paneles, modales, formularios y menús desplegables.
- Dashboard, proyectos, tareas, equipo, historial, papelera y expedientes.
- Asistente virtual, gráficos, barras de progreso y estados interactivos.
- Pantallas de autenticación.

## Interacción y rendimiento

- Mantener las animaciones existentes y `prefers-reduced-motion`.
- Usar sombras y resplandores sutiles únicamente en hover, foco y acciones principales.
- No agregar fondos espaciales, partículas, orbes ni recursos pesados.
- Mantener contraste legible en ambos temas y foco visible para teclado.
- Evitar gradientes dominantes; la identidad se construirá principalmente con colores sólidos, bordes y contraste.

## Verificación

- Revisar dashboard, proyectos, expedientes, tareas, equipo e historial en ambos temas.
- Verificar escritorio y viewport móvil.
- Comprobar foco, hover, estados deshabilitados y textos secundarios.
- Ejecutar lint y build de producción.
