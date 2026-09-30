/**
 * main.js — Bounce: a Phaser 3 + Matter Physics slingshot ball game.
 *
 * HOW TO PLAY
 *   1. Press and HOLD the mouse button where you want the ball to appear.
 *   2. Drag the mouse AWAY from that point — direction and distance set the
 *      launch direction and power (slingshot).
 *   3. RELEASE to launch.
 *   Clear every shape to win the level. Run out of balls with shapes
 *   remaining and you lose. R restarts the level; the button restarts all.
 */

/* ============================== TUNABLE PHYSICS ==============================
 * Everything you may want to tweak lives in these two config objects.
 * ========================================================================== */

const GAME_CONFIG = {
    width: 1024,
    height: 768,
    gravityY: 1,          // World gravity (Matter default scale). Higher = heavier feel.
    ballRadius: 14,
    maxBallsInPlay: 8,    // Safety cap so the sim stays stable.
    drainGapWidth: 140,   // Gap in the bottom center where balls are lost.
    floorThickness: 40,
    wallThickness: 40,
    aimMaxDrag: 260,      // Max drag distance (px) = max launch power.
    maxLaunchSpeed: 26,   // Cap on launch velocity magnitude.
    ballLifetimeMs: 15000 // Balls are removed after this long (prevents buildup).
};

// Matter body physics — the main knobs for feel.
const PHYSICS = {
    ball: {
        restitution: 0.95,   // High = very lively bounces (0..1).
        friction: 0.005,     // Low = slides/rolls easily, keeps momentum.
        frictionAir: 0.001,  // Air drag; tiny value keeps flights long.
        frictionStatic: 0.01,
        density: 0.001,      // Mass per area; affects impact force on shapes.
        slop: 0.02,          // Allowed penetration; lower = crisper collisions.
        label: 'ball'
    },
    shape: {
        restitution: 0.9,    // Bounciness of obstacle surfaces.
        friction: 0.02,
        frictionAir: 0.0,    // Rotating shapes shouldn't slow down.
        isStatic: true,      // Obstacles are static but ROTATE (see below).
        label: 'shape'
    },
    wall: {
        restitution: 0.9,    // Wall/ceiling/floor bounciness.
        friction: 0.01,
        isStatic: true,
        label: 'wall'
    }
};

/* ============================== GAME SCENE ============================== */

class BounceScene extends Phaser.Scene {
    constructor() {
        super('BounceScene');
    }

    create() {
        this.levelNumber = 1;
        this.ballsRemaining = 0;
        this.ballsInPlay = 0;
        this.shapesLeft = 0;
        this.gameOver = false;
        this.aiming = false;
        this.aimStart = new Phaser.Math.Vector2();
        this.aimCurrent = new Phaser.Math.Vector2();

        this.matter.world.autoUpdate = true;

        this.buildStaticGeometry();
        this.buildUI();

        this.loadLevel(this.levelNumber);

        // --- Input ---
        this.input.on('pointerdown', (p) => {
            if (this.gameOver || this.ballsRemaining <= 0) return;
            this.aiming = true;
            this.aimStart.set(p.x, p.y);
            this.aimCurrent.set(p.x, p.y);
        });

        this.input.on('pointermove', (p) => {
            if (this.aiming) this.aimCurrent.set(p.x, p.y);
        });

        this.input.on('pointerup', () => {
            if (!this.aiming) return;
            this.aiming = false;
            this.launchBall();
        });

        this.input.keyboard.on('keydown-R', () => this.restartLevel());

        // --- Collision: ball hits shape -> decrement counter ---
        this.matter.world.on('collisionstart', (event) => {
            for (const pair of event.pairs) {
                const labels = [pair.bodyA.label, pair.bodyB.label];
                if (labels.includes('ball') && labels.includes('shape')) {
                    const shapeBody = pair.bodyA.label === 'shape' ? pair.bodyA : pair.bodyB;
                    const shape = shapeBody.gameObject;
                    if (shape && shape.getData('hits') > 0) {
                        this.hitShape(shape);
                    }
                }
            }
        });
    }

    /* ---------------- Level loading ---------------- */

