# Lote 3: hallazgos técnicos del juego

Notas de la investigación del 1 de noviembre de 2026 sobre la versión b742e43 del juego. Nombres exactos del namespace (`NX.ns`).

## Mundo y biomas

- `World.TS` 32 px, `Tiles.T` 16 px, trozos de 16×16 tiles (`World.CW` 512 px), caché de unos 400 trozos.
- El terreno (0 suelo, 1 muro, 2 líquido) sale de una función de closure con ruido de valor que depende solo de la semilla (`World.reset(seed)`) y de `World.arena`. No depende del bioma. Consultas: `World.kindAt`, `isWall`, `isLiquid`, `isFree`.
- `Tiles.BIOMES` es un array mutable de 25 paletas (misma referencia que usa el closure). 0 a 2 normales (Bosque Umbrío, Cueva Cristal, Volcán Ceniza), 3 a 20 grietas por tipo, 21 Ruinas del Juicio, 22 a 24 Halloween (`Tiles.HW = 22`). Cada paleta: `name`, `liquid` (water, lava, swamp, spark, ice, poison), `floor[3]`, `dirt[3]`, `speck`, `light`, `flowers[3]`, `wallTop[3]`, `wallLight`, `wallEdge`, `wallFace[2]`, `wallFaceDark`, `liq`, `liqDeep`, `foam`, `shore`, `prop` (tree, crystal, dead), `leaf[4]`, `trunk[2]`, `rock[3]`, `grass[3]`. Hay que definir la paleta completa (si se clona, varias claves se heredan).
- Los efectos de cada líquido están en una tabla de closure: se reutilizan, no se crean.
- Rotación: `Game.startRun` llama `World.setBiome(Tiles.runBiome(0), true)`; el bucle cambia de etapa cada 240 s con `World.setBiome(Tiles.runBiome(etapa))`. `runBiome` devuelve `etapa % 3` o `22 + etapa % 3` con `Halloween.inRun`. `setBiome` normaliza con `BIOMES.length`, acepta índices nuevos. Probado: push de una paleta a `BIOMES` + `Tiles.runBiome = () => 25` funciona y el HUD muestra el nombre nuevo. Buscar biomas por `name`, no por índice, porque las actualizaciones pueden reordenar.
- Música: `BIOME_MUSIC = ['forest','cave','volcano']` indexada por etapa. `MUSIC` es un objeto mutable con datos procedurales (`bpm`, `chords`, `melody`, `parts`, `drums`). La música del juego está apagada por defecto en Nexus (`music.js`).
- Arena: `World.setArena({tx, ty, r, type})` genera un círculo de suelo (0 a r tiles, con pilares y charcos según tema), anillo de muro de r a r+7 y terreno normal fuera. Tema en `Tiles.ARENA_THEMES[type]` (objeto mutable: `pools`, `pillars`, `props{tree,rock,grass}`, `clear`, `weather`, `name`). `Tiles.arenaBiome(type)` = `3 + ARENA_TYPES.indexOf(type)`: no hacer push a `ARENA_TYPES` (choca con Halloween); envolver `arenaBiome` o llamar `setBiome` después. `Rift.debugArena(type)` abre una arena de grieta completa. Probado: arena propia con `pools: 0.55` da islas. Los spawns siguen dentro y fuera (Spawner solo se detiene con `Rift.inArena`); con `r` menor de unos 20 tiles hay que envolver `Spawner.ahead` y `burst` o usar `r >= 28`.

## Enemigos y spawns

- El spawn toma al azar de `Enemies.bagAt(time)` (reemplazable); `bagAt` mira primero `Events.bag()`.
- `Enemies.cast` se sortea por partida (`rollRun`) en tramos `TIERS` (from, bst, hp, spd, dmg, xp). `Enemies.BOSSES` (at, dex, stats) se regenera cada partida.
- Tasa `Spawner.rate(t)`, tope `Spawner.CAP` (64), oleadas cada 38 a 56 s. Escala `Enemies.scale(t)` y `bossScale`.
- `Enemies.hordeDefs(tipo, t)` devuelve 4 definiciones escaladas de un tipo; `hordeTypes(t)` lista tipos. Probado: `bagAt = () => hordeDefs('fire',0).concat(hordeDefs('ground',0))` solo saca esos Pokémon. Definiciones manuales: `{dex, name, behavior, hp, spd, dmg, xp, ...}`.

## Sprites y transformaciones

- `Sprites.sheet(dex, anim, shiny, skin)` carga `assets/pokemon/<dex>/[k-<skin>/][s/]<Anim>.png`. La clave `dex` puede ser cualquier string con entrada en `SPRITE_META`. Animaciones: `Sprites.ANIMS` (Idle, Walk, Attack, Hurt, Faint, Shoot, Charge). Hojas: columnas = frames, 8 filas = direcciones. Si falta una animación, cae en Idle o Walk.
- `SPRITE_META[key] = { s, a: { Anim: { w, h, n, r, d[], ax, ay } }, sh, sa?, hv? }`.
- Cambio en caliente probado (Charmander a Charizard ×2 sin romper animaciones): `player.anim.dex = 6; await Sprites.preload([6]); player.anim.scale = player.scale = Sprites.playerScale(6) * 2; player.r = Sprites.playerRadius(6) * 2; player.bodyH = Sprites.bodyHeight(6, scale)`. No cambiar `player.dex` (lo usan guardado, ranking y HUD).
- `Skins.SKINS` exige el mismo número de frames que la forma base: no sirve para megas.

