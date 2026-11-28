import { describe, expect, it } from 'vitest';
import { signedArea, subtractConvex } from './clip';
import type { Vec2 } from '../model/types';

const area = (ps: Vec2[][]) => ps.reduce((s, p) => s + Math.abs(signedArea(p)), 0);

describe('polygon minus convex', () => {
    const room: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]];
    it('cuts a hole inside', () => expect(area(subtractConvex(room, [[1, 1], [2, 1], [2, 3], [1, 3]]))).toBeCloseTo(20 - 2));
    it('cuts a hole at the edge', () => expect(area(subtractConvex(room, [[4, 1], [6, 1], [6, 2], [4, 2]]))).toBeCloseTo(20 - 1));
    it('leaves a polygon alone that the hole misses', () => expect(area(subtractConvex(room, [[7, 1], [8, 1], [8, 2], [7, 2]]))).toBeCloseTo(20));
    it('works with an L-shaped room and clockwise holes', () => {
        const l: Vec2[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
        expect(area(subtractConvex(l, [[1, 3], [1, 1], [3, 1], [3, 3]]))).toBeCloseTo(12 - 3);
    });
});
