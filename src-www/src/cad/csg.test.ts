import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { docToObject, dropToFloor, fuseShapes, groupShapes, newShape, shapeBox, ungroupShape } from './csg';

const volumeOf = (g: THREE.BufferGeometry) => {
    // signed volume of a closed triangle mesh
    const pos = g.attributes.position;
    const idx = g.index;
    let v = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
        const [i0, i1, i2] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        v += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(v);
};

describe('CAD shapes', () => {
    it('cuts a hole out of a solid when grouped', () => {
        const plate = newShape('box', [1, 0.1, 1]);
        const hole = newShape('cylinder', [0.2, 0.3, 0.2], { hole: true, position: [0, 0.05, 0] });
        const g = groupShapes([plate, hole]);
        const fused = fuseShapes(g.children!)!;
        const expected = 1 * 0.1 * 1 - Math.PI * 0.1 * 0.1 * 0.1;
        expect(volumeOf(fused.geometry)).toBeCloseTo(expected, 2);
        // the hole does not make the group bigger
        expect(g.size[0]).toBeCloseTo(1);
        expect(g.size[1]).toBeCloseTo(0.1);
        expect(g.hole).toBe(false);
        // cut faces take the plate's colour, not the grey hole material
        expect(fused.materials.every(m => m.name !== 'Bohrung')).toBe(true);
    });

    it('unites solids and keeps their colours', () => {
        const top = newShape('box', [1, 0.04, 0.6], { color: '#c49a6c', name: 'Platte', position: [0, 0.74, 0] });
        const leg = newShape('box', [0.05, 0.72, 0.05], { color: '#333333', name: 'Bein', position: [0.45, 0.36, 0.25] });
        const g = groupShapes([top, leg]);
        expect(g.size[1]).toBeCloseTo(0.76);
        const names = fuseShapes(g.children!)!.materials.map(m => m.name).sort();
        expect(names).toEqual(['Bein', 'Platte']);
    });

    it('ungroups back to the parts, following the moved, turned and scaled group', () => {
        const a = newShape('box', [0.2, 0.2, 0.2], { position: [-0.5, 0.1, 0] });
        const b = newShape('box', [0.2, 0.2, 0.2], { position: [0.5, 0.1, 0] });
        const g = groupShapes([a, b]);
        expect(g.size[0]).toBeCloseTo(1.2);
        // move up 1 m, turn 90° about Y, stretch to double width
        const moved = { ...g, position: [g.position[0], g.position[1] + 1, g.position[2]] as [number, number, number], rotation: [0, 90, 0] as [number, number, number], size: [2.4, g.size[1], g.size[2]] as [number, number, number] };
        const parts = ungroupShape(moved);
        const zs = parts.map(p => p.position[2]).sort((x, y) => x - y);
        // after turning 90° about Y the parts lie along Z, twice as far apart
        expect(zs[0]).toBeCloseTo(-1, 5);
        expect(zs[1]).toBeCloseTo(1, 5);
        for (const p of parts) {
            expect(p.position[0]).toBeCloseTo(0, 5);
            expect(p.position[1]).toBeCloseTo(1.1, 5);
            // the parts were stretched with the group
            expect(p.size[0]).toBeCloseTo(0.4, 5);
        }
    });

    it('drops shapes onto the work plane and exports with the pivot at the bottom centre', () => {
        const s = dropToFloor(newShape('sphere', [0.4, 0.4, 0.4], { position: [1, 2, 3] }));
        expect(shapeBox(s).min.y).toBeCloseTo(0);
        const obj = docToObject({ version: 1, shapes: [s, newShape('box', [0.2, 0.2, 0.2], { position: [1.5, 0.1, 3] })] })!;
        const box = new THREE.Box3().setFromObject(obj);
        expect(box.min.y).toBeCloseTo(0);
        expect((box.min.x + box.max.x) / 2).toBeCloseTo(0);
        expect((box.min.z + box.max.z) / 2).toBeCloseTo(0);
    });
});