## SpriteCollab (PMDCollab/SpriteCollab, CC BY-NC 4.0)

- Estructura `sprite/<dex 4 díg>/<forma 4 díg>/` (shiny en `/0001` dentro). Por animación: `<Anim>-Anim.png`, `-Offsets.png`, `-Shadow.png`, más `AnimData.xml` y `credits.txt`. `tracker.json` tiene `subgroups[forma].name` (Mega, Mega_X, Mega_Y, Primal...), `sprite_files`, `sprite_complete`, `sprite_credit`.
- Formato idéntico al del juego (`6/Idle.png` = `0006/Idle-Anim.png`, 160×384). Conversión de `AnimData.xml` a `SPRITE_META`: `w`/`h` = FrameWidth/FrameHeight, `d` = Durations, `n` = número de duraciones, `r` = 8, `s` = ShadowSize, `ax`/`ay` = píxel blanco de `-Shadow.png` en el primer frame menos 0,5 (base 0006: 19,5/27,5; Mega X: 23,5/31,5 sobre 48×56).
- Megas con 6/7 animaciones (falta Faint, cae en Idle) y shiny: Charizard Mega_X 6/0001, Alakazam 65/0001, Gengar 94/0001, Kangaskhan 115/0001, Aerodactyl 142/0001, Mewtwo Mega_Y 150/0002, Steelix 208/0001, Houndoom 229/0001, Gardevoir 282/0001, Sableye 302/0001, Manectric 310/0001, Camerupt 323/0001, Altaria 334/0001, Banette 354/0001, Glalie 362/0001, Latias 380/0001, Latios 381/0001, Primal Kyogre 382/0001, Primal Groudon 383/0001, Rayquaza 384/0001, Lopunny 428/0001, Gallade 475/0001, Excadrill 530/0001, Eelektross 604/0001, Floette 670/0006, Dragalge 691/0001, Zygarde 718/0005, Diancie 719/0001, Drampa 780/0001, Tatsugiri 978/0003. Completo 7/7: Mawile 303/0001; Primal Dialga 483/0002 (sin shiny). 6/7 sin shiny: Skarmory 227/0001, Tyranitar 248/0001, Medicham 308/0001, Darkrai 491/0002. 5/7 (sin Faint ni Shoot): Absol 359/0001, Lucario 448/0001, Zeraora 807/0001.
- Sin sprites útiles: Mega Venusaur, Blastoise, Charizard Y, Beedrill, Pidgeot, Gyarados, Pinsir, Blaziken, Sceptile, Sharpedo y casi todos los Gigamax.
- Atribución: créditos por forma en `credits.txt`; agregarlos a los créditos de la edición.

## Jugador y estadísticas

- `Game.player` (instancia de `Player`), todo mutable: `mon` (entrada del DEX con `types`, `hp`, `spd`, `atk`, `pa`, `sa`, `df`, `sd`, `bst`), `maxHp`, `hp`, `baseAtk`, `baseSpd`, `atkMul`, `spdMul`, `cdMul`, `dmgReduce`, `buffs{atk,patk,satk,spd,def,regen}`, `scale`, `r`, `bodyH`, `anim`. `atk` y `spd` son getters; `atkFor` usa `Stats.fit(mon, cat)`; defensa recibida `Stats.taken(mon.df | sd)`; clima `Weather.speedFor(mon.types)`.
- Transformación temporal: guardar estado, sustituir `mon` por un clon, ajustar `baseAtk`, `baseSpd`, `maxHp` (manteniendo la proporción de `hp`), cambiar sprite, restaurar al terminar. Cambiar `mon.types` afecta `Upgrades` y movimientos `monoType`.
- Dinamax: `anim.scale` y `scale` ×2, `r` ×2 (colisión y anillos), `bodyH`; `drawShadow` se adapta solo.

## Otros

- El invitado nuevo en la copia offline necesita `ns.DB.save.partner = 4` antes de `Game.startRun()`.
- En fechas de Halloween la partida arranca en el bioma 22.
- Modos existentes: `NX.modes` (`register`, `launch`, `ctx`, `exitToMenu`, `open(tab)`, `resume`) en `src/features/modes.js`; parchea `Game.startRun`, `Ranking.*`, `Judgment.*`, `Player.prototype.hurt/heal`, `Enemy.prototype.hurt`, `Spawner.update`, `Rift.update`, `EnemyMgr.add`, `Enemies.scale/bossScale`, `Game.debugSpeed`.
