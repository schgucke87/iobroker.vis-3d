/**
 * Pure editing operations on a floor's wall graph. Each operation mutates the
 * floor it is given; the store passes in a fresh copy.
 */
import type { Floor, Opening, Vec2, Wall } from './types';
import { dist, projectOnSegment, segmentIntersection } from '../geometry/vec';

let counter = 0;
export function uid(prefix: string): string {
    counter = (counter + 1) % 1e6;
    return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Where a wall end attaches: an existing node, a point on an existing wall, or a free point. */
export type AttachTarget =
    | { kind: 'node'; nodeId: string }
    | { kind: 'wall'; wallId: string; point: Vec2 }
    | { kind: 'point'; point: Vec2 };

export interface WallDefaults {
    thickness: number;
    height: number;
}

const MERGE_DIST = 1e-4;

export function addNode(floor: Floor, p: Vec2): string {
    // reuse a node at the exact same position
    for (const n of Object.values(floor.nodes)) {
        if (dist([n.x, n.y], p) < MERGE_DIST) return n.id;
    }
    const id = uid('n');
    floor.nodes[id] = { id, x: p[0], y: p[1] };
    return id;
}

export function wallsAt(floor: Floor, nodeId: string): Wall[] {
    return Object.values(floor.walls).filter(w => w.a === nodeId || w.b === nodeId);
}

export function findWall(floor: Floor, a: string, b: string): Wall | undefined {
    return Object.values(floor.walls).find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

/** Splits a wall at the point closest to `p`; returns the new node id. Openings stay where they are. */
export function splitWall(floor: Floor, wallId: string, p: Vec2): string {
    const w = floor.walls[wallId];
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    const proj = projectOnSegment(p, [a.x, a.y], [b.x, b.y]);
    const l = dist([a.x, a.y], [b.x, b.y]);
    const u = proj.t * l;
    if (u < MERGE_DIST) return w.a;
    if (l - u < MERGE_DIST) return w.b;
    const nodeId = addNode(floor, proj.point);
    const first: Wall = { ...w, id: uid('w'), b: nodeId, openings: [] };
    const second: Wall = { ...w, id: uid('w'), a: nodeId, openings: [] };
    for (const o of w.openings) {
        if (o.offset < u) first.openings.push({ ...o });
        else second.openings.push({ ...o, offset: o.offset - u });
    }
    delete floor.walls[wallId];
    floor.walls[first.id] = first;
    floor.walls[second.id] = second;
    return nodeId;
}

export function resolveTarget(floor: Floor, t: AttachTarget): string {
    switch (t.kind) {
        case 'node':
            return t.nodeId;
        case 'wall':
            return floor.walls[t.wallId] ? splitWall(floor, t.wallId, t.point) : addNode(floor, t.point);
        case 'point': {
            // a free point that lies exactly on a wall still connects to it (T-junction)
            for (const n of Object.values(floor.nodes)) {
                if (dist([n.x, n.y], t.point) < MERGE_DIST) return n.id;
            }
            for (const w of Object.values(floor.walls)) {
                const a = floor.nodes[w.a];
                const b = floor.nodes[w.b];
                if (projectOnSegment(t.point, [a.x, a.y], [b.x, b.y]).distance < 1e-6) {
                    return splitWall(floor, w.id, t.point);
                }
            }
            return addNode(floor, t.point);
        }
    }
}

/**
 * Adds a wall between two targets. Existing walls crossed by the new wall are
 * split at the crossing, and the new wall is split there too, so the graph
 * stays planar and rooms are detected correctly. Returns the end node id.
 */
export function addWall(floor: Floor, from: AttachTarget, to: AttachTarget, defaults: WallDefaults): string {
    const startId = resolveTarget(floor, from);
    const endId = resolveTarget(floor, to);
    if (startId === endId) return endId;

    const s = floor.nodes[startId];
    const e = floor.nodes[endId];
    const A: Vec2 = [s.x, s.y];
    const B: Vec2 = [e.x, e.y];

    // crossings with existing walls
    const hits: { t: number; wallId: string; point: Vec2 }[] = [];
    for (const w of Object.values(floor.walls)) {
        if (w.a === startId || w.b === startId || w.a === endId || w.b === endId) continue;
        const na = floor.nodes[w.a];
        const nb = floor.nodes[w.b];
        const hit = segmentIntersection(A, B, [na.x, na.y], [nb.x, nb.y]);
        if (hit) hits.push({ t: hit.t, wallId: w.id, point: hit.point });
    }
    // existing nodes lying on the new segment
    const onNodes: { t: number; nodeId: string }[] = [];
    for (const n of Object.values(floor.nodes)) {
        if (n.id === startId || n.id === endId) continue;
        const proj = projectOnSegment([n.x, n.y], A, B);
        if (proj.distance < 1e-6 && proj.t > 1e-6 && proj.t < 1 - 1e-6) onNodes.push({ t: proj.t, nodeId: n.id });
    }

    const chain: { t: number; nodeId: string }[] = [
        ...hits.map(h => ({ t: h.t, nodeId: splitWall(floor, h.wallId, h.point) })),
        ...onNodes,
    ].sort((p, q) => p.t - q.t);

    const ids = [startId, ...chain.map(c => c.nodeId), endId];
    for (let i = 0; i + 1 < ids.length; i++) {
        const a = ids[i];
        const b = ids[i + 1];
        if (a === b || findWall(floor, a, b)) continue;
        const id = uid('w');
        floor.walls[id] = { id, a, b, thickness: defaults.thickness, height: defaults.height, openings: [] };
    }
    return endId;
}

export function deleteWall(floor: Floor, wallId: string) {
    const w = floor.walls[wallId];
    if (!w) return;
    delete floor.walls[wallId];
    removeOrphans(floor, [w.a, w.b]);
}

export function deleteNode(floor: Floor, nodeId: string) {
    const affected = new Set<string>();
    for (const w of wallsAt(floor, nodeId)) {
        delete floor.walls[w.id];
        affected.add(w.a);
        affected.add(w.b);
    }
    delete floor.nodes[nodeId];
    affected.delete(nodeId);
    removeOrphans(floor, [...affected]);
}

/** Removes nodes that no longer have any walls. */
export function removeOrphans(floor: Floor, nodeIds: string[]) {
    for (const id of nodeIds) {
        if (floor.nodes[id] && wallsAt(floor, id).length === 0) delete floor.nodes[id];
    }
}

/**
 * Moves a node. If it ends up on top of another node, the two are merged.
 * Returns the id of the surviving node.
 */
export function moveNode(floor: Floor, nodeId: string, p: Vec2, merge = false): string {
    const n = floor.nodes[nodeId];
    if (!n) return nodeId;
    n.x = p[0];
    n.y = p[1];
    if (!merge) return nodeId;
    const other = Object.values(floor.nodes).find(o => o.id !== nodeId && dist([o.x, o.y], p) < 0.01);
    if (!other) return nodeId;
    mergeNodes(floor, nodeId, other.id);
    return other.id;
}

/** Re-points every wall of `from` to `into` and deletes `from`. Collapsed or duplicate walls are removed. */
export function mergeNodes(floor: Floor, from: string, into: string) {
    for (const w of wallsAt(floor, from)) {
        if (w.a === from) w.a = into;
        if (w.b === from) w.b = into;
        if (w.a === w.b) {
            delete floor.walls[w.id];
            continue;
        }
        const dup = Object.values(floor.walls).find(
            o => o.id !== w.id && ((o.a === w.a && o.b === w.b) || (o.a === w.b && o.b === w.a)),
        );
        if (dup) delete floor.walls[w.id];
    }
    delete floor.nodes[from];
}

export function translateWall(floor: Floor, wallId: string, delta: Vec2, origin: Record<string, Vec2>) {
    const w = floor.walls[wallId];
    if (!w) return;
    for (const id of [w.a, w.b]) {
        const o = origin[id];
        if (o && floor.nodes[id]) {
            floor.nodes[id].x = o[0] + delta[0];
            floor.nodes[id].y = o[1] + delta[1];
        }
    }
}

export function addOpening(floor: Floor, wallId: string, opening: Omit<Opening, 'id'>): string | undefined {
    const w = floor.walls[wallId];
    if (!w) return undefined;
    const id = uid('o');
    w.openings.push({ ...opening, id });
    return id;
}

export const OPENING_PRESETS: Record<Opening['type'], Omit<Opening, 'id' | 'offset'>> = {
    door: { type: 'door', width: 0.885, height: 2.01, sill: 0 },
    window: { type: 'window', width: 1.26, height: 1.385, sill: 0.9 },
};
