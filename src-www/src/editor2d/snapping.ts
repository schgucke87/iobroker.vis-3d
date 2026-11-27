import type { Floor, Vec2 } from '../model/types';
import type { AttachTarget } from '../model/ops';
import { add, dist, len, normalize, projectOnSegment, scale, sub } from '../geometry/vec';

export interface SnapResult {
    point: Vec2;
    target: AttachTarget;
    kind: 'node' | 'wall' | 'angle' | 'grid' | 'free';
    /** Alignment guides to draw (plan coordinates). */
    guides: [Vec2, Vec2][];
}

export interface SnapOptions {
    /** Metres per screen pixel. */
    mpp: number;
    grid: number;
    enabled: boolean;
    /** Start point of the wall being drawn: enables angle snapping. */
    from?: Vec2;
    /** Nodes that must not be snapped to (e.g. the one being dragged). */
    excludeNodes?: Set<string>;
}

const NODE_PX = 12;
const WALL_PX = 9;
const ALIGN_PX = 8;
const ANGLE_STEP = Math.PI / 12; // 15°
const ANGLE_TOL = (5 * Math.PI) / 180;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function snapPoint(floor: Floor, raw: Vec2, opt: SnapOptions): SnapResult {
    if (!opt.enabled) return { point: raw, target: { kind: 'point', point: raw }, kind: 'free', guides: [] };
    const ex = opt.excludeNodes ?? new Set<string>();

    // 1. existing nodes
    let best: { id: string; d: number; p: Vec2 } | null = null;
    for (const n of Object.values(floor.nodes)) {
        if (ex.has(n.id)) continue;
        const d = dist(raw, [n.x, n.y]);
        if (d < NODE_PX * opt.mpp && (!best || d < best.d)) best = { id: n.id, d, p: [n.x, n.y] };
    }
    if (best) return { point: best.p, target: { kind: 'node', nodeId: best.id }, kind: 'node', guides: [] };

    // 2. onto a wall (point along the wall rounded to the grid)
    let bestWall: { id: string; d: number; p: Vec2 } | null = null;
    for (const w of Object.values(floor.walls)) {
        if (ex.has(w.a) || ex.has(w.b)) continue;
        const a: Vec2 = [floor.nodes[w.a].x, floor.nodes[w.a].y];
        const b: Vec2 = [floor.nodes[w.b].x, floor.nodes[w.b].y];
        const pr = projectOnSegment(raw, a, b);
        const tol = Math.max(WALL_PX * opt.mpp, w.thickness / 2);
        if (pr.distance < tol && (!bestWall || pr.distance < bestWall.d)) {
            const l = dist(a, b);
            const u = Math.min(l, Math.max(0, roundTo(pr.t * l, opt.grid)));
            bestWall = { id: w.id, d: pr.distance, p: add(a, scale(normalize(sub(b, a)), u)) };
        }
    }
    if (bestWall) {
        return { point: bestWall.p, target: { kind: 'wall', wallId: bestWall.id, point: bestWall.p }, kind: 'wall', guides: [] };
    }

    // 3. angle snapping relative to the start point
    if (opt.from) {
        const v = sub(raw, opt.from);
        const l = len(v);
        if (l > 1e-6) {
            const ang = Math.atan2(v[1], v[0]);
            const snapped = roundTo(ang, ANGLE_STEP);
            if (Math.abs(snapped - ang) < ANGLE_TOL) {
                const dir: Vec2 = [Math.cos(snapped), Math.sin(snapped)];
                let length = roundTo(l, opt.grid);
                // prefer lining up with another node along this ray
                const guides: [Vec2, Vec2][] = [];
                for (const n of Object.values(floor.nodes)) {
                    if (ex.has(n.id)) continue;
                    const np: Vec2 = [n.x, n.y];
                    if (Math.abs(dir[0]) > 1e-6 && Math.abs(dir[1]) > 1e-6) break; // only for axis-aligned rays
                    const along = Math.abs(dir[0]) > 0.5 ? (np[0] - opt.from[0]) / dir[0] : (np[1] - opt.from[1]) / dir[1];
                    if (along > 0 && Math.abs(along - l) < ALIGN_PX * opt.mpp) {
                        length = along;
                        guides.push([np, add(opt.from, scale(dir, along))]);
                        break;
                    }
                }
                const p = add(opt.from, scale(dir, length));
                return { point: p, target: { kind: 'point', point: p }, kind: 'angle', guides };
            }
        }
    }

    // 4. grid plus alignment with existing nodes on x / y
    let p: Vec2 = [roundTo(raw[0], opt.grid), roundTo(raw[1], opt.grid)];
    const guides: [Vec2, Vec2][] = [];
    let ax: Vec2 | null = null;
    let ay: Vec2 | null = null;
    for (const n of Object.values(floor.nodes)) {
        if (ex.has(n.id)) continue;
        if (!ax && Math.abs(raw[0] - n.x) < ALIGN_PX * opt.mpp) ax = [n.x, n.y];
        if (!ay && Math.abs(raw[1] - n.y) < ALIGN_PX * opt.mpp) ay = [n.x, n.y];
    }
    if (ax) p = [ax[0], p[1]];
    if (ay) p = [p[0], ay[1]];
    if (ax) guides.push([ax, p]);
    if (ay) guides.push([ay, p]);
    return { point: p, target: { kind: 'point', point: p }, kind: 'grid', guides };
}
