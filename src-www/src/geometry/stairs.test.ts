import { describe, expect, it } from 'vitest';
import { defaultStair, parseStairId, stairAssetId, stairMeta, stairTreadOutlines, type StairType } from './stairs';
import { stairOpenings } from '../model/stairOpenings';
import type { Floor, Project } from '../model/types';

describe('stairs', () => {
    it('round-trips its parameters through the asset id', () => {
        const p = defaultStair('half', 2.8);
        expect(parseStairId(stairAssetId(p))).toEqual(p);
    });

    it('a straight stair is as long as its treads and as high as the storey', () => {
        const p = defaultStair('straight', 2.8); // 16 risers, 15 treads of 27 cm
        expect(p.steps).toBe(16);
        const m = stairMeta(stairAssetId(p))!;
        // treads plus nosing, stringer ends and handrail overhang
        expect(m.size[2]).toBeGreaterThan(15 * 0.27);
        expect(m.size[2]).toBeLessThan(15 * 0.27 + 0.25);
        expect(m.size[0]).toBeGreaterThan(1.0);
        expect(m.size[0]).toBeLessThan(1.2);
        expect(stairTreadOutlines(stairAssetId(p))).toHaveLength(15);
    });

    it('builds every type', () => {
        for (const t of ['straight', 'quarterLeft', 'quarterRight', 'half', 'spiral', 'loft'] as StairType[]) {
            const m = stairMeta(stairAssetId(defaultStair(t, 2.7)))!;
            expect(m.size.every(v => v > 0.3 && v < 6)).toBe(true);
        }
        // the U stair is about twice as wide as a flight
        expect(stairMeta(stairAssetId(defaultStair('half', 2.7)))!.size[0]).toBeGreaterThan(2);
    });

    it('cuts an opening into the storey it leads to', () => {
        const fl = (id: string, extra: Partial<Floor> = {}): Floor => ({ id, name: id, height: 2.6, slab: 0.2, nodes: {}, walls: {}, rooms: {}, objects: {}, ...extra });
        const stair = { id: 's', assetId: stairAssetId(defaultStair('straight', 2.8)), x: 2, y: 3, elevation: 0, rotation: 0, scale: [1, 1, 1] as [number, number, number] };
        const project: Project = { version: 1, name: 't', assets: {}, floors: [fl('eg', { objects: { s: stair } }), fl('og')] };
        const holes = stairOpenings(project, [0, 2.8]);
        expect(holes[0]).toHaveLength(0);
        expect(holes[1]).toHaveLength(1);
        const xs = holes[1][0].map(p => p[0]);
        expect(Math.min(...xs)).toBeLessThan(2);
        expect(Math.max(...xs)).toBeGreaterThan(2);
    });
});
