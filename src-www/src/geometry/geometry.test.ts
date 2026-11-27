import { describe, expect, it } from 'vitest';
import type { Floor, Vec2 } from '../model/types';
import * as ops from '../model/ops';
import { detectRooms } from './rooms';
import { computeWallGeometry, openingRange } from './walls';
import { demoProject } from '../model/demo';

const D = { thickness: 0.2, height: 2.5 };

function floor(): Floor {
    return { id: 'f', name: 'T', height: 2.5, slab: 0.2, nodes: {}, walls: {}, rooms: {} };
}
const P = (point: Vec2) => ({ kind: 'point' as const, point });

function rect(f: Floor, w: number, h: number) {
    ops.addWall(f, P([0, 0]), P([w, 0]), D);
    ops.addWall(f, P([w, 0]), P([w, h]), D);
    ops.addWall(f, P([w, h]), P([0, h]), D);
    ops.addWall(f, P([0, h]), P([0, 0]), D);
}

describe('room detection', () => {
    it('finds a single rectangular room', () => {
        const f = floor();
        rect(f, 4, 3);
        const rooms = detectRooms(f);
        expect(rooms).toHaveLength(1);
        expect(rooms[0].area).toBeCloseTo(12);
    });

    it('splits a room with a wall drawn across it (T-junctions connect)', () => {
        const f = floor();
        rect(f, 4, 3);
        ops.addWall(f, P([2, 0]), P([2, 3]), D);
        const rooms = detectRooms(f).map(r => r.area).sort();
        expect(rooms).toEqual([6, 6]);
    });

    it('splits crossing walls into four rooms', () => {
        const f = floor();
        rect(f, 4, 4);
        ops.addWall(f, P([2, -1]), P([2, 5]), D);
        ops.addWall(f, P([-1, 2]), P([5, 2]), D);
        const rooms = detectRooms(f);
        expect(rooms).toHaveLength(4);
        rooms.forEach(r => expect(r.area).toBeCloseTo(4));
    });

    it('ignores dangling walls inside a room', () => {
        const f = floor();
        rect(f, 4, 3);
        ops.addWall(f, P([0, 1.5]), P([2, 1.5]), D);
        const rooms = detectRooms(f);
        expect(rooms).toHaveLength(1);
        expect(rooms[0].area).toBeCloseTo(12);
        expect(rooms[0].polygon).toHaveLength(4);
    });

    it('keeps room names when walls move', () => {
        const f = floor();
        rect(f, 4, 3);
        f.rooms.r1 = { id: 'r1', name: 'Küche', anchor: [1, 1] };
        const n = Object.values(f.nodes).find(n => n.x === 4 && n.y === 3)!;
        ops.moveNode(f, n.id, [5, 4]);
        expect(detectRooms(f)[0].meta?.name).toBe('Küche');
    });

    it('detects the rooms of the demo house', () => {
        const p = demoProject();
        expect(detectRooms(p.floors[0]).filter(r => r.meta)).toHaveLength(5);
        expect(detectRooms(p.floors[1]).filter(r => r.meta)).toHaveLength(4);
    });
});

describe('wall mitres', () => {
    it('mitres the corners of a rectangle', () => {
        const f = floor();
        rect(f, 4, 3);
        const g = computeWallGeometry(f);
        const bottom = Object.values(g.frames).find(fr => fr.start[1] === 0 && fr.end[1] === 0)!;
        // wall (0,0)->(4,0): left normal points to +y (inside), right side is outside
        expect(bottom.uStartLeft).toBeCloseTo(0.1);
        expect(bottom.uStartRight).toBeCloseTo(-0.1);
        expect(bottom.uEndLeft).toBeCloseTo(3.9);
        expect(bottom.uEndRight).toBeCloseTo(4.1);
        expect(g.hubs).toHaveLength(0);
    });

    it('fills T-junctions with a hub polygon', () => {
        const f = floor();
        rect(f, 4, 3);
        ops.addWall(f, P([2, 0]), P([2, 3]), D);
        const g = computeWallGeometry(f);
        expect(g.hubs).toHaveLength(2);
        g.hubs.forEach(h => expect(h.polygon).toHaveLength(3));
    });

    it('keeps openings clear of the mitred ends', () => {
        const f = floor();
        rect(f, 4, 3);
        const g = computeWallGeometry(f);
        const fr = Object.values(g.frames)[0];
        const [lo, hi] = openingRange(fr);
        expect(lo).toBeCloseTo(0.15);
        expect(hi).toBeCloseTo(fr.length - 0.15);
    });
});

describe('editing', () => {
    it('splitting a wall keeps openings in place', () => {
        const f = floor();
        ops.addWall(f, P([0, 0]), P([6, 0]), D);
        const w = Object.values(f.walls)[0];
        ops.addOpening(f, w.id, { type: 'window', offset: 4.5, width: 1, height: 1, sill: 1 });
        ops.addWall(f, P([3, 0]), P([3, 3]), D);
        const right = Object.values(f.walls).find(x => x.openings.length)!;
        expect(f.nodes[right.a].x).toBe(3);
        expect(right.openings[0].offset).toBeCloseTo(1.5);
    });

    it('merges nodes dropped onto each other', () => {
        const f = floor();
        ops.addWall(f, P([0, 0]), P([2, 0]), D);
        ops.addWall(f, P([2, 1]), P([0, 1]), D);
        const n = Object.values(f.nodes).find(n => n.x === 2 && n.y === 1)!;
        ops.moveNode(f, n.id, [2, 0], true);
        expect(Object.keys(f.nodes)).toHaveLength(3);
        expect(Object.keys(f.walls)).toHaveLength(2);
    });
});
