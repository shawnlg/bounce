/**
 * level.js — Level generation for Bounce.
 *
 * A level is an object:
 *   {
 *     shapes: [ { type: 'circle'|'polygon', sides, x, y, radius, hits, spin } ],
 *     balls:  number of balls the player gets
 *   }
 *
 * Difficulty scales with level number: more shapes, higher hit counts,
 * and (from level 3+) some shapes slowly rotate (spin != 0).
 */

const LEVEL_CONFIG = {
    // Base number of shapes on level 1; grows with level.
    baseShapes: 3,
    // Extra shapes added per level (capped).
    shapesPerLevel: 1,
    maxShapes: 12,
    // Base hit count on level 1; grows with level.
    baseHits: 2,
    // Extra hits per level (capped).
    hitsPerLevel: 1,
    maxHits: 12,
    // Balls the player starts with (grows slightly with level).
    baseBalls: 5,
    // Shape radius range (world pixels).
    minRadius: 30,
    maxRadius: 60,
    // Levels at which rotation starts / ramps up.
    spinStartLevel: 3,
};

/**
 * Generate a deterministic-ish random level for the given level number.
 * @param {number} level 1-based level number
 * @param {number} width  playfield width
 * @param {number} height playfield height
 * @returns {{shapes: Array, balls: number}}
 */
function generateLevel(level, width, height) {
    const cfg = LEVEL_CONFIG;
    const shapes = [];

    const count = Math.min(
        cfg.baseShapes + (level - 1) * cfg.shapesPerLevel,
        cfg.maxShapes
    );
    const maxHits = Math.min(
        cfg.baseHits + (level - 1) * cfg.hitsPerLevel,
        cfg.maxHits
    );
    const balls = cfg.baseBalls + Math.floor(level / 3);

    // Keep shapes in the upper ~60% of the playfield, away from walls
    // and away from the center drain gap at the bottom.
    const margin = cfg.maxRadius + 30;
    const minX = margin;
    const maxX = width - margin;
    const minY = 80;
    const maxY = height * 0.55;

    let attempts = 0;
    while (shapes.length < count && attempts < 500) {
        attempts++;

        // Random shape: circle or regular polygon with 3-8 sides.
        const isCircle = Math.random() < 0.35;
        const sides = isCircle ? 0 : Phaser.Math.Between(3, 8);
        const radius = Phaser.Math.Between(cfg.minRadius, cfg.maxRadius);

        const x = Phaser.Math.Between(minX, maxX);
        const y = Phaser.Math.Between(minY, maxY);

        // Reject shapes that overlap already-placed shapes.
        let overlaps = false;
        for (const s of shapes) {
            const dx = s.x - x;
            const dy = s.y - y;
            const minDist = s.radius + radius + 20;
            if (dx * dx + dy * dy < minDist * minDist) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;

        // Rotation: none on early levels; slow spin later on.
        let spin = 0;
        if (level >= cfg.spinStartLevel && Math.random() < 0.5) {
            spin = Phaser.Math.FloatBetween(0.3, 1.2) * (Math.random() < 0.5 ? -1 : 1);
        }

        const hits = Phaser.Math.Between(
            Math.max(1, maxHits - 3),
            maxHits
        );

        shapes.push({
            type: isCircle ? 'circle' : 'polygon',
            sides,
            x, y, radius, hits, spin,
        });
    }

    return { shapes, balls };
}

// Expose for main.js (plain script tags, no modules).
window.generateLevel = generateLevel;
window.LEVEL_CONFIG = LEVEL_CONFIG;
