import { describe, expect, it } from 'vitest';
import { floorElevations, newFloor } from './store';
import type { Project, Vec2 } from './types';
import * as ops from './ops';
import { detectRooms } from '../geometry/rooms';
import { computeWallGeometry } from '../geometry/walls';

describe('storeys, basement and garden', () => {
    it('keeps the ground floor at 0 with a basement below and a garden aside', () => {
        const cellar = { ...newFloor('Keller'), kind: 'basement' as const, height: 2.3 };
        const eg = { ...newFloor('EG'), height: 2.6, slab: 0.2 };
        const og = { ...newFloor('OG'), height: 2.5, slab: 0.25 };
        const garden = { ...newFloor('Garten'), kind: 'outdoor' as const, slab: 0.25 };
        const p: Project = { version: 1, name: 't', floors: [cellar, eg, og, garden], assets: {} };
        const [c, e, o, g] = floorElevations(p);
        expect(e).toBe(0);
        expect(c).toBeCloseTo(-(2.3 + 0.2)); // basement height + ground floor slab
        expect(o).toBeCloseTo(2.6 + 0.25);
        expect(g).toBe(0);
    });

    it('turns closed boundaries into areas (rooms) without any wall bodies', () => {
        const garden = { ...newFloor('Garten'), kind: 'outdoor' as const };
        const P = (point: Vec2) => ({ kind: 'point' as const, point });
        const b = { thickness: 0.05, height: 0, boundary: true };
        // two terraces side by side
        const pts: Vec2[] = [[0, 0], [4, 0], [4, 3], [0, 3]];
        for (let i = 0; i < 4; i++) ops.addWall(garden, P(pts[i]), P(pts[(i + 1) % 4]), b);
        ops.addWall(garden, P([2, 0]), P([2, 3]), b);
        expect(detectRooms(garden).map(r => r.area).sort()).toEqual([6, 6]);
        // nothing is built in 3D
        expect(Object.keys(computeWallGeometry(garden).frames)).toHaveLength(0);
        expect(Object.values(garden.walls).every(w => w.boundary)).toBe(true);
    });
});
