# PokeSurvivor Nexus, fase 1

Extensión de Chrome que agrega mejoras gráficas y de calidad de vida a pokesurvivor.com sin cambiar las reglas del juego. Esta fase arma la infraestructura y cinco módulos. Las fases dos a cuatro tendrán su propio documento.

## Arquitectura

La extensión es un cascarón pequeño que se instala una vez con "Cargar descomprimida". El código del mod vive en `dist/mod.js` dentro del repositorio público `darvinh12/pokesurvivor-nexus`, y el service worker lo descarga y lo registra con `chrome.userScripts` en el mundo MAIN a `document_start`. Esa API no queda sujeta a la CSP de la página, que bloquea scripts externos, inline y `eval`.

El service worker revisa `dist/version.json` al instalar, al abrir Chrome y cada 30 minutos. Si la versión remota es mayor que la guardada, descarga `mod.js`, comprueba que su SHA-256 y su tamaño coincidan con `version.json` y que empiece con la cabecera `/*! PokeSurvivor Nexus`, y solo entonces lo guarda en `chrome.storage.local` y vuelve a registrar el script. Cualquier fallo deja la versión anterior intacta.

Si el usuario no activó "Permitir scripts de usuario", `chrome.userScripts` no existe. En ese caso el cascarón registra `mod.bundled.js` con `chrome.scripting.registerContentScripts` en el mundo MAIN, de modo que el mod funciona igual pero sin actualizarse solo. El popup de la extensión muestra la versión activa, la fuente (remota o empaquetada), la última revisión, un botón para buscar actualización y las instrucciones para activar el interruptor.

Dentro de la página, el mod captura el namespace privado del juego con un setter temporal en `Object.prototype.Camera`, igual que PokeSurvivor Plus. El juego guarda ahí sus módulos con nombres legibles (`Camera`, `HUD`, `Game`, `EnemyMgr`, `World`, `Pickups`, `Enemies`), mientras que el resto del bundle está ofuscado. Por eso todo enganche pasa por ese objeto.

## Red de seguridad

Cada módulo declara qué piezas del juego necesita y una función de arranque. Si esas piezas no aparecen en 20 segundos con el juego ya cargado, el módulo queda en estado "falta". Si su arranque lanza una excepción, o si al dibujar falla 20 veces en 10 segundos, queda "roto" y se apaga. El juego sigue como si el mod no existiera y el panel muestra el estado de cada módulo. Un guardián `window.__nexus` evita una doble inyección.

## Módulos

| Módulo | Qué hace | Piezas del juego |
|---|---|---|
| Campo de visión | Escala `Camera.VIEW_W` y `Camera.MIN_VIEW_H` entre 1.0x y 1.7x, con Alt + / Alt − / Alt 0 | `Camera.resize` |
| Minimapa | Lienzo flotante que se arrastra y se redimensiona, con terreno, enemigos, jefes, shinies, cofres, altares, objetos, grieta, eventos y aliados. Capas activables y tecla M | `World`, `EnemyMgr`, `Pickups`, `Rift`, `Events`, `Coop`, `Camera` |
| Nitidez y rendimiento | El juego limita el canvas a `Math.min(1.5, devicePixelRatio)` y guarda esa escala en una variable privada que usa el HUD, así que subirla rompería el dibujo. El módulo ofrece modo rendimiento a 1x (sobrescribe `window.devicePixelRatio`), escalado nítido con `image-rendering: pixelated` y límite de FPS de 30 o 60 sobre `requestAnimationFrame` | `window.devicePixelRatio`, `#game` |
| Atajos extra | El juego ya trae 1/2/3 y R al subir de nivel y 1/2 en objetos. Se agregan 1 a 9 en la pantalla de vínculo, Retroceso para "Atrás" y Enter en el fin de partida | `#scr-bond`, `#scr-over` |
| Indicadores de combate | Círculo del radio del imán (`player.magnet`, 78 por defecto) dibujado bajo el HUD, viñeta roja con vida por debajo del umbral elegido y una píldora con la cuenta regresiva al próximo jefe o al Juicio | `HUD.draw`, `Enemies.BOSSES`, `Judgment.AT`, `Game.st.time` |

El panel de ajustes se abre con Alt + N o con un botón flotante visible en el menú principal. Agrupa los ajustes de cada módulo, el estado de la red de seguridad y la versión. Los ajustes se guardan en `localStorage` con el prefijo `nexus:`.

## Estructura del repositorio

`extension/` contiene `manifest.json`, `background.js`, `popup.html`, `popup.js` y `mod.bundled.js`. `src/core/` guarda el enganche, la red de seguridad, el almacenamiento, las utilidades y el panel. `src/features/` tiene un archivo por módulo. `scripts/build.mjs` concatena `src/` en un IIFE, escribe `dist/mod.js`, calcula el hash para `dist/version.json` y copia el resultado a `extension/mod.bundled.js`. Con `--release X.Y.Z` fija la versión publicada.

## Verificación

El build termina con `node --check` sobre `dist/mod.js`. Después una sola prueba de humo con Chrome sin interfaz inyecta `dist/mod.js` antes de cargar pokesurvivor.com y comprueba que el namespace se captura y que ningún módulo queda roto en el menú principal. Las pruebas dentro de una partida las hace Darvin al jugar.

## Fuera de esta fase

La reducción de efectos de ataque queda para la fase dos junto con el resto del HUD, porque exige estudiar el módulo `FX`. Tampoco entran la publicación en la Chrome Web Store ni el soporte para Firefox.