    loadLevel(level) {
        // Clear old shapes and balls.
        if (this.shapeGroup) this.shapeGroup.clear(true, true);
        if (this.ballGroup) this.ballGroup.clear(true, true);
        this.shapeGroup = this.add.group();
        this.ballGroup = this.add.group();
        this.ballsInPlay = 0;
        this.gameOver = false;

        const data = generateLevel(level, GAME_CONFIG.width, GAME_CONFIG.height);
        this.ballsRemaining = data.balls;

        for (const s of data.shapes) {
            this.createShape(s);
        }
        this.shapesLeft = data.shapes.length;

        this.updateHUD(`Level ${level}  —  Balls: ${this.ballsRemaining}  —  Shapes: ${this.shapesLeft}`);
        this.showBanner(`Level ${level}`, 1200);
    }

    createShape(spec) {
        const style = {
            fillStyle: { color: Phaser.Display.Color.HSVToRGB(Math.random() * 360, 0.6, 0.9).color },
            lineStyle: { width: 3, color: 0xffffff }
        };

        let gameObject;
        if (spec.type === 'circle') {
            gameObject = this.add.circle(spec.x, spec.y, spec.radius, style.fillStyle.color);
            gameObject.setStrokeStyle(style.lineStyle.width, style.lineStyle.color);
            this.matter.add.gameObject(gameObject, {
                shape: { type: 'circle', radius: spec.radius },
                ...PHYSICS.shape
            });
        } else {
            const points = regularPolygonPoints(spec.sides, spec.radius);
            // Shift points so the bounding box starts at (0,0). Phaser draws
            // polygon points relative to the bbox top-left, while Matter
            // centers the body on the vertex centroid — without this shift
            // the sprite renders offset from its physics body.
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            const shifted = points.map(p => ({ x: p.x - minX, y: p.y - minY }));

            gameObject = this.add.polygon(spec.x, spec.y, shifted, style.fillStyle.color);
            gameObject.setStrokeStyle(style.lineStyle.width, style.lineStyle.color);
            this.matter.add.gameObject(gameObject, {
                // Use the polygon vertices so the physics body matches the art.
                shape: { type: 'polygon', vertices: shifted },
                ...PHYSICS.shape
            });
        }

        gameObject.setData('hits', spec.hits);
        gameObject.setData('spin', spec.spin);

        // Hit-count label drawn in the shape's center. Use the Matter
        // body's center-of-mass position — for polygons the game object's
        // x/y is the bounding-box corner, not the visual center.
        const bodyPos = gameObject.body ? gameObject.body.position : { x: spec.x, y: spec.y };
        const label = this.add.text(bodyPos.x, bodyPos.y, String(spec.hits), {
            fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        gameObject.setData('label', label);

        this.shapeGroup.add(gameObject);
    }

    hitShape(shape) {
        const hits = shape.getData('hits') - 1;
        shape.setData('hits', hits);
        const label = shape.getData('label');
        label.setText(String(hits));

        if (hits <= 0) {
            label.destroy();
            shape.destroy(); // Removes the Matter body too.
            this.shapesLeft--;
            if (this.shapesLeft <= 0) {
                this.levelNumber++;
                this.time.delayedCall(600, () => this.loadLevel(this.levelNumber));
            } else {
                this.updateHUD(`Level ${this.levelNumber}  —  Balls: ${this.ballsRemaining}  —  Shapes: ${this.shapesLeft}`);
            }
        }
    }

    /* ---------------- Slingshot launching ---------------- */

    launchBall() {
        const drag = this.aimCurrent.clone().subtract(this.aimStart);
        const dist = drag.length();
        if (dist < 10) return; // Too small — ignore click.

        if (this.ballsRemaining <= 0 || this.ballsInPlay >= GAME_CONFIG.maxBallsInPlay) return;
        this.ballsRemaining--;

        // Launch direction is opposite the drag (slingshot pull-back).
        const power = Phaser.Math.Clamp(dist / GAME_CONFIG.aimMaxDrag, 0, 1);
        const speed = power * GAME_CONFIG.maxLaunchSpeed;
        const dir = drag.normalize().negate();

        const ball = this.add.circle(this.aimStart.x, this.aimStart.y, GAME_CONFIG.ballRadius, 0xffdd55);
        ball.setStrokeStyle(2, 0xffffff);
        const body = this.matter.add.gameObject(ball, {
            shape: { type: 'circle', radius: GAME_CONFIG.ballRadius },
            ...PHYSICS.ball
        });

        body.setVelocity(dir.x * speed, dir.y * speed);
        this.ballGroup.add(ball);
        this.ballsInPlay++;

        // Retire balls after a while so the sim doesn't fill up.
        this.time.delayedCall(GAME_CONFIG.ballLifetimeMs, () => {
            if (ball.active) {
                ball.destroy();
                this.ballsInPlay--;
                this.checkLoss();
            }
        });

        this.updateHUD(`Level ${this.levelNumber}  —  Balls: ${this.ballsRemaining}  —  Shapes: ${this.shapesLeft}`);
    }

    /* ---------------- Win / lose ---------------- */

    checkLoss() {
        if (this.gameOver || this.shapesLeft <= 0) return;
        // Lost if no balls left, none in play, and shapes remain.
        if (this.ballsRemaining <= 0 && this.ballsInPlay <= 0) {
            this.gameOver = true;
            this.showBanner('GAME OVER\nPress R to retry', 0, true);
        }
    }

    restartLevel() {
        this.showBanner('', 0); // clear
        this.loadLevel(this.levelNumber);
    }

    /* ---------------- Static geometry ---------------- */

    buildStaticGeometry() {
        const W = GAME_CONFIG.width, H = GAME_CONFIG.height;
        const T = GAME_CONFIG.wallThickness;
        const gap = GAME_CONFIG.drainGapWidth;

        // Left / right walls and ceiling.
        this.matter.add.rectangle(T / 2, H / 2, T, H, PHYSICS.wall);
        this.add.rectangle(T / 2, H / 2, T, H, 0x444466);
        this.matter.add.rectangle(W - T / 2, H / 2, T, H, PHYSICS.wall);
        this.add.rectangle(W - T / 2, H / 2, T, H, 0x444466);
        this.matter.add.rectangle(W / 2, T / 2, W, T, PHYSICS.wall);
        this.add.rectangle(W / 2, T / 2, W, T, 0x444466);

        // Slanted floor: two ramps sloping down toward the center gap.
        // Balls that fall through the gap are lost.
        const floorY = H - T;
        const rampLen = (W / 2 - gap / 2) + 4;
        const slope = 0.18; // radians of downward tilt toward center. Tune for steeper/shallower.

        const leftCenterX = gap / 2 + rampLen / 2;
        const rightCenterX = W - gap / 2 - rampLen / 2;

        // Left ramp: high on the left, low at the center gap.
        this.matter.add.rectangle(leftCenterX, floorY + rampLen * Math.sin(slope) / 2, rampLen, T, {
            ...PHYSICS.wall,
            angle: slope
        });
        this.add.rectangle(leftCenterX, floorY + rampLen * Math.sin(slope) / 2, rampLen, T, 0x444466).setAngle(Phaser.Math.RadToDeg(slope));

        // Right ramp: mirrored.
        this.matter.add.rectangle(rightCenterX, floorY + rampLen * Math.sin(slope) / 2, rampLen, T, {
            ...PHYSICS.wall,
            angle: -slope
        });
        this.add.rectangle(rightCenterX, floorY + rampLen * Math.sin(slope) / 2, rampLen, T, 0x444466).setAngle(Phaser.Math.RadToDeg(-slope));

        // Kill zone below the gap: destroy any ball that enters.
        this.matter.world.on('collisionstart', (event) => {
            for (const pair of event.pairs) {
                const labels = [pair.bodyA.label, pair.bodyB.label];
                if (labels.includes('ball') && labels.includes('drain')) {
                    const ballBody = pair.bodyA.label === 'ball' ? pair.bodyA : pair.bodyB;
                    if (ballBody.gameObject && ballBody.gameObject.active) {
                        ballBody.gameObject.destroy();
                        this.ballsInPlay--;
                        this.checkLoss();
                    }
                }
            }
        });

        // Invisible drain sensor under the gap.
        this.matter.add.rectangle(W / 2, H + 60, gap + 200, 80, {
            isStatic: true,
            isSensor: true,
            label: 'drain'
        });
    }

    /* ---------------- UI ---------------- */

    buildUI() {
        this.hudText = this.add.text(16, 12, '', {
            fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
        }).setDepth(10);

        // Instructions.
        this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height - 14,
            'HOLD mouse to place ball • DRAG away to aim • RELEASE to launch • R = restart',
            { fontSize: '14px', color: '#aaaaff' }
        ).setOrigin(0.5, 1).setDepth(10);

        // Restart-all button (HTML overlay would work too; keep it in-canvas).
        const btn = this.add.text(GAME_CONFIG.width - 16, 12, '⟳ Restart Game', {
            fontSize: '18px', color: '#ff8888', backgroundColor: '#333355',
            padding: { x: 10, y: 6 }
        }).setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });

