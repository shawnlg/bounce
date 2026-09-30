# AGENTS.md — Bounce (Slingshot Ball Game)

Orientation for AI agents working in this repo. Read this before making changes.

## What this is

A 2D browser game: **Phaser 3.80.1 + Matter Physics**, loaded from CDN. No build
step, no bundler, no npm dependencies. Plain `<script>` tags and global functions.

The player slingshots balls at numbered shapes. Each bounce off a shape decrements
its number; at zero the shape is destroyed. Clear all shapes to advance a level.
Run out of balls with shapes remaining and you lose.

## Running it

Browsers block some `file://` loading, so serve over HTTP:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`).

## File map

| File | Role |
| --- | --- |
| `index.html` | Page shell. Loads Phaser from CDN, then `js/level.js`, then `js/main.js` (order matters). |
| `js/level.js` | `generateLevel(level, width, height)` → `{ shapes, balls }`. Also exports `LEVEL_CONFIG`. |
| `js/main.js` | `GAME_CONFIG`, `PHYSICS`, `BounceScene`, `regularPolygonPoints`, and the Phaser bootstrap. |
| `prompt.txt` | Original design brief. Source of truth for intended behavior. |
| `README.md` | Player-facing docs and tuning notes. |

## Architecture notes

- **No modules.** `level.js` attaches `window.generateLevel` / `window.LEVEL_CONFIG`;
  `main.js` consumes them. Keep this pattern unless you deliberately migrate to ESM
  (which would require changing `index.html` and serving over HTTP).
- **Single scene:** `BounceScene`. All state lives on the scene instance
  (`levelNumber`, `ballsRemaining`, `ballsInPlay`, `shapesLeft`, `gameOver`, `aiming`).
- **Groups:** `this.shapeGroup` and `this.ballGroup` are rebuilt on every `loadLevel()`.
- **Labels:** each shape carries a `hits` number and a `label` Text object via
  `setData`/`getData`. Labels are repositioned every frame to the body's
  center-of-mass (polygon game objects are positioned at their bbox corner, not center).

## Physics model (the important part)

- Obstacles are **static Matter bodies that rotate**. Rotation is applied in
  `update()` via `Matter.Body.setAngularVelocity(shape.body, spin * 0.02)` — the
  *body* rotates, not just the sprite, so collisions respond to the motion. Do not
  "fix" this by rotating the sprite only.
- Balls: high `restitution` (0.95), low `friction`, tiny `frictionAir`, short
  `slop`. Balls are retired after `ballLifetimeMs` to keep the sim stable.
- Walls/ceiling/floor: `restitution` 0.9, static.
- The floor is **two slanted ramps** sloping toward a center gap. A sensor body
  labeled `drain` sits below the gap and destroys any ball that enters it.
- Collision handling is via `matter.world.on('collisionstart', ...)` and matches on
  body **labels**: `'ball'`, `'shape'`, `'wall'`, `'drain'`. If you add body types,
  give them labels and follow the same pattern.
- Solver: `positionIterations: 8`, `velocityIterations: 6`, `enableSleeping: false`
  (sleeping must stay off so static spinners keep rotating).

## Tuning knobs

- `GAME_CONFIG` (top of `main.js`) — gravity, ball radius, drain gap, launch power
  cap, ball lifetime, `maxBallsInPlay`.
- `PHYSICS.ball` / `PHYSICS.shape` / `PHYSICS.wall` — restitution, friction, density.
- `LEVEL_CONFIG` (top of `level.js`) — shapes per level, hit counts, ball count,
  radius range, `spinStartLevel`.
- Floor slope is the local `slope` constant in `buildStaticGeometry()`.

## Conventions

- Keep the tunable config objects at the top of their files and keep the existing
  comments — they are intentional documentation for the user.
- Match the existing style: 4-space indent, `const`/`let`, JSDoc on exported helpers.
- Comment physics settings that a user might want to tune.
- No new dependencies without asking; the project is deliberately dependency-free.

## Gotchas

- `index.html` script order is load-bearing: `level.js` must come before `main.js`.
- Polygon rendering offset: `createShape()` shifts polygon vertices so the bbox
  starts at (0,0) to align the sprite with the Matter body. Preserve this.
- `loadLevel()` clears groups with `clear(true, true)`; make sure any new per-shape
  resources (text, timers) are destroyed too, or they will leak across levels.
- `checkLoss()` only fires when `ballsRemaining <= 0` **and** `ballsInPlay <= 0`.
  Any new ball-removal path must call it.
