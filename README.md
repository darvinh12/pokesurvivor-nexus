# PokeSurvivor Nexus

Extensión de Chrome que agrega mejoras gráficas y de calidad de vida a [PokéSurvivor](https://pokesurvivor.com) sin tocar las reglas del juego. Es un proyecto de fans, gratuito y sin relación con el autor del juego.

## Qué trae la versión 0.1

| Módulo | Qué hace | Atajo |
|---|---|---|
| Campo de visión | Aleja la cámara de 1.0x a 1.7x para ver más mapa | Alt + / Alt − / Alt 0 |
| Minimapa | Mapa flotante con terreno, enemigos, jefes, shinies, cofres, altares, objetos, grietas y aliados. Se arrastra, se redimensiona y cada capa se puede apagar | Alt + M |
| Nitidez y rendimiento | Modo rendimiento a 1x, escalado nítido del pixel art y límite de 30 o 60 FPS | |
| Atajos extra | Números del 1 al 9 en la pantalla de vínculo, Retroceso para volver y Enter en el fin de partida | |
| Indicadores de combate | Radio del imán de experiencia, viñeta roja con vida baja y cuenta regresiva al próximo jefe o al Juicio | |

Los ajustes se abren con **Alt + N** dentro del juego o con el botón "Nexus" del menú principal.

## Instalación

1. Descarga el repositorio con "Code > Download ZIP" y descomprímelo, o clónalo con git.
2. Abre `chrome://extensions` y activa el "Modo de desarrollador".
3. Pulsa "Cargar descomprimida" y elige la carpeta `extension`.
4. Entra en "Detalles" de PokeSurvivor Nexus y activa **Permitir scripts de usuario**. Sin ese interruptor la extensión funciona igual, pero no se actualiza sola.
5. Recarga pokesurvivor.com.

Funciona en Chrome, Edge, Brave y Opera de escritorio a partir de la versión 120. No conviene tenerla activa junto con PokeSurvivor Plus, porque las dos dibujan su propio minimapa y cambian la cámara.

## Cómo se actualiza

La extensión es un cascarón pequeño que se instala una sola vez. Al abrir Chrome y cada 30 minutos revisa `dist/version.json` en este repositorio. Si hay una versión nueva, descarga `dist/mod.js`, comprueba su hash SHA-256 y su tamaño, y la deja lista para la próxima vez que se cargue el juego. Si la descarga falla, sigue usando la última versión buena. El ícono de la extensión muestra la versión activa y permite buscar una actualización a mano.

Si una actualización del juego rompe un módulo, la red de seguridad lo apaga solo y el resto sigue funcionando. El estado de cada módulo aparece en el panel de ajustes.

## Publicar una versión

```bash
node scripts/build.mjs --release 0.2.0
git add -A && git commit -m "Versión 0.2.0" && git push
```

El build une `src/` en `dist/mod.js`, calcula el hash para `dist/version.json` y copia el resultado a `extension/mod.bundled.js`. Mientras no se ejecute con `--release`, lo que se suba a `main` no les llega a los jugadores, porque la extensión solo descarga cuando sube el número de versión.

## Estructura

```
extension/   cascarón: manifiesto, actualizador, popup y copia empaquetada del mod
src/core/    enganche al juego, red de seguridad, ajustes, atajos y capa de dibujo
src/features/ un archivo por módulo
scripts/     build
dist/        versión publicada (mod.js y version.json)
docs/        diseño y planes por fase
```

## Créditos

La técnica para engancharse a los módulos internos del juego y el enfoque del minimapa vienen de [PokeSurvivor Plus](https://github.com/PokeSurvivorPlus/PokeSurvivorPlus) (MIT). PokéSurvivor es obra de JPTER78 y su código se publica bajo PolyForm Noncommercial 1.0.0. Pokémon y sus nombres pertenecen a sus dueños.

## Licencia

MIT. Ver [LICENSE](LICENSE).
