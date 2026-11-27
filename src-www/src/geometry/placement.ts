import type { AssetMeta, Floor, SceneObject, Vec2 } from '../model/types';
import { computeWallGeometry } from './walls';
import { add, dot, scale, sub } from './vec';

/**
 * Object orientation in plan coordinates. A rotation θ (three.js rotation.y)
 * maps the model's local +X to plan (cos θ, -sin θ) and its front (+Z) to
 * plan (sin θ, cos θ).
 */
export function objectAxes(rotation: number): { right: Vec2; front: Vec2 } {
    return { right: [Math.cos(rotation), -Math.sin(rotation)], front: [Math.sin(rotation), Math.cos(rotation)] };
}

/** Rotation that makes the model's front face the plan direction `dir`. */
export const rotationFacing = (dir: Vec2) => Math.atan2(dir[0], dir[1]);

export function objectFootprint(o: Pick<SceneObject, 'x' | 'y' | 'rotation' | 'scale'>, asset: AssetMeta): Vec2[] {
    const w = asset.size[0] * o.scale[0];
    const d = asset.size[2] * o.scale[2];
    const { right, front } = objectAxes(o.rotation);
    const c: Vec2 = [o.x, o.y];
    const p = (sx: number, sz: number) => add(add(c, scale(right, (sx * w) / 2)), scale(front, (sz * d) / 2));
    return [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
}

export interface PlacementInput {
    floor: Floor;
    asset: AssetMeta;
    point: Vec2;
    rotation: number;
    scale: [number, number, number];
    elevation?: number;
    grid: number;
    snap: boolean;
}

export type Placement = Pick<SceneObject, 'x' | 'y' | 'elevation' | 'rotation'> & { againstWall: boolean };

const WALL_REACH = 0.35;

/**
 * Where an object ends up when dropped at `point`:
 * - floor objects snap to the grid, and with their back against a wall when
 *   dropped close to it;
 * - wall objects always attach to the nearest wall face (within reach);
 * - ceiling objects hang from the ceiling.
 */
export function computePlacement(inp: PlacementInput): Placement {
    const { floor, asset, point } = inp;
    const depth = asset.size[2] * inp.scale[2];
    const height = asset.size[1] * inp.scale[1];
    const round = (v: number) => (inp.snap ? Math.round(v / inp.grid) * inp.grid : v);

    let elevation = inp.elevation ?? 0;
    if (asset.mount === 'ceiling') elevation = floor.height - height;
    else if (asset.mount === 'wall') elevation = inp.elevation ?? Math.max(0, Math.min(1.1, floor.height - height - 0.2));
    else if (inp.elevation === undefined) elevation = 0;

    if (inp.snap && asset.mount !== 'ceiling') {
        const reach = asset.mount === 'wall' ? 1.0 : WALL_REACH;
        const frames = Object.values(computeWallGeometry(floor).frames);
        let best: { d: number; pos: Vec2; rot: number } | null = null;
        for (const fr of frames) {
            const rel = sub(point, fr.start);
            const u = dot(rel, fr.dir);
            if (u < 0 || u > fr.length) continue;
            const v = dot(rel, fr.normal);
            const side = v >= 0 ? 1 : -1;
            const faceDist = Math.abs(v) - fr.wall.thickness / 2; // distance of the point from the wall face
            // distance of the object's back from the face if its centre were at `point`
            const gap = faceDist - depth / 2;
            if (faceDist < -0.01 && asset.mount !== 'wall') continue;
            // snap when the object's back is near the face: not far away, not deep inside the wall
            if (gap > reach || (asset.mount !== 'wall' && gap < -Math.max(0.3, depth * 0.4))) continue;
            const d = Math.abs(gap);
            if (!best || d < best.d) {
                const n = scale(fr.normal, side);
                const uu = Math.min(Math.max(round(u), 0), fr.length);
                const pos = add(add(fr.start, scale(fr.dir, uu)), scale(n, fr.wall.thickness / 2 + depth / 2 + 0.005));
                best = { d, pos, rot: rotationFacing(n) };
            }
        }
        if (best) return { x: best.pos[0], y: best.pos[1], elevation, rotation: best.rot, againstWall: true };
    }
    return { x: round(point[0]), y: round(point[1]), elevation, rotation: inp.rotation, againstWall: false };
}
