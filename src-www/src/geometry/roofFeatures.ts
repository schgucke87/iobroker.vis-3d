/**
 * Roof windows and dormers: where they sit on the roof and the shapes of a
 * dormer, in a local frame: x along the eaves, y up, z up the slope
 * (horizontally), origin at the feature's plan position.
 */
import type { Roof, RoofFeature, Vec2 } from '../model/types';
import { roofHeightAt, ROOF_THICKNESS, type RoofFrame } from './roof';
import { uid } from '../model/ops';

export interface RoofPoint {
    /** Height of the roof's underside. */
    height: number;
    /** Height of the roof's top surface. */
    top: number;
    /** Slope (rise per metre) of the plane there. */
    tan: number;
    /** Down the slope, in the plan (unit vector); [0, 1] on flat roofs. */
    downhill: Vec2;
}

/** The roof plane at a plan point (from the height function's gradient). */
export function roofPointAt(f: RoofFrame, p: Vec2): RoofPoint {
    const e = 0.01;
    const h = (q: Vec2) => roofHeightAt(f, q);
    const gx = (h([p[0] + e, p[1]]) - h([p[0] - e, p[1]])) / (2 * e);
    const gy = (h([p[0], p[1] + e]) - h([p[0], p[1] - e])) / (2 * e);
    const tan = Math.hypot(gx, gy);
    const downhill: Vec2 = tan > 1e-6 ? [-gx / tan, -gy / tan] : [0, 1];
    const height = h(p);
    return { height, top: height + ROOF_THICKNESS * Math.sqrt(1 + tan * tan), tan, downhill };
}

/** Pitch of the dormer's own roof. */
export const DORMER_SHED_PITCH = 12;
export const DORMER_GABLE_PITCH = 40;

export interface DormerShape {
    /** How far the dormer reaches up the slope until its roof meets the main roof. */
    depth: number;
    /** Front wall outline (x, y) in the local frame, z = 0. */
    front: [number, number][];
    /** Window opening in the front wall: [x0, y0, x1, y1]. */
    window: [number, number, number, number];
    /** Side walls as polygons [x, y, z]. */
    cheeks: [number, number, number][][];
    /** Dormer roof planes (underside) as polygons [x, y, z]. */
    roof: [number, number, number][][];
}

/**
 * Geometry of a dormer at a roof point (heights relative to the storey floor).
 * The dormer body starts inside the roof slab and reaches up the slope until
 * its roof disappears in the main roof.
 */
export function dormerShape(rp: RoofPoint, d: RoofFeature): DormerShape | null {
    const w = d.width;
    const hf = d.frontHeight ?? 1.3;
    const y0 = rp.height; // inside the main roof slab
    const yTop0 = rp.top; // main roof surface at the front
    const y1 = yTop0 + hf; // eaves of the dormer
    const tanMain = rp.tan;
    if (tanMain < 0.05) return null; // no dormers on flat roofs
    const ov = 0.15;
    const half = w / 2;
    if ((d.dormerRoof ?? 'shed') === 'shed') {
        const tan2 = Math.tan((DORMER_SHED_PITCH * Math.PI) / 180);
        if (tanMain <= tan2) return null;
        const depth = (y1 - yTop0) / (tanMain - tan2);
        const yR = (z: number) => y1 + tan2 * z;
        const cheek = (x: number): [number, number, number][] => [
            [x, y0, 0],
            [x, y1, 0],
            [x, yR(depth), depth],
            [x, y0 + tanMain * depth, depth],
        ];
        return {
            depth,
            front: [
                [-half, y0],
                [half, y0],
                [half, y1],
                [-half, y1],
            ],
            window: [-half + 0.15, yTop0 + 0.12, half - 0.15, y1 - 0.12],
            cheeks: [cheek(-half), cheek(half)],
            roof: [
                [
                    [-half - ov, yR(-ov), -ov],
                    [half + ov, yR(-ov), -ov],
                    [half + ov, yR(depth), depth],
                    [-half - ov, yR(depth), depth],
                ],
            ],
        };
    }
    // gable dormer: ridge up the slope, its two roof planes meet the main roof
    const tanG = Math.tan((DORMER_GABLE_PITCH * Math.PI) / 180);
    const yRidge = y1 + tanG * half;
    const zEaves = (y1 - yTop0) / tanMain;
    const zRidge = (yRidge - yTop0) / tanMain;
    const cheek = (x: number): [number, number, number][] => [
        [x, y0, 0],
        [x, y1, 0],
        [x, y1, zEaves],
        [x, y0 + tanMain * zEaves, zEaves],
    ];
    const eaveDrop = tanG * 0.1;
    return {
        depth: zRidge,
        front: [
            [-half, y0],
            [half, y0],
            [half, y1],
            [0, yRidge],
            [-half, y1],
        ],
        window: [-half + 0.15, yTop0 + 0.12, half - 0.15, y1 - 0.05],
        cheeks: [cheek(-half), cheek(half)],
        roof: [
            [
                [-half - 0.1, y1 - eaveDrop, -ov],
                [0, yRidge, -ov],
                [0, yRidge, zRidge],
                [-half - 0.1, y1 - eaveDrop, zEaves],
            ],
            [
                [0, yRidge, -ov],
                [half + 0.1, y1 - eaveDrop, -ov],
                [half + 0.1, y1 - eaveDrop, zEaves],
                [0, yRidge, zRidge],
            ],
        ],
    };
}

/** Footprint of a feature in the plan (for drawing and picking in 2D). */
export function featureFootprint(f: RoofFrame, feat: RoofFeature): Vec2[] {
    const rp = roofPointAt(f, [feat.x, feat.y]);
    const down = rp.downhill;
    const along: Vec2 = [-down[1], down[0]];
    const half = feat.width / 2;
    let back: number;
    let front: number;
    if (feat.type === 'window') {
        // the window's length lies on the slope: its plan extent is shorter
        const l = (feat.length ?? 1.2) / Math.sqrt(1 + rp.tan * rp.tan);
        back = l / 2;
        front = l / 2;
    } else {
        back = dormerShape(rp, feat)?.depth ?? 1;
        front = 0;
    }
    const P = (s: number, t: number): Vec2 => [feat.x + along[0] * s - down[0] * t, feat.y + along[1] * s - down[1] * t];
    return [P(-half, -front), P(half, -front), P(half, back), P(-half, back)];
}

/** A new roof window or dormer on the roof plane facing the plan's "down" side (or the first one). */
export function newRoofFeature(f: RoofFrame, roof: Roof, type: RoofFeature['type']): RoofFeature {
    const width = type === 'window' ? 0.78 : 1.6;
    // line up next to the features already on this side: right of the rightmost one, else from the left
    const side = (feat: RoofFeature) => (f.alongX ? feat.y : feat.x) > (f.v0 + f.v1) / 2;
    const taken = (roof.features ?? []).filter(side).map(feat => (f.alongX ? feat.x : feat.y) + feat.width / 2);
    const start = taken.length ? Math.max(...taken) + 0.8 : f.u0 + 1.2;
    const uMid = Math.min(start + width / 2, f.u1 - width / 2 - 0.5);
    // on the side of the larger v, a bit up from the eaves
    const v = type === 'dormer' ? f.v1 - 1.0 : f.v1 - Math.min(1.8, (f.v1 - f.v0) / 4);
    const [x, y] = f.alongX ? [uMid, v] : [v, uMid];
    return type === 'window'
        ? { id: uid('rf'), type, x, y, width, length: 1.18 }
        : { id: uid('rf'), type, x, y, width, frontHeight: 1.3, dormerRoof: 'shed' };
}
