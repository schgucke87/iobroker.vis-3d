import type { DetectedRoom, Floor, Vec2 } from '../model/types';
import type { WallFrame } from './walls';
import { angleOf, interiorPoint, pointInPolygon, signedArea, sub } from './vec';

const MIN_ROOM_AREA = 0.25; // m²

/**
 * Detects rooms as the bounded faces of the planar wall graph.
 *
 * Every wall contributes two half-edges. Walking each half-edge u→v and
 * continuing with the outgoing edge at v that comes next clockwise from v→u
 * traces faces with their interior on the left. Bounded faces come out
 * counter-clockwise (positive area); the outer face of each connected
 * component comes out clockwise and is discarded.
 */
export function detectRooms(floor: Floor): DetectedRoom[] {
    const nodes = floor.nodes;
    // outgoing half-edges per node, sorted by angle (counter-clockwise)
    const out = new Map<string, { to: string; angle: number }[]>();
    for (const w of Object.values(floor.walls)) {
        const a = nodes[w.a];
        const b = nodes[w.b];
        if (!a || !b || w.a === w.b) continue;
        const ab = angleOf([b.x - a.x, b.y - a.y]);
        const ba = angleOf([a.x - b.x, a.y - b.y]);
        if (!out.has(w.a)) out.set(w.a, []);
        if (!out.has(w.b)) out.set(w.b, []);
        out.get(w.a)!.push({ to: w.b, angle: ab });
        out.get(w.b)!.push({ to: w.a, angle: ba });
    }
    for (const list of out.values()) list.sort((p, q) => p.angle - q.angle);

    const visited = new Set<string>();
    const key = (u: string, v: string) => `${u}>${v}`;
    const rooms: DetectedRoom[] = [];

    for (const [start, list] of out) {
        for (const first of list) {
            if (visited.has(key(start, first.to))) continue;
            const cycle: string[] = [];
            let u = start;
            let v = first.to;
            let guard = 0;
            while (!visited.has(key(u, v)) && guard++ < 100000) {
                visited.add(key(u, v));
                cycle.push(u);
                const outs = out.get(v)!;
                const back = outs.findIndex(e => e.to === u);
                // next clockwise from the reverse edge = previous in CCW-sorted order
                const next = outs[(back - 1 + outs.length) % outs.length];
                u = v;
                v = next.to;
            }
            const poly = removeSpikes(cycle.map(id => [nodes[id].x, nodes[id].y] as Vec2));
            if (poly.length < 3) continue;
            const area = signedArea(poly);
            if (area < MIN_ROOM_AREA) continue;
            rooms.push({ polygon: poly, area, centroid: interiorPoint(poly) });
        }
    }

    // match metadata by anchor point; each meta is used at most once
    const metas = Object.values(floor.rooms);
    const used = new Set<string>();
    // smaller rooms first, so an anchor inside a nested face prefers the tighter one
    const order = rooms.map((_, i) => i).sort((i, j) => rooms[i].area - rooms[j].area);
    for (const i of order) {
        const room = rooms[i];
        const meta = metas.find(m => !used.has(m.id) && pointInPolygon(m.anchor, room.polygon));
        if (meta) {
            used.add(meta.id);
            room.meta = meta;
            room.centroid = pointInPolygon(meta.anchor, room.polygon) ? meta.anchor : room.centroid;
        }
    }
    return rooms;
}

/** Removes back-and-forth spikes caused by dangling walls (…a, b, a…) and repeated points. */
function removeSpikes(poly: Vec2[]): Vec2[] {
    const same = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
    let pts = poly.slice();
    let changed = true;
    while (changed && pts.length >= 3) {
        changed = false;
        for (let i = 0; i < pts.length; i++) {
            const prev = pts[(i - 1 + pts.length) % pts.length];
            const cur = pts[i];
            const next = pts[(i + 1) % pts.length];
            if (same(prev, cur)) {
                pts.splice(i, 1);
                changed = true;
                break;
            }
            if (same(prev, next)) {
                // spike tip at cur: drop cur and one copy of the base point
                pts.splice(i, 1);
                pts.splice(i % pts.length, 1);
                changed = true;
                break;
            }
            // collinear vertex
            const d1 = sub(cur, prev);
            const d2 = sub(next, cur);
            if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-9 && d1[0] * d2[0] + d1[1] * d2[1] > 0) {
                pts.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return pts;
}

/**
 * The room on each side of every wall (null = outside). Probes a point just
 * in front of each face, at a few places along the wall so an opening in the
 * middle doesn't matter.
 */
export function wallSideRooms(frames: Record<string, WallFrame>, rooms: DetectedRoom[]): Record<string, { left: DetectedRoom | null; right: DetectedRoom | null }> {
    const result: Record<string, { left: DetectedRoom | null; right: DetectedRoom | null }> = {};
    for (const fr of Object.values(frames)) {
        const probe = (side: 1 | -1): DetectedRoom | null => {
            for (const k of [0.5, 0.25, 0.75]) {
                const u = fr.length * k;
                const d = fr.wall.thickness / 2 + 0.05;
                const p: Vec2 = [fr.start[0] + fr.dir[0] * u + fr.normal[0] * d * side, fr.start[1] + fr.dir[1] * u + fr.normal[1] * d * side];
                const hit = rooms.filter(r => pointInPolygon(p, r.polygon)).sort((a, b) => a.area - b.area)[0];
                if (hit) return hit;
            }
            return null;
        };
        result[fr.wall.id] = { left: probe(1), right: probe(-1) };
    }
    return result;
}
