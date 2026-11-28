/**
 * Roof geometry. All roof types derive from one height function: the
 * underside of the roof rises with the pitch from the eaves, i.e. from the
 * outer faces of the walls, where it rests on the wall tops (the storey
 * height). Overhangs continue the slopes downwards.
 */
import type { Floor, Roof, RoofType, Vec2 } from '../model/types';
import { computeWallGeometry } from './walls';
import { segmentIntersection } from './vec';

export const ROOF_TYPES: Record<RoofType, string> = {
    gable: 'Satteldach',
    hip: 'Walmdach',
    shed: 'Pultdach',
    pyramid: 'Zeltdach',
    flat: 'Flachdach',
};

export const DEFAULT_ROOF: Roof = { type: 'gable', pitch: 40, overhang: 0.5, ridge: 'auto', color: '#8e4636' };

export const ROOF_THICKNESS = 0.22;

/** The roof's frame: the outer face rectangle of the storey's walls, with u along the ridge. */
export interface RoofFrame {
    roof: Roof;
    /** Wall top (eaves height) above the storey's floor. */
    base: number;
    /** true: u = plan x, v = plan y; false: u = plan y, v = plan x. */
    alongX: boolean;
    u0: number;
    u1: number;
    v0: number;
    v1: number;
    tan: number;
    /** Extra slope factor for the end planes of a pyramid roof (so all four meet in one point). */
    tanEnds: number;
}

export function roofFrame(floor: Floor): RoofFrame | null {
    const roof = floor.roof;
    if (!roof) return null;
    const frames = Object.values(computeWallGeometry(floor).frames);
    if (!frames.length) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const fr of frames) {
        for (const [x, y] of fr.footprint) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }
    const w = maxX - minX;
    const d = maxY - minY;
    // hip and pyramid roofs are symmetric: their ridge always runs along the longer side
    const auto = roof.ridge === 'auto' || roof.type === 'hip' || roof.type === 'pyramid';
    const alongX = auto ? w >= d : roof.ridge === 'x';
    const [u0, u1, v0, v1] = alongX ? [minX, maxX, minY, maxY] : [minY, maxY, minX, maxX];
    const tan = roof.type === 'flat' ? 0 : Math.tan((Math.min(Math.max(roof.pitch, 0), 75) * Math.PI) / 180);
    const len = u1 - u0;
    const wid = v1 - v0;
    return { roof, base: floor.height, alongX, u0, u1, v0, v1, tan, tanEnds: len > 0 ? (tan * wid) / len : tan };
}

const toUV = (f: RoofFrame, [x, y]: Vec2): Vec2 => (f.alongX ? [x, y] : [y, x]);
const toXY = (f: RoofFrame, [u, v]: Vec2): Vec2 => (f.alongX ? [u, v] : [v, u]);

/** Height of the roof's underside above the storey's floor at a plan point. */
export function roofHeightAt(f: RoofFrame, p: Vec2): number {
    const [u, v] = toUV(f, p);
    const dv0 = v - f.v0;
    const dv1 = f.v1 - v;
    const du0 = u - f.u0;
    const du1 = f.u1 - u;
    let d: number;
    switch (f.roof.type) {
        case 'flat':
            return f.base;
        case 'shed':
            return f.base + f.tan * (f.roof.flip ? dv1 : dv0);
        case 'gable':
            d = Math.min(dv0, dv1);
            return f.base + f.tan * d;
        case 'hip':
            d = Math.min(dv0, dv1, du0, du1);
            return f.base + f.tan * d;
        case 'pyramid':
            return f.base + Math.min(f.tan * Math.min(dv0, dv1), f.tanEnds * Math.min(du0, du1));
    }
}

/** Height of the ridge (or the highest point) above the storey's floor. */
export function roofTop(f: RoofFrame): number {
    const wid = f.v1 - f.v0;
    switch (f.roof.type) {
        case 'flat':
            return f.base + ROOF_THICKNESS;
        case 'shed':
            return f.base + f.tan * wid + ROOF_THICKNESS;
        case 'hip':
        default:
            return f.base + (f.tan * wid) / 2 + ROOF_THICKNESS;
    }
}

/** Lines where roof planes meet (ridge, hips), in plan coordinates: the height function has kinks there. */
export function roofCreases(f: RoofFrame): [Vec2, Vec2][] {
    const o = f.roof.overhang;
    const U0 = f.u0 - o;
    const U1 = f.u1 + o;
    const V0 = f.v0 - o;
    const V1 = f.v1 + o;
    const vm = (f.v0 + f.v1) / 2;
    const half = (f.v1 - f.v0) / 2;
    const seg = (a: Vec2, b: Vec2): [Vec2, Vec2] => [toXY(f, a), toXY(f, b)];
    switch (f.roof.type) {
        case 'gable':
            return [seg([U0, vm], [U1, vm])];
        case 'hip': {
            const rs: Vec2 = [f.u0 + half, vm];
            const re: Vec2 = [f.u1 - half, vm];
            return [seg(rs, re), seg([U0, V0], rs), seg([U0, V1], rs), seg([U1, V0], re), seg([U1, V1], re)];
        }
        case 'pyramid':
            return [seg([U0, V0], [U1, V1]), seg([U0, V1], [U1, V0])];
        default:
            return [];
    }
}

