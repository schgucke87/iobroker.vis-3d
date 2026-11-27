import type { Floor, Opening, Vec2, Wall } from '../model/types';
import { add, angleOf, dot, len, lineIntersection, normalize, perp, scale, sub } from './vec';

/**
 * Wall geometry in the wall's own coordinate frame: u runs along the wall
 * from node a (u = 0) to node b (u = length); the left side is the side of
 * the left normal of a→b.
 *
 * The u-coordinates of the four footprint corners include the mitre at each
 * junction, so they can lie before 0 or beyond `length` (outer corners) or
 * inside the wall (inner corners).
 */
export interface WallFrame {
    wall: Wall;
    start: Vec2;
    end: Vec2;
    dir: Vec2;
    normal: Vec2;
    length: number;
    uStartLeft: number;
    uStartRight: number;
    uEndLeft: number;
    uEndRight: number;
    /** Footprint polygon: startRight, endRight, endLeft, startLeft. */
    footprint: Vec2[];
}

export interface WallGeometry {
    frames: Record<string, WallFrame>;
    /** Polygons that fill the centre of junctions with three or more walls. */
    hubs: { nodeId: string; polygon: Vec2[]; height: number }[];
}

interface Incident {
    wall: Wall;
    away: Vec2;
    angle: number;
    half: number;
    atStart: boolean;
    left: Vec2;
    right: Vec2;
    tLeft: number;
    tRight: number;
}

export function computeWallGeometry(floor: Floor): WallGeometry {
    const nodes = floor.nodes;
    const incident = new Map<string, Incident[]>();

    for (const w of Object.values(floor.walls)) {
        const a = nodes[w.a];
        const b = nodes[w.b];
        if (!a || !b) continue;
        const d = normalize([b.x - a.x, b.y - a.y]);
        if (d[0] === 0 && d[1] === 0) continue;
        const push = (nodeId: string, away: Vec2, atStart: boolean) => {
            if (!incident.has(nodeId)) incident.set(nodeId, []);
            incident.get(nodeId)!.push({
                wall: w,
                away,
                angle: angleOf(away),
                half: w.thickness / 2,
                atStart,
                left: [0, 0],
                right: [0, 0],
                tLeft: 0,
                tRight: 0,
            });
        };
        push(w.a, d, true);
        push(w.b, [-d[0], -d[1]], false);
    }

    const hubs: WallGeometry['hubs'] = [];

    for (const [nodeId, list] of incident) {
        const n: Vec2 = [nodes[nodeId].x, nodes[nodeId].y];
        list.sort((p, q) => p.angle - q.angle);
        const k = list.length;
        const maxHalf = Math.max(...list.map(i => i.half));
        const limit = 4 * maxHalf;

        for (let idx = 0; idx < k; idx++) {
            const i = list[idx];
            const j = list[(idx + 1) % k]; // next counter-clockwise
            // left side of i (relative to its away direction) meets right side of j
            const pi = add(n, scale(perp(i.away), i.half));
            const pj = add(n, scale(perp(j.away), -j.half));
            let p = k > 1 && i !== j ? lineIntersection(pi, i.away, pj, j.away) : null;
            if (p) {
                const ti = dot(sub(p, n), i.away);
                const tj = dot(sub(p, n), j.away);
                if (Math.abs(ti) > limit || Math.abs(tj) > limit) p = null;
            }
            if (p) {
                i.tLeft = dot(sub(p, n), i.away);
                j.tRight = dot(sub(p, n), j.away);
                i.left = p;
                j.right = p;
            } else {
                // parallel (straight continuation), dead end or a very sharp angle: square end
                i.tLeft = 0;
                j.tRight = 0;
                i.left = pi;
                j.right = pj;
            }
        }

        if (k >= 3) {
            const polygon: Vec2[] = [];
            for (const i of list) {
                pushUnique(polygon, i.right);
                pushUnique(polygon, i.left);
            }
            if (polygon.length >= 3) {
                hubs.push({ nodeId, polygon, height: Math.max(...list.map(i => i.wall.height)) });
            }
        }
    }

    const frames: Record<string, WallFrame> = {};
    for (const w of Object.values(floor.walls)) {
        const a = nodes[w.a];
        const b = nodes[w.b];
        if (!a || !b) continue;
        const start: Vec2 = [a.x, a.y];
        const end: Vec2 = [b.x, b.y];
        const length = len(sub(end, start));
        if (length < 1e-9) continue;
        const dir = normalize(sub(end, start));
        const normal = perp(dir);
        const atA = incident.get(w.a)!.find(i => i.wall === w && i.atStart)!;
        const atB = incident.get(w.b)!.find(i => i.wall === w && !i.atStart)!;
        // at a, the away direction is dir: left is the wall's left side.
        // at b, the away direction is -dir: its left is the wall's right side.
        const uStartLeft = atA.tLeft;
        const uStartRight = atA.tRight;
        const uEndRight = length - atB.tLeft;
        const uEndLeft = length - atB.tRight;
        const h = w.thickness / 2;
        const at = (u: number, side: number): Vec2 => add(add(start, scale(dir, u)), scale(normal, side * h));
        frames[w.id] = {
            wall: w,
            start,
            end,
            dir,
            normal,
            length,
            uStartLeft,
            uStartRight,
            uEndLeft,
            uEndRight,
            footprint: [at(uStartRight, -1), at(uEndRight, -1), at(uEndLeft, 1), at(uStartLeft, 1)],
        };
    }

    return { frames, hubs };
}

function pushUnique(poly: Vec2[], p: Vec2) {
    const last = poly[poly.length - 1];
    const first = poly[0];
    const same = (q?: Vec2) => q && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9;
    if (!same(last) && !same(first)) poly.push(p);
}

/** Usable u-range along the wall where openings fit without touching the mitred ends. */
export function openingRange(frame: WallFrame): [number, number] {
    const margin = 0.05;
    const lo = Math.max(0, frame.uStartLeft, frame.uStartRight) + margin;
    const hi = Math.min(frame.length, frame.uEndLeft, frame.uEndRight) - margin;
    return [lo, hi];
}

/** Clamps an opening so it lies fully inside the wall (both along and vertically). */
export function clampOpening(o: Opening, frame: WallFrame): Opening {
    const [lo, hi] = openingRange(frame);
    const avail = Math.max(0.1, hi - lo);
    const width = Math.min(o.width, avail);
    const offset = Math.min(Math.max(o.offset, lo + width / 2), hi - width / 2);
    const maxTop = frame.wall.height - 0.05;
    const sill = Math.max(0, Math.min(o.sill, maxTop - 0.1));
    const height = Math.max(0.1, Math.min(o.height, maxTop - sill));
    return { ...o, width, offset, sill, height };
}

/** World plan position for a u-coordinate on the wall's centre line. */
export function pointOnWall(frame: WallFrame, u: number): Vec2 {
    return add(frame.start, scale(frame.dir, u));
}
