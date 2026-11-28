import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { CadDoc, CadPrimitive, CadShape } from './types';
import { uid } from '../model/ops';

const D2R = Math.PI / 180;

// ---------- primitives (unit size, centred) ----------

const primitiveCache = new Map<CadPrimitive, THREE.BufferGeometry>();

export function primitiveGeometry(kind: CadPrimitive): THREE.BufferGeometry {
    let g = primitiveCache.get(kind);
    if (!g) {
        switch (kind) {
            case 'box':
                g = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'cylinder':
                g = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
                break;
            case 'sphere':
                g = new THREE.SphereGeometry(0.5, 40, 20);
                break;
            case 'cone':
                g = new THREE.CylinderGeometry(0, 0.5, 1, 48);
                break;
            case 'halfCylinder': {
                // half a cylinder lying along Z (e.g. for rounded edges), flat side down
                const shape = new THREE.Shape();
                shape.absarc(0, 0, 0.5, 0, Math.PI, false);
                shape.closePath();
                g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 32 });
                g.translate(0, -0.25, -0.5);
                // its bounding box is 1 × 0.5 × 1: stretch to the unit cube
                g.scale(1, 2, 1);
                break;
            }
            case 'wedge': {
                // right-angled ramp: full height at the back (−Z), zero at the front
                const shape = new THREE.Shape();
                shape.moveTo(-0.5, -0.5);
                shape.lineTo(0.5, -0.5);
                shape.lineTo(-0.5, 0.5);
                shape.closePath();
                g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
                g.translate(0, 0, -0.5);
                // ramp along Z instead of X
                g.rotateY(-Math.PI / 2);
                break;
            }
        }
        g.clearGroups();
        g.computeVertexNormals();
        primitiveCache.set(kind, g);
    }
    return g;
}

// ---------- transforms ----------

/** Scale of a shape's base geometry (unit primitives, or a group's fused parts at their base size). */
function geometryScale(s: CadShape): THREE.Vector3 {
    if (s.kind === 'group') {
        const b = s.baseSize ?? s.size;
        return new THREE.Vector3(s.size[0] / (b[0] || 1), s.size[1] / (b[1] || 1), s.size[2] / (b[2] || 1));
    }
    return new THREE.Vector3(...s.size);
}

export function shapeMatrix(s: CadShape): THREE.Matrix4 {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.rotation[0] * D2R, s.rotation[1] * D2R, s.rotation[2] * D2R));
    return new THREE.Matrix4().compose(new THREE.Vector3(...s.position), q, geometryScale(s));
}

/** Applies a matrix (position/rotation/scale) back onto a shape's fields. */
export function setShapeMatrix(s: CadShape, m: THREE.Matrix4): CadShape {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    m.decompose(p, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q);
    const base = s.kind === 'group' ? (s.baseSize ?? s.size) : [1, 1, 1];
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    return {
        ...s,
        position: [r(p.x), r(p.y), r(p.z)],
        rotation: [r(e.x / D2R), r(e.y / D2R), r(e.z / D2R)],
        size: [r(Math.abs(sc.x) * base[0]), r(Math.abs(sc.y) * base[1]), r(Math.abs(sc.z) * base[2])],
    };
}

// ---------- materials ----------

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Material of a solid part; the name groups the parts by colour in the object colour panel. */
export function partMaterial(color: string, name?: string): THREE.MeshStandardMaterial {
    const key = `${color}|${name ?? ''}`;
    let m = materialCache.get(key);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, name: name || `Farbe ${color}` });
        materialCache.set(key, m);
    }
    return m;
}

/** How holes look in the editor: translucent grey. */
export const HOLE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#8d96a3', transparent: true, opacity: 0.35, depthWrite: false, name: 'Bohrung' });

// ---------- CSG ----------

const evaluator = new Evaluator();
evaluator.useGroups = true;
evaluator.attributes = ['position', 'normal'];

