/**
 * Built-in starter furniture, generated from primitives so it needs no
 * downloads. Every model follows the asset convention: metres, Y up, pivot
 * at the bottom centre, front facing +Z.
 */
import * as THREE from 'three';
import type { AssetMeta } from '../model/types';

type Factory = () => THREE.Group;

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

/** Box with its bottom centre at (x, y, z). */
function box(g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, radius = 0) {
    const geo = radius > 0 ? roundedBox(w, h, d, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

function cyl(g: THREE.Group, m: THREE.Material, rTop: number, rBottom: number, h: number, x = 0, y = 0, z = 0, seg = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 4 });
    geo.translate(0, 0, -d / 2);
    return geo;
}

const legs = (g: THREE.Group, m: THREE.Material, w: number, d: number, h: number, t = 0.04, inset = 0.04) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, m, t, h, t, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
};

const F: Record<string, Factory> = {
    sofa: () => {
        const g = new THREE.Group();
        const fabric = mat('#7d8a99');
        const dark = mat('#3b3b3b');
        legs(g, dark, 2.1, 0.9, 0.08, 0.04, 0.08);
        box(g, fabric, 2.1, 0.32, 0.9, 0, 0.08, 0, 0.04);
        box(g, fabric, 2.1, 0.45, 0.22, 0, 0.4, -0.34, 0.06);
        box(g, fabric, 0.2, 0.25, 0.9, -0.95, 0.4, 0, 0.06);
        box(g, fabric, 0.2, 0.25, 0.9, 0.95, 0.4, 0, 0.06);
        const cushion = mat('#8f9cab');
        box(g, cushion, 0.82, 0.12, 0.62, -0.42, 0.4, 0.1, 0.04);
        box(g, cushion, 0.82, 0.12, 0.62, 0.42, 0.4, 0.1, 0.04);
        return g;
    },
    armchair: () => {
        const g = new THREE.Group();
        const fabric = mat('#a0715a');
        legs(g, mat('#3b3b3b'), 0.85, 0.85, 0.1, 0.04, 0.08);
        box(g, fabric, 0.85, 0.32, 0.85, 0, 0.1, 0, 0.05);
        box(g, fabric, 0.85, 0.45, 0.2, 0, 0.42, -0.32, 0.06);
        box(g, fabric, 0.16, 0.22, 0.85, -0.345, 0.42, 0, 0.05);
        box(g, fabric, 0.16, 0.22, 0.85, 0.345, 0.42, 0, 0.05);
        return g;
    },
    diningTable: () => {
        const g = new THREE.Group();
        const wood = mat('#b08a5f', { roughness: 0.6 });
        legs(g, wood, 1.6, 0.9, 0.72, 0.07, 0.08);
        box(g, wood, 1.6, 0.04, 0.9, 0, 0.72);
        return g;
    },
    coffeeTable: () => {
        const g = new THREE.Group();
        const wood = mat('#c7a57a', { roughness: 0.6 });
        legs(g, mat('#2f2f2f'), 1.1, 0.6, 0.38, 0.03, 0.05);
        box(g, wood, 1.1, 0.04, 0.6, 0, 0.38);
        return g;
    },
    chair: () => {
        const g = new THREE.Group();
        const wood = mat('#b08a5f', { roughness: 0.6 });
        legs(g, wood, 0.45, 0.5, 0.45, 0.035, 0.03);
        box(g, wood, 0.45, 0.04, 0.5, 0, 0.45);
        box(g, wood, 0.035, 0.45, 0.035, -0.2, 0.49, -0.22);
        box(g, wood, 0.035, 0.45, 0.035, 0.2, 0.49, -0.22);
        box(g, wood, 0.45, 0.16, 0.03, 0, 0.76, -0.22);
        return g;
    },
    bed: () => {
        const g = new THREE.Group();
        const frame = mat('#d8d2c8');
        box(g, frame, 1.7, 0.3, 2.1, 0, 0.05);
        legs(g, mat('#555'), 1.7, 2.1, 0.05, 0.05, 0.08);
        box(g, mat('#f4f4f2'), 1.6, 0.2, 2.0, 0, 0.35, 0.02, 0.05);
        box(g, frame, 1.7, 0.6, 0.08, 0, 0.3, -1.01);
        box(g, mat('#ffffff'), 0.65, 0.12, 0.4, -0.4, 0.55, -0.72, 0.05);
        box(g, mat('#ffffff'), 0.65, 0.12, 0.4, 0.4, 0.55, -0.72, 0.05);
        box(g, mat('#9fb4c8'), 1.62, 0.06, 1.3, 0, 0.55, 0.32, 0.02);
        return g;
    },
    wardrobe: () => {
        const g = new THREE.Group();
        const body = mat('#ece8e1');
        box(g, body, 2.0, 2.2, 0.6);
        const line = mat('#bdb6aa');
        for (const x of [-0.5, 0, 0.5]) box(g, line, 0.006, 2.1, 0.01, x, 0.05, 0.301);
        for (const x of [-0.56, -0.06, 0.44, 0.94]) box(g, mat('#8d8d8d', { metalness: 0.6 }), 0.02, 0.3, 0.03, x - 0.38, 0.95, 0.31);
        return g;
    },
    sideboard: () => {
        const g = new THREE.Group();
        const body = mat('#7a5a3c', { roughness: 0.6 });
        legs(g, mat('#2f2f2f'), 1.6, 0.45, 0.15, 0.03, 0.05);
        box(g, body, 1.6, 0.6, 0.45, 0, 0.15);
        for (const x of [-0.4, 0, 0.4]) box(g, mat('#5f452e'), 0.004, 0.56, 0.01, x, 0.17, 0.226);
        return g;
    },
    tv: () => {
        const g = new THREE.Group();
        box(g, mat('#1a1a1a', { roughness: 0.3 }), 1.45, 0.84, 0.05, 0, 0, 0);
        box(g, mat('#0c1824', { roughness: 0.1, metalness: 0.2 }), 1.41, 0.8, 0.01, 0, 0.02, 0.026);
        return g;
    },
    kitchen: () => {
        const g = new THREE.Group();
        const front = mat('#f2f2f0');
        box(g, mat('#2b2b2b'), 2.4, 0.1, 0.55, 0, 0, -0.02);
        box(g, front, 2.4, 0.76, 0.6, 0, 0.1);
        box(g, mat('#5a5652', { roughness: 0.4 }), 2.42, 0.04, 0.62, 0, 0.86);
        for (const x of [-0.9, -0.3, 0.3, 0.9]) box(g, mat('#c8c8c6'), 0.004, 0.72, 0.01, x + 0.3, 0.12, 0.301);
        box(g, mat('#bfc3c6', { metalness: 0.8, roughness: 0.3 }), 0.5, 0.01, 0.4, -0.6, 0.9, 0.0);
        box(g, mat('#111', { roughness: 0.2 }), 0.6, 0.01, 0.5, 0.5, 0.9, 0.0);
        return g;
    },
    fridge: () => {
        const g = new THREE.Group();
        box(g, mat('#e6e8ea', { roughness: 0.4, metalness: 0.2 }), 0.6, 1.85, 0.65);
        box(g, mat('#b5b8bb'), 0.6, 0.006, 0.01, 0, 1.2, 0.326);
        box(g, mat('#8d8d8d', { metalness: 0.7 }), 0.02, 0.4, 0.03, 0.25, 1.3, 0.34);
        return g;
    },
    floorLamp: () => {
        const g = new THREE.Group();
        const metal = mat('#2f2f2f', { metalness: 0.6, roughness: 0.4 });
        cyl(g, metal, 0.15, 0.15, 0.03);
        cyl(g, metal, 0.012, 0.012, 1.4, 0, 0.03);
        const shade = cyl(g, mat('#f3ead7', { emissive: '#000000' }), 0.14, 0.22, 0.3, 0, 1.35);
        shade.name = 'light-emitter';
        return g;
    },
    ceilingLamp: () => {
        const g = new THREE.Group();
        cyl(g, mat('#dddddd'), 0.04, 0.04, 0.02, 0, 0.4);
        cyl(g, mat('#444'), 0.004, 0.004, 0.32, 0, 0.08);
        const shade = cyl(g, mat('#f8f3e6'), 0.06, 0.22, 0.14, 0, 0, 0, 32);
        shade.name = 'light-emitter';
        return g;
    },
    plant: () => {
        const g = new THREE.Group();
        cyl(g, mat('#b9673f'), 0.17, 0.13, 0.32);
        const leaf = mat('#4f8a4a');
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), leaf);
        crown.position.set(0, 0.72, 0);
        crown.scale.set(1, 1.25, 1);
        crown.castShadow = true;
        g.add(crown);
        return g;
    },
    desk: () => {
        const g = new THREE.Group();
        const top = mat('#e8e2d6');
        box(g, mat('#2f2f2f'), 0.05, 0.72, 0.65, -0.68, 0, 0);
        box(g, mat('#2f2f2f'), 0.05, 0.72, 0.65, 0.68, 0, 0);
        box(g, top, 1.4, 0.03, 0.7, 0, 0.72);
        return g;
    },
};

