import { describe, expect, it } from 'vitest';
import { detectWalls, roundThickness, type GrayImage } from './wallDetect';
import { addProposedWalls } from './wallProposals';
import { detectRooms } from '../geometry/rooms';
import type { Floor } from '../model/types';

/** A synthetic plan, 50 px per metre: a 6 × 4 m house, hatched 30 cm outer walls, one window, a hatched 12 cm inner wall. */
function drawPlan(): GrayImage {
    const ppm = 50;
    const W = 8 * ppm;
    const H = 6 * ppm;
    const data = new Uint8Array(W * H).fill(255);
    const ink = (x: number, y: number) => {
        if (x >= 0 && y >= 0 && x < W && y < H) data[Math.round(y) * W + Math.round(x)] = 0;
    };
    const lineH = (y: number, x0: number, x1: number) => {
        for (let x = x0; x <= x1; x++) for (let k = 0; k < 2; k++) ink(x, y + k);
    };
    const lineV = (x: number, y0: number, y1: number) => {
        for (let y = y0; y <= y1; y++) for (let k = 0; k < 2; k++) ink(x + k, y);
    };
    /** hatched rectangle (diagonal strokes every 6 px) with outlines */
    const wall = (x0: number, y0: number, x1: number, y1: number, skip?: [number, number]) => {
        lineH(y0, x0, x1);
        lineH(y1, x0, x1);
        lineV(x0, y0, y1);
        lineV(x1, y0, y1);
        for (let d = -(y1 - y0); d < x1 - x0; d += 6) {
            for (let t = 0; t <= y1 - y0; t++) {
                const x = x0 + d + t;
                if (x > x0 && x < x1 && !(skip && x >= skip[0] && x <= skip[1])) ink(x, y0 + t);
            }
        }
    };
    const o = ppm; // 1 m margin
    const T = 0.3 * ppm;
    // top wall with a window gap (1.2 m) drawn as a middle line
    wall(o, o, o + 6 * ppm, o + T, [o + 2 * ppm, o + 3.2 * ppm]);
    for (let x = o + 2 * ppm; x <= o + 3.2 * ppm; x++) for (let y = o + 1; y < o + T; y++) data[y * W + x] = 255;
    lineH(o + T / 2, o + 2 * ppm, o + 3.2 * ppm);
    wall(o, o + 4 * ppm - T, o + 6 * ppm, o + 4 * ppm);
    wall(o, o, o + T, o + 4 * ppm);
    wall(o + 6 * ppm - T, o, o + 6 * ppm, o + 4 * ppm);
    // inner wall at x = 3.5 m, 12 cm
    wall(o + 3.5 * ppm, o + T, o + 3.5 * ppm + 6, o + 4 * ppm - T);
    // some text-like clutter and a dimension line
    for (let i = 0; i < 6; i++) for (let y = 0; y < 8; y++) ink(o + ppm + i * 5, o + 2 * ppm + y);
    lineH(o + 4 * ppm + 20, o, o + 6 * ppm);
    return { width: W, height: H, data };
}

describe('wall detection', () => {
    const mpp = 1 / 50;
    const walls = detectWalls(drawPlan(), { mpp });
    const m = (px: number) => px * mpp;

    it('finds the outer walls with their thickness and the inner wall', () => {
        const thick = walls.filter(w => m(w.thickness) > 0.2);
        const thin = walls.filter(w => m(w.thickness) <= 0.2);
        expect(thick).toHaveLength(4);
        expect(thick.every(w => Math.abs(m(w.thickness) - 0.3) < 0.05)).toBe(true);
        expect(thin).toHaveLength(1);
        expect(roundThickness(m(thin[0].thickness))).toBeCloseTo(0.115, 2);
    });

    it('finds the window in the top wall', () => {
        const windows = walls.flatMap(w => w.openings).filter(o => o.type === 'window');
        expect(windows).toHaveLength(1);
        expect(m(windows[0].to - windows[0].from)).toBeCloseTo(1.2, 0);
    });

    it('builds connected walls that enclose two rooms', () => {
        const floor: Floor = { id: 'f', name: 'EG', height: 2.5, slab: 0.2, nodes: {}, walls: {}, rooms: {}, objects: {} };
        addProposedWalls(
            floor,
            walls.map(w => ({ a: [m(w.a[0]), m(w.a[1])], b: [m(w.b[0]), m(w.b[1])], thickness: roundThickness(m(w.thickness)), openings: w.openings.map(o => ({ type: o.type, from: m(o.from), to: m(o.to) })) })),
        );
        const rooms = detectRooms(floor);
        expect(rooms).toHaveLength(2);
        const areas = rooms.map(r => r.area).sort((a, b) => a - b);
        // centre-line areas: 3.35 × 3.7 and 2.35 × 3.7 (walls 30 cm, inner wall at 3.5 m)
        expect(areas[0]).toBeGreaterThan(7.5);
        expect(areas[1]).toBeGreaterThan(11);
        expect(Object.values(floor.walls).flatMap(w => w.openings).filter(o => o.type === 'window')).toHaveLength(1);
    });
});
