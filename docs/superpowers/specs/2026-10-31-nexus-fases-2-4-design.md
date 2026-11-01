# PokeSurvivor Nexus, fases 2 a 4

Este documento amplía el diseño de la fase 1 con los módulos de HUD, datos y menús. La arquitectura no cambia. Cada módulo vive en su propio archivo de `src/features/`, se registra con `NX.feature` para quedar bajo la red de seguridad y agrega su sección al panel.

## Cambios en el núcleo

El panel de ajustes ahora tiene pestañas (Cámara y mapa, HUD, Partida, Datos, Menús, Rendimiento y General) y un buscador que filtra secciones por título. El núcleo suma `NX.draggable` para paneles que se mueven y recuerdan su posición, `NX.download` para generar archivos desde la página, `NX.fmtTime` y `NX.runs`, que avisa cuando empieza y termina una partida.

El build incluye todos los archivos de `src/features/` en orden alfabético, así que los módulos que dependen de otro acceden a él dentro de su arranque y nunca al cargar el archivo. `scripts/dev-bundle.mjs` genera un bundle de prueba con el núcleo y los módulos elegidos sin tocar `dist/`.

## SurvivorTiers

La página del juego no puede leer el CSV de SurvivorTiers por CORS. El cascarón, en su versión 1.1.0, lo descarga cada seis horas junto con la fecha de parche que publica el sitio y lo antepone al mod como `window.__nexusData`, que el núcleo expone en `NX.data.tiers`. Esto solo ocurre en modo scripts de usuario. En modo empaquetado los módulos de datos muestran una nota y siguen funcionando sin tiers. Si la fecha de parche es anterior a la del juego (`version.json`), la interfaz marca los datos como posiblemente desactualizados.

## Módulos

| Fase | Archivo | Qué hace |
|---|---|---|
| 2 | `hud-scale.js` | Escala del HUD de 1x a 2x |
| 2 | `boss-plate.js` | Placa de vida del jefe y panel de reloj con bioma, kills y monedas |
| 2 | `edge-arrows.js` | Flechas en el borde hacia jefes, shinies, dorados, cofres grandes y grietas |
| 2 | `colorblind.js` | Corrección para protanopia, deuteranopia y tritanopia |
| 2 | `hitboxes.js` | Círculos de colisión (Alt+B) |
| 2 | `fps.js` | Contador de FPS arrastrable (Alt+F) |
| 2 | `clean-capture.js` | Captura PNG sin HUD (Alt+S) |
| 2 | `fx.js` | Efectos de ataque reducidos |
| 2 | `telemetry.js` | Registro de daño infligido y recibido por partida, base de los módulos siguientes |
| 2 | `damage-meter.js` | Medidor de daño y DPS por movimiento (mantener Tab) |
| 2 | `alerts.js` | Aviso visual y sonoro de shinies, legendarios, jefes, dorados y grietas |
| 3 | `run-history.js` | Historial, ranking personal y autopsia de la última muerte (Alt+R) |
| 3 | `tooltips.js` | Detalle de movimientos, objetos y clima en HUD y cartas |
| 3 | `tiers.js` | Tier y build de SurvivorTiers en las pantallas de Pokémon |
| 3 | `build-helper.js` | Resalta en las cartas la build recomendada y lo que acerca una evolución |
| 3 | `encyclopedia.js` | Enciclopedia de movimientos, objetos y Pokémon con datos del juego (F1 o Alt+I) |
| 4 | `gacha.js` | Tirar todos los tickets, saltar animaciones y faltantes por región |
| 4 | `dex-tools.js` | Búsqueda, orden, filtros, favoritos, comparador y notas en la Pokédex |
| 4 | `upgrades.js` | Maximizar mejoras de un Pokémon con confirmación del costo |
| 4 | `backup.js` | Exportar e importar los ajustes y datos de Nexus |
| 4 | `collection.js` | Pokémon, shinies y logros que faltan por región |

Las acciones que gastan recursos del jugador usan las funciones del propio juego, de modo que el guardado y las validaciones son los de siempre, y siempre piden confirmación con el costo a la vista.

## Fuera de alcance

Quedan pendientes las ideas sin fase asignada: repetición de los últimos 30 segundos, calculadora de gacha, temas del HUD, reasignación de teclas, sincronización de ajustes entre equipos, recordatorio de descanso e interfaz bilingüe.