const META: Omit<AssetMeta, 'size'>[] = [
    { id: 'builtin:sofa', name: 'Sofa', category: 'furniture', mount: 'floor' },
    { id: 'builtin:armchair', name: 'Sessel', category: 'furniture', mount: 'floor' },
    { id: 'builtin:coffeeTable', name: 'Couchtisch', category: 'furniture', mount: 'floor' },
    { id: 'builtin:diningTable', name: 'Esstisch', category: 'furniture', mount: 'floor' },
    { id: 'builtin:chair', name: 'Stuhl', category: 'furniture', mount: 'floor' },
    { id: 'builtin:desk', name: 'Schreibtisch', category: 'furniture', mount: 'floor' },
    { id: 'builtin:bed', name: 'Doppelbett', category: 'furniture', mount: 'floor' },
    { id: 'builtin:wardrobe', name: 'Kleiderschrank', category: 'furniture', mount: 'floor' },
    { id: 'builtin:sideboard', name: 'Sideboard', category: 'furniture', mount: 'floor' },
    { id: 'builtin:kitchen', name: 'Küchenzeile', category: 'appliance', mount: 'floor' },
    { id: 'builtin:fridge', name: 'Kühlschrank', category: 'appliance', mount: 'floor' },
    { id: 'builtin:tv', name: 'Fernseher', category: 'appliance', mount: 'wall' },
    { id: 'builtin:floorLamp', name: 'Stehlampe', category: 'lighting', mount: 'floor' },
    { id: 'builtin:ceilingLamp', name: 'Deckenleuchte', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:plant', name: 'Pflanze', category: 'decor', mount: 'floor' },
];

export function isBuiltin(id: string) {
    return id.startsWith('builtin:');
}

export function createBuiltin(id: string): THREE.Group | null {
    const f = F[id.slice('builtin:'.length)];
    return f ? f() : null;
}

let metaCache: AssetMeta[] | null = null;
/** Metadata of all built-in assets, sizes measured from the generated models. */
export function builtinAssets(): AssetMeta[] {
    if (!metaCache) {
        metaCache = META.map(m => {
            const obj = createBuiltin(m.id)!;
            const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
            disposeObject(obj);
            return { ...m, size: [size.x, size.y, size.z] as [number, number, number] };
        });
    }
    return metaCache;
}

export function disposeObject(obj: THREE.Object3D) {
    obj.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
            mesh.geometry.dispose();
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(m => m.dispose());
        }
    });
}