export interface Fused {
    geometry: THREE.BufferGeometry;
    materials: THREE.Material[];
    /** True if the result only consists of holes. */
    hole: boolean;
}

const fuseCache = new Map<string, Fused>();

/**
 * Fuses shapes: the solids are united, then every hole is cut out. The
 * shapes' own transforms are applied. Cut surfaces take the colour of the
 * part they are cut into.
 */
export function fuseShapes(shapes: CadShape[]): Fused | null {
    if (!shapes.length) return null;
    const key = JSON.stringify(shapes);
    const cached = fuseCache.get(key);
    if (cached) return cached;

    const solids = shapes.filter(s => !s.hole);
    const holes = shapes.filter(s => s.hole);
    const onlyHoles = solids.length === 0;
    const brushOf = (s: CadShape, asHole: boolean): Brush | null => {
        const base = baseGeometry(s);
        if (!base) return null;
        const mats = asHole ? [HOLE_MATERIAL] : baseMaterials(s);
        const b = new Brush(base.geometry, mats.length === 1 ? mats[0] : mats);
        b.applyMatrix4(shapeMatrix(s));
        b.updateMatrixWorld(true);
        return b;
    };

    let result: Brush | null = null;
    for (const s of onlyHoles ? holes : solids) {
        const b = brushOf(s, false);
        if (!b) continue;
        result = result ? evaluator.evaluate(result, b, ADDITION) : b;
    }
    if (!onlyHoles && result) {
        for (const h of holes) {
            const b = brushOf(h, true);
            if (b) result = evaluator.evaluate(result, b, SUBTRACTION);
        }
    }
    if (!result) return null;

    // bake the transform of a single, uncombined brush into its geometry
    let geometry: THREE.BufferGeometry;
    let materials: THREE.Material[];
    if (result.geometry === baseGeometry(onlyHoles ? holes[0] : solids[0])?.geometry) {
        geometry = result.geometry.clone();
        geometry.applyMatrix4(result.matrixWorld);
        materials = Array.isArray(result.material) ? result.material : [result.material];
        if (!geometry.groups.length) geometry.addGroup(0, geometry.index ? geometry.index.count : geometry.attributes.position.count, 0);
    } else {
        geometry = result.geometry;
        materials = (Array.isArray(result.material) ? result.material : [result.material]).slice();
    }
    // the faces cut by a hole would otherwise be grey: give them the first solid's material
    const solidMat = materials.find(m => m !== HOLE_MATERIAL);
    if (solidMat) materials = materials.map(m => (m === HOLE_MATERIAL ? solidMat : m));
    const fused = { geometry, materials, hole: onlyHoles };
    if (fuseCache.size > 200) fuseCache.clear();
    fuseCache.set(key, fused);
    return fused;
}

/** Geometry of a shape before its own transform: a unit primitive, or a group's fused parts. */
export function baseGeometry(s: CadShape): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null {
    if (s.kind !== 'group') return { geometry: primitiveGeometry(s.kind), materials: [partMaterial(s.color, s.name)] };
    const f = fuseShapes(s.children ?? []);
    return f ? { geometry: f.geometry, materials: f.materials } : null;
}

function baseMaterials(s: CadShape): THREE.Material[] {
    return baseGeometry(s)?.materials ?? [partMaterial(s.color, s.name)];
}

// ---------- editing operations ----------

const SHAPE_NAMES: Record<CadShape['kind'], string> = {
    box: 'Quader',
    cylinder: 'Zylinder',
    sphere: 'Kugel',
    cone: 'Kegel',
    wedge: 'Keil',
    halfCylinder: 'Halbzylinder',
    group: 'Gruppe',
};
export const shapeLabel = (s: CadShape) => s.name || (s.hole ? `Bohrung (${SHAPE_NAMES[s.kind]})` : SHAPE_NAMES[s.kind]);

