# Bounce — Slingshot Ball Game

A 2D browser game built with **Phaser 3 + Matter Physics**. Launch balls with a
slingshot mechanic to destroy numbered shapes. Clear all shapes to advance;
run out of balls and you lose.

## How to Play

1. **HOLD** the mouse button where you want the ball to appear.
2. **DRAG** away from that point — direction and distance set launch angle and power.
3. **RELEASE** to launch.
4. Each bounce off a shape decrements its number. At 0 the shape disappears.
5. Clear every shape to win the level. Out of balls with shapes left = game over.
6. **R** restarts the current level; the **⟳ Restart Game** button resets to level 1.

Balls that fall through the gap in the slanted floor are lost.

## Running Locally

The game uses plain script tags (no build step), but browsers block `file://`
module loading for some assets, so serve it over HTTP:

```bash
cd bounce
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use any static server (`npx serve`, `php -S localhost:8000`, etc.).

## Files

- `index.html` — page shell, loads Phaser from CDN and the game scripts.
- `js/level.js` — procedural level generation (shape count, hit numbers, spin).
- `js/main.js` — game scene, physics setup, slingshot input, win/lose logic.

## Tuning

All the interesting knobs are at the top of `js/main.js`:

- `GAME_CONFIG` — gravity, ball size/radius, drain gap width, launch power cap, ball lifetime.
- `PHYSICS.ball` — `restitution` (bounciness), `friction`, `frictionAir`, `density`.
- `PHYSICS.shape` / `PHYSICS.wall` — obstacle and wall bounce feel.
- Matter solver settings in the Phaser config (`positionIterations`, `velocityIterations`) — raise if you see tunneling at high speeds.
- `LEVEL_CONFIG` in `js/level.js` — difficulty curve (shapes per level, hit counts, when rotation starts).
