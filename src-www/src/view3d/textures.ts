/**
 * Procedural surface textures (floors, ground), drawn on a canvas in the
 * chosen base colour, so any colour works with any pattern and nothing has
 * to be downloaded. Textures are cached per pattern and colour.
 *
 * UVs of floors and the ground are in metres; `metres` is the real-world
 * size one texture tile covers.
 */
import * as THREE from 'three';
import type { FloorMaterial, GroundMaterial } from '../model/types';

type Pattern = FloorMaterial | GroundMaterial | 'rooftiles';

const SIZE = 512;
const cache = new Map<string, { texture: THREE.CanvasTexture; metres: number }>();

/** Deterministic pseudo random numbers, so a pattern looks the same every time. */
function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** The base colour, lighter (k > 0) or darker (k < 0). */
function shade(base: THREE.Color, k: number): string {
    const c = base.clone();
    if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k);
    else c.lerp(new THREE.Color('#000000'), -k);
    return `#${c.getHexString()}`;
}

function noise(ctx: CanvasRenderingContext2D, base: THREE.Color, amount: number, count: number, size: number, r: () => number) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = shade(base, (r() - 0.5) * 2 * amount);
        ctx.globalAlpha = 0.35 + r() * 0.5;
        const s = size * (0.5 + r());
        ctx.fillRect(r() * SIZE, r() * SIZE, s, s);
    }
    ctx.globalAlpha = 1;
}