/**
 * The top edge of a wall under the roof, as (u, height) points along the
 * wall from u = 0 to u = length: exact at the kinks (ridge and hip lines).
 * `limit` caps it (interior walls keep their own height below the roof).
 */
export function wallTopProfile(f: RoofFrame, start: Vec2, end: Vec2, limit = Infinity): [number, number][] {
    const L = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const ts = new Set<number>([0, 1]);
    for (const [a, b] of roofCreases(f)) {
        const hit = segmentIntersection(start, end, a, b, 1e-9);
        if (hit) ts.add(hit.t);
    }
    const at = (t: number): Vec2 => [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    const sorted = [...ts].sort((a, b) => a - b);
    const pts: [number, number][] = sorted.map(t => [t * L, roofHeightAt(f, at(t))]);
    if (!Number.isFinite(limit)) return pts;
    // cap at the limit, inserting the points where the profile crosses it
    const capped: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
        const [u, h] = pts[i];
        if (i > 0) {
            const [pu, ph] = pts[i - 1];
            if ((ph - limit) * (h - limit) < 0) {
                const k = (limit - ph) / (h - ph);
                capped.push([pu + (u - pu) * k, limit]);
            }
        }
        capped.push([u, Math.min(h, limit)]);
    }
    return capped;
}

/**
 * The roof surfaces as polygons (underside, in plan coordinates with
 * heights), one per roof plane, including the overhang.
 */
export function roofPlanes(f: RoofFrame): { points: [number, number, number][] }[] {
    const o = f.roof.overhang;
    const U0 = f.u0 - o;
    const U1 = f.u1 + o;
    const V0 = f.v0 - o;
    const V1 = f.v1 + o;
    const vm = (f.v0 + f.v1) / 2;
    const um = (f.u0 + f.u1) / 2;
    const half = (f.v1 - f.v0) / 2;
    const P = (u: number, v: number): [number, number, number] => {
        const [x, y] = toXY(f, [u, v]);
        // heights in the overhang continue the slope below the eaves
        let h: number;
        switch (f.roof.type) {
            case 'flat':
                h = f.base;
                break;
            case 'shed':
                h = f.base + f.tan * (f.roof.flip ? f.v1 - v : v - f.v0);
                break;
            default:
                h = roofHeightAtExtended(f, u, v);
        }
        return [x, h, y];
    };
    switch (f.roof.type) {
        case 'flat':
        case 'shed':
            return [{ points: [P(U0, V0), P(U1, V0), P(U1, V1), P(U0, V1)] }];
        case 'gable':
            return [{ points: [P(U0, V0), P(U1, V0), P(U1, vm), P(U0, vm)] }, { points: [P(U0, vm), P(U1, vm), P(U1, V1), P(U0, V1)] }];
        case 'hip': {
            const rs = f.u0 + half;
            const re = f.u1 - half;
            return [
                { points: [P(U0, V0), P(U1, V0), P(re, vm), P(rs, vm)] },
                { points: [P(rs, vm), P(re, vm), P(U1, V1), P(U0, V1)] },
                { points: [P(U0, V0), P(rs, vm), P(U0, V1)] },
                { points: [P(U1, V0), P(U1, V1), P(re, vm)] },
            ];
        }
        case 'pyramid': {
            const apex = P(um, vm);
            return [
                { points: [P(U0, V0), P(U1, V0), apex] },
                { points: [P(U1, V0), P(U1, V1), apex] },
                { points: [P(U1, V1), P(U0, V1), apex] },
                { points: [P(U0, V1), P(U0, V0), apex] },
            ];
        }
    }
}

/** Like roofHeightAt, but continuing the slopes outside the walls (for the overhang). */
function roofHeightAtExtended(f: RoofFrame, u: number, v: number): number {
    const dv0 = v - f.v0;
    const dv1 = f.v1 - v;
    const du0 = u - f.u0;
    const du1 = f.u1 - u;
    switch (f.roof.type) {
        case 'gable':
            return f.base + f.tan * Math.min(dv0, dv1);
        case 'hip':
            return f.base + f.tan * Math.min(dv0, dv1, du0, du1);
        case 'pyramid':
            return f.base + Math.min(f.tan * Math.min(dv0, dv1), f.tanEnds * Math.min(du0, du1));
        default:
            return f.base;
    }
}

/** Outline of the roof including the overhang, in plan coordinates. */
export function roofOutline(f: RoofFrame): Vec2[] {
    const o = f.roof.overhang;
    return [
        toXY(f, [f.u0 - o, f.v0 - o]),
        toXY(f, [f.u1 + o, f.v0 - o]),
        toXY(f, [f.u1 + o, f.v1 + o]),
        toXY(f, [f.u0 - o, f.v1 + o]),
    ];
}
