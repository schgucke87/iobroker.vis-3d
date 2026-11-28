import { describe, expect, it } from 'vitest';
import type { Floor, Roof, Vec2 } from '../model/types';
import * as ops from '../model/ops';
import { roofFrame, roofHeightAt, roofPlanes, roofTop, wallTopProfile } from './roof';

const P = (point: Vec2) => ({ kind: 'point' as const, point });
/** A 10 × 6 m house (outer wall faces from −0.2 to 10.2 / −0.2 to 6.2 with 40 cm walls). */
function house(roof: Partial<Roof>): Floor {
    const f: Floor = { id: 'f', name: 'DG', height: 1.0, slab: 0.2, nodes: {}, walls: {}, rooms: {}, objects: {} };
    const d = { thickness: 0.4, height: 1.0 };
    const pts: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    for (let i = 0; i < 4; i++) ops.addWall(f, P(pts[i]), P(pts[(i + 1) % 4]), d);
    f.roof = { type: 'gable', pitch: 45, overhang: 0.5, ridge: 'auto', color: '#000', ...roof };
    return f;
}

describe('roofs', () => {
    it('gable: rests on the wall tops at the eaves and rises to the ridge in the middle', () => {
        const f = roofFrame(house({}))!;
        expect(f.alongX).toBe(true); // ridge along the longer side
        expect(roofHeightAt(f, [5, -0.2])).toBeCloseTo(1.0); // outer face of the eaves wall
        expect(roofHeightAt(f, [5, 3])).toBeCloseTo(1.0 + 3.2); // 45°: half the width (6.4 / 2)
        expect(roofTop(f)).toBeGreaterThan(4.2);
    });

    it('closes the gables: the end wall follows the roof up to the ridge', () => {
        const f = roofFrame(house({}))!;
        const prof = wallTopProfile(f, [0, 0], [0, 6]);
        // three points: both eaves and the ridge in the middle
        expect(prof.length).toBe(3);
        expect(prof[1][0]).toBeCloseTo(3);
        expect(prof[1][1]).toBeCloseTo(4.2);
        expect(prof[0][1]).toBeCloseTo(1.2); // centre line of the wall, 20 cm inside the outer face
    });

    it('caps interior walls at their own height under the slope', () => {
        const f = roofFrame(house({}))!;
        // an interior wall across the attic, 2.5 m high
        const prof = wallTopProfile(f, [5, 0], [5, 6], 2.5);
        expect(Math.max(...prof.map(p => p[1]))).toBeCloseTo(2.5);
        expect(prof.some(p => Math.abs(p[1] - 2.5) < 1e-9 && p[0] > 0.5 && p[0] < 3)).toBe(true);
        expect(prof[0][1]).toBeCloseTo(1.2);
    });

    it('hip: all four sides slope, the ridge is shorter than the house', () => {
        const f = roofFrame(house({ type: 'hip' }))!;
        expect(roofHeightAt(f, [0, 3])).toBeCloseTo(1.2); // end wall stays low
        expect(roofHeightAt(f, [5, 3])).toBeCloseTo(4.2);
        expect(roofPlanes(f).length).toBe(4);
    });

    it('shed and pyramid roofs', () => {
        const shed = roofFrame(house({ type: 'shed', pitch: 15 }))!;
        expect(roofHeightAt(shed, [5, -0.2])).toBeCloseTo(1.0);
        expect(roofHeightAt(shed, [5, 6.2])).toBeCloseTo(1.0 + Math.tan((15 * Math.PI) / 180) * 6.4);
        const flipped = roofFrame(house({ type: 'shed', pitch: 15, flip: true }))!;
        expect(roofHeightAt(flipped, [5, 6.2])).toBeCloseTo(1.0);
        const pyr = roofFrame(house({ type: 'pyramid' }))!;
        // all four planes meet at the centre
        expect(roofHeightAt(pyr, [5, 3])).toBeCloseTo(4.2);
        expect(roofHeightAt(pyr, [0, 3])).toBeLessThan(2);
    });

    it('overhangs continue the slope below the eaves', () => {
        const f = roofFrame(house({}))!;
        const ys = roofPlanes(f).flatMap(p => p.points.map(q => q[1]));
        expect(Math.min(...ys)).toBeCloseTo(1.0 - 0.5); // 45°, 50 cm overhang
    });
});

describe('roof mesh', () => {
    it('faces outwards: the top faces up, the underside down', async () => {
        const THREE = await import('three');
        const { buildRoofGeometry } = await import('./mesh');
        const f = roofFrame(house({}))!;
        const geo = buildRoofGeometry(roofPlanes(f), 0.2);
        const pos = geo.attributes.position;
        // the highest triangles (on top of the ridge) must face up
        const tops: number[] = [];
        for (let i = 0; i < pos.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, i);
            const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
            const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
            const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
            if (Math.abs(n.y) > 0.5) tops.push(n.y);
        }
        // as many faces up (top) as down (underside)
        expect(tops.filter(y => y > 0).length).toBe(tops.filter(y => y < 0).length);
        // the upper surface of each slab is above its underside: check one plane explicitly
        const plane = roofPlanes(f)[0];
        const g1 = buildRoofGeometry([plane], 0.2);
        const p = g1.attributes.position;
        const first = new THREE.Vector3().fromBufferAttribute(p, 0);
        const n1 = new THREE.Vector3().fromBufferAttribute(p, 1).sub(first).cross(new THREE.Vector3().fromBufferAttribute(p, 2).sub(first));
        expect(n1.y).toBeGreaterThan(0);
    });
});