const DRAW: Record<Pattern, { metres: number; draw: (ctx: CanvasRenderingContext2D, base: THREE.Color, r: () => number) => void }> = {
    plain: { metres: 1, draw: () => {} },
    wood: {
        // planks 20 cm wide, staggered joints
        metres: 2,
        draw(ctx, base, r) {
            const rows = 10;
            const h = SIZE / rows;
            for (let row = 0; row < rows; row++) {
                let x = -r() * SIZE * 0.6;
                while (x < SIZE) {
                    const len = SIZE * (0.35 + r() * 0.45);
                    ctx.fillStyle = shade(base, (r() - 0.5) * 0.18);
                    ctx.fillRect(x, row * h, len, h);
                    // grain
                    ctx.strokeStyle = shade(base, -0.12);
                    ctx.globalAlpha = 0.25;
                    for (let g = 0; g < 5; g++) {
                        const y = row * h + r() * h;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.bezierCurveTo(x + len / 3, y + (r() - 0.5) * 6, x + (2 * len) / 3, y + (r() - 0.5) * 6, x + len, y);
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = shade(base, -0.35);
                    ctx.fillRect(x, row * h, 2, h);
                    x += len;
                }
                ctx.fillStyle = shade(base, -0.3);
                ctx.fillRect(0, row * h, SIZE, 1.5);
            }
        },
    },
    tiles: {
        // 60 × 60 cm tiles with grout
        metres: 1.2,
        draw(ctx, base, r) {
            const n = 2;
            const s = SIZE / n;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    ctx.fillStyle = shade(base, (r() - 0.5) * 0.06);
                    ctx.fillRect(i * s, j * s, s, s);
                }
            }
            noise(ctx, base, 0.05, 900, 3, r);
            ctx.fillStyle = shade(base, -0.25);
            for (let i = 0; i <= n; i++) {
                ctx.fillRect(i * s - 2, 0, 4, SIZE);
                ctx.fillRect(0, i * s - 2, SIZE, 4);
            }
        },
    },
    stone: {
        // irregular slabs
        metres: 1.6,
        draw(ctx, base, r) {
            const rows = 4;
            const h = SIZE / rows;
            for (let row = 0; row < rows; row++) {
                let x = row % 2 ? -h / 2 : 0;
                while (x < SIZE) {
                    const w = h * (0.8 + r() * 0.8);
                    ctx.fillStyle = shade(base, (r() - 0.5) * 0.22);
                    ctx.fillRect(x + 2, row * h + 2, w - 4, h - 4);
                    x += w;
                }
            }
            noise(ctx, base, 0.12, 1500, 3, r);
        },
    },
    carpet: {
        metres: 1,
        draw(ctx, base, r) {
            noise(ctx, base, 0.12, 6000, 2, r);
        },
    },
    grass: {
        metres: 4,
        draw(ctx, base, r) {
            noise(ctx, base, 0.25, 4000, 6, r);
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 2500; i++) {
                const x = r() * SIZE;
                const y = r() * SIZE;
                ctx.strokeStyle = shade(base, (r() - 0.4) * 0.5);
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        },
    },
    gravel: {
        metres: 2,
        draw(ctx, base, r) {
            for (let i = 0; i < 5000; i++) {
                ctx.fillStyle = shade(base, (r() - 0.5) * 0.6);
                ctx.beginPath();
                ctx.ellipse(r() * SIZE, r() * SIZE, 2 + r() * 4, 2 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
        },
    },
    paving: {
        // rectangular pavers in running bond
        metres: 2,
        draw(ctx, base, r) {
            const rows = 10;
            const h = SIZE / rows;
            const w = h * 2;
            for (let row = 0; row < rows; row++) {
                for (let x = row % 2 ? -w / 2 : 0; x < SIZE; x += w) {
                    ctx.fillStyle = shade(base, (r() - 0.5) * 0.18);
                    ctx.fillRect(x + 1.5, row * h + 1.5, w - 3, h - 3);
                }
            }
            noise(ctx, base, 0.08, 1200, 2, r);
        },
    },
    rooftiles: {
        // clay tiles: overlapping rows of rounded tiles, 33 cm per row
        metres: 1.32,
        draw(ctx, base, r) {
            const rows = 4;
            const cols = 6;
            const h = SIZE / rows;
            const w = SIZE / cols;
            for (let row = 0; row < rows; row++) {
                for (let c = -1; c <= cols; c++) {
                    const x = c * w + (row % 2 ? w / 2 : 0);
                    const y = row * h;
                    const g = ctx.createLinearGradient(x, 0, x + w, 0);
                    const tone = (r() - 0.5) * 0.12;
                    g.addColorStop(0, shade(base, tone - 0.18));
                    g.addColorStop(0.45, shade(base, tone + 0.08));
                    g.addColorStop(1, shade(base, tone - 0.22));
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.moveTo(x + 2, y);
                    ctx.lineTo(x + w - 2, y);
                    ctx.lineTo(x + w - 2, y + h * 0.82);
                    ctx.quadraticCurveTo(x + w / 2, y + h * 1.05, x + 2, y + h * 0.82);
                    ctx.closePath();
                    ctx.fill();
                }
                // shadow line of the row above
                ctx.fillStyle = shade(base, -0.45);
                ctx.globalAlpha = 0.5;
                ctx.fillRect(0, row * h, SIZE, 3);
                ctx.globalAlpha = 1;
            }
        },
    },
    snow: {
        metres: 4,
        draw(ctx, base, r) {
            noise(ctx, base, 0.05, 2000, 8, r);
        },
    },
};

/** A tiling texture for the pattern in the given colour (null for plain). */
export function surfaceTexture(pattern: Pattern, color: string): { texture: THREE.CanvasTexture; metres: number } | null {
    if (pattern === 'plain') return null;
    const key = `${pattern}|${color}`;
    let entry = cache.get(key);
    if (!entry) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;
        const base = new THREE.Color(color);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, SIZE, SIZE);
        const spec = DRAW[pattern];
        spec.draw(ctx, base, rng(pattern.length * 7919));
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        entry = { texture, metres: spec.metres };
        cache.set(key, entry);
    }
    return entry;
}

/** Material for a floor or ground surface; `uvMetres` is how many metres one UV unit spans. */
export function surfaceMaterial(pattern: Pattern, color: string, uvMetres = 1, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const tex = surfaceTexture(pattern, color);
    if (!tex) return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    const map = tex.texture.clone();
    map.needsUpdate = true;
    map.repeat.set(uvMetres / tex.metres, uvMetres / tex.metres);
    return new THREE.MeshStandardMaterial({ map, roughness: pattern === 'tiles' ? 0.45 : 0.85, ...extra });
}