export function newShape(kind: CadPrimitive, size: [number, number, number], opts: Partial<CadShape> = {}): CadShape {
    return {
        id: uid('s'),
        kind,
        hole: false,
        color: '#c49a6c',
        position: [0, size[1] / 2, 0],
        rotation: [0, 0, 0],
        size,
        ...opts,
    };
}

/** World-space bounding box of a shape. */
export function shapeBox(s: CadShape): THREE.Box3 {
    const base = baseGeometry(s);
    const box = new THREE.Box3();
    if (!base) return box;
    if (!base.geometry.boundingBox) base.geometry.computeBoundingBox();
    return box.copy(base.geometry.boundingBox!).applyMatrix4(shapeMatrix(s));
}

/**
 * Groups shapes into one: the parts are stored relative to the group's
 * centre, the group gets the size of the fused result.
 */
export function groupShapes(shapes: CadShape[]): CadShape {
    const box = new THREE.Box3();
    shapes.forEach(s => box.union(shapeBox(s)));
    const center = box.getCenter(new THREE.Vector3());
    const children = shapes.map(s => ({ ...s, position: [s.position[0] - center.x, s.position[1] - center.y, s.position[2] - center.z] as [number, number, number] }));
    // the fused geometry decides the size (holes can make the group smaller than its parts)
    const fused = fuseShapes(children);
    const fusedBox = new THREE.Box3();
    if (fused) {
        fused.geometry.computeBoundingBox();
        fusedBox.copy(fused.geometry.boundingBox!);
    }
    // re-centre on the fused result, so the group's position is the centre of what you see
    const fc = fusedBox.isEmpty() ? new THREE.Vector3() : fusedBox.getCenter(new THREE.Vector3());
    const centred = children.map(c => ({ ...c, position: [c.position[0] - fc.x, c.position[1] - fc.y, c.position[2] - fc.z] as [number, number, number] }));
    const size = fusedBox.isEmpty() ? box.getSize(new THREE.Vector3()) : fusedBox.getSize(new THREE.Vector3());
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    const sz: [number, number, number] = [r(size.x), r(size.y), r(size.z)];
    return {
        id: uid('s'),
        kind: 'group',
        hole: shapes.every(s => s.hole),
        color: shapes.find(s => !s.hole)?.color ?? shapes[0].color,
        position: [r(center.x + fc.x), r(center.y + fc.y), r(center.z + fc.z)],
        rotation: [0, 0, 0],
        size: sz,
        baseSize: sz,
        children: centred,
    };
}

/** The parts of a group, with the group's current position, rotation and scale applied. */
export function ungroupShape(g: CadShape): CadShape[] {
    const gm = shapeMatrix(g);
    return (g.children ?? []).map(c => setShapeMatrix({ ...c, id: uid('s') }, gm.clone().multiply(shapeMatrix(c))));
}

/** Copies a shape with new ids (also inside groups). */
export function cloneShape(s: CadShape): CadShape {
    return { ...structuredClone(s), id: uid('s'), children: s.children?.map(cloneShape) };
}

/** Moves a shape so its lowest point lies on the work plane. */
export function dropToFloor(s: CadShape): CadShape {
    const box = shapeBox(s);
    return { ...s, position: [s.position[0], s.position[1] - box.min.y, s.position[2]] };
}

// ---------- export ----------

/**
 * The whole document as one model: all shapes fused (holes cut what they
 * touch), pivot at the bottom centre, ready for the asset library.
 */
export function docToObject(doc: CadDoc): THREE.Group | null {
    const fused = fuseShapes(doc.shapes);
    if (!fused || fused.hole) return null;
    const geometry = fused.geometry.clone();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const c = box.getCenter(new THREE.Vector3());
    geometry.translate(-c.x, -box.min.y, -c.z);
    // own materials per export, named by part/colour (the object colour panel uses the names)
    const materials = fused.materials.map(m => (m as THREE.MeshStandardMaterial).clone());
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}
