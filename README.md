# PokeSurvivor Nexus

Laboratorio de mejoras gráficas y de calidad de vida para [PokéSurvivor](https://pokesurvivor.com). Sirve para probar cada idea sobre el código real del juego y proponérsela a su autor, JPTER78, para que la incorpore si le parece útil. Es un proyecto de fans, gratuito y sin relación oficial con el juego.

El sitio público bloquea las extensiones a propósito, y Nexus respeta esa decisión. Por eso Nexus corre solo sobre una copia local del juego, que se sirve sin conexión a Firebase. Las pruebas no llegan a las cuentas, al ranking ni al servidor del autor. En pokesurvivor.com el mod se queda inactivo.

## Cómo probarlo

1. Clona este repositorio y, dentro de él, el juego:
   ```bash
   git clone --depth 1 https://github.com/JPTER78/pokesurvivor.git _ref/game
   node scripts/lab-server.mjs
   ```
2. En Chrome abre `chrome://extensions`, activa el "Modo de desarrollador", pulsa "Cargar descomprimida" y elige la carpeta `extension`.
3. En "Detalles" de PokeSurvivor Nexus activa **Permitir scripts de usuario**. Sin ese interruptor el mod funciona igual, pero sin actualizarse solo y sin los datos de SurvivorTiers.
4. Abre `http://localhost:8080` y entra como invitado.

El servidor del laboratorio sirve los archivos del juego con dos cambios hechos en memoria. La política de seguridad de la página solo deja cargar scripts y conexiones del propio equipo, así que el juego corre con guardado local. Además se omite el arranque del detector de extensiones, que en una copia sin conexión no protege nada. Los archivos del juego no se modifican.

## Qué trae

Los ajustes se abren con **Alt + N** o con el botón "Nexus" del menú principal. El panel tiene pestañas y un buscador. Cada módulo se puede apagar por separado, y si una actualización del juego rompe alguno, la red de seguridad lo desactiva sin afectar a los demás.

| Pestaña | Módulo | Atajo |
|---|---|---|
| Cámara y mapa | Campo de visión de 1.0x a 1.7x | Alt + / Alt − / Alt 0 |
| Cámara y mapa | Minimapa arrastrable con 13 capas | Alt + M |
| HUD | Escala del HUD de 1x a 2x | |
| HUD | Placa de vida del jefe, panel de reloj y colores de las barras | |
| HUD | Flechas en el borde hacia jefes, shinies, dorados, cofres grandes y grietas | |
| HUD | Modo daltónico (protanopia, deuteranopia, tritanopia) | |
| HUD | Hitboxes | Alt + B |
| HUD | Contador de FPS | Alt + F |
| HUD | Captura limpia sin HUD | Alt + S |
| HUD | Medidor de daño y DPS por movimiento | mantener Tab |
| Partida | Atajos en la pantalla de vínculo y en el fin de partida | 1 a 9, Retroceso, Enter |
| Partida | Radio del imán, alerta de vida baja y cuenta regresiva al jefe | |
| Partida | Alertas de shiny, legendario, jefe, dorado y grieta | |
| Datos | Historial de partidas, ranking personal y autopsia de la última muerte | Alt + R |
| Datos | Tooltips de movimientos, objetos y clima | |
| Datos | Tier y build de SurvivorTiers en las pantallas de Pokémon | |
| Datos | Build recomendada y asistente de evoluciones en las cartas de nivel | |
| Datos | Enciclopedia de movimientos, objetos, Pokémon y tipos | F1 o Alt + I |
| Menús | Gacha rápido y faltantes por región | |
| Menús | Pokédex con orden, filtros, favoritos, comparador y notas | |
| Menús | Maximizar mejoras de un Pokémon con confirmación del costo | |
| Menús | Checklist de Pokémon, shinies y logros que faltan | |
| General | Respaldo de ajustes y datos de Nexus | |
| General | Botón táctil en partida con las acciones de Nexus | |
| HUD | HUD Nexus al estilo Plus: barra de vida grande, retrato, ataques, orbes y tarjetas del equipo | |
| Modos | Modos Nexus: infinito, modificadores, laboratorio de builds, desafío diario y Boss Rush | botón en el menú |
| Datos | Centro de builds: build calculada con los datos del juego, la de SurvivorTiers y la suya | botón en el menú |
| Estilo | Identidad Nexus Edition, filtros de pantalla y música propia (la del juego viene apagada) | |
| Rendimiento | Resolución, pixel art nítido, límite de FPS y efectos reducidos | |

## Cómo se actualiza

La extensión es un cascarón que se instala una sola vez. Al abrir Chrome y cada 30 minutos revisa `dist/version.json` en este repositorio. Si hay una versión nueva, descarga `dist/mod.js`, comprueba su hash SHA-256 y su tamaño, y la usa la próxima vez que se cargue el laboratorio. Cada seis horas descarga también el ranking de SurvivorTiers.

Para publicar una versión:

```bash
node scripts/build.mjs --release 0.3.0
git add -A && git commit -m "Versión 0.3.0" && git push
```

Lo que se suba sin `--release` no les llega a quienes tengan la extensión instalada.

## Estructura

```
extension/      cascarón: manifiesto, actualizador, popup y copia empaquetada del mod
src/core/       enganche al juego, red de seguridad, ajustes, atajos y capa de dibujo
src/features/   un archivo por módulo
scripts/        build, bundle de desarrollo y servidor del laboratorio
dist/           versión publicada (mod.js y version.json)
docs/           diseño y planes por fase
```

## Créditos

La técnica para engancharse a los módulos internos del juego y varias piezas de HUD, telemetría y menús se adaptaron de [PokeSurvivor Plus](https://github.com/PokeSurvivorPlus/PokeSurvivorPlus) (MIT). Los tiers y builds recomendadas vienen de [SurvivorTiers](https://survivortiers.pages.dev/), de @fildotai. PokéSurvivor es obra de JPTER78 y su código se publica bajo PolyForm Noncommercial 1.0.0. Pokémon y sus nombres pertenecen a sus dueños.

## Licencia

MIT. Ver [LICENSE](LICENSE).