        btn.on('pointerdown', () => {
            this.levelNumber = 1;
            this.loadLevel(1);
        });

        // Aim indicator (line + ghost ball while dragging).
        this.aimLine = this.add.graphics().setDepth(9);
    }

    updateHUD(text) {
        this.hudText.setText(text);
    }

    showBanner(text, duration, sticky = false) {
        if (this.banner) this.banner.destroy();
        if (!text) { this.banner = null; return; }
        this.banner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, text, {
            fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
            backgroundColor: '#000000aa', padding: { x: 30, y: 20 },
            align: 'center'
        }).setOrigin(0.5).setDepth(20);
        if (!sticky && duration > 0) {
            this.time.delayedCall(duration, () => { if (this.banner) { this.banner.destroy(); this.banner = null; } });
        }
    }

    update() {
        // Rotate spinning shapes: we rotate the actual Matter body so
        // collisions respond to the rotation (not just the sprite).
        if (!this.shapeGroup) return;
        for (const shape of this.shapeGroup.getChildren()) {
            const spin = shape.getData('spin');
            if (spin && shape.body) {
                // Rotate the actual physics body so collisions respond
                // to the rotation (not just the sprite).
                Phaser.Physics.Matter.Matter.Body.setAngularVelocity(
                    shape.body, spin * 0.02
                );
            }
            // Keep the hit-count label centered on the shape. Use the
            // physics body's center-of-mass, not the game object's x/y
            // (which is the bounding-box corner for polygons).
            const label = shape.getData('label');
            if (label && shape.body) {
                label.setPosition(shape.body.position.x, shape.body.position.y);
            }
        }

        // Draw the slingshot aim indicator.
        this.aimLine.clear();
        if (this.aiming) {
            const drag = this.aimCurrent.clone().subtract(this.aimStart);
            const dist = Phaser.Math.Clamp(drag.length(), 0, GAME_CONFIG.aimMaxDrag);
            const dir = drag.length() > 0 ? drag.clone().normalize().negate() : new Phaser.Math.Vector2();
            const end = this.aimStart.clone().add(dir.scale(dist));

            this.aimLine.lineStyle(3, 0xffdd55, 0.9);
            this.aimLine.beginPath();
            this.aimLine.moveTo(this.aimStart.x, this.aimStart.y);
            this.aimLine.lineTo(end.x, end.y);
            this.aimLine.strokePath();

            // Ghost ball at launch point.
            this.aimLine.fillStyle(0xffdd55, 0.4);
            this.aimLine.fillCircle(this.aimStart.x, this.aimStart.y, GAME_CONFIG.ballRadius);

            // Power dots along the line.
            const dots = Math.floor(dist / 30);
            for (let i = 1; i <= dots; i++) {
                const t = i / (dots + 1);
                const px = Phaser.Math.Linear(this.aimStart.x, end.x, t);
                const py = Phaser.Math.Linear(this.aimStart.y, end.y, t);
                this.aimLine.fillCircle(px, py, 3);
            }
        }
    }
}

/* ============================== HELPERS ============================== */

/**
 * Generate vertices for a regular polygon centered at origin.
 * @param {number} sides 3-8
 * @param {number} radius circumradius
 */
function regularPolygonPoints(sides, radius) {
    const points = [];
    const offset = -Math.PI / 2; // start pointing up
    for (let i = 0; i < sides; i++) {
        const a = offset + (i * 2 * Math.PI) / sides;
        points.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    }
    return points;
}

/* ============================== BOOTSTRAP ============================== */

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: GAME_CONFIG.gravityY },
            // Solver settings — raise positionIterations/velocityIterations
            // if you see tunneling or jittery stacks at high speeds.
            positionIterations: 8,
            velocityIterations: 6,
            enableSleeping: false // keep false so static spinners stay active
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: BounceScene
};

const game = new Phaser.Game(config);
// Exposed for console debugging.
window.__BOUNCE_GAME = game;
