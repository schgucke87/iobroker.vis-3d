/** Building blocks for the procedurally generated built-in models (metres, Y up, bottom centre at the origin). */
import * as THREE from 'three';

export type Factory = () => THREE.Group;

export const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}, name = '') =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra, name });

/** Box with its bottom centre at (x, y, z). */
export function box(g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, radius = 0) {
    const geo = radius > 0 ? roundedBox(w, h, d, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

export function cyl(g: THREE.Group, m: THREE.Material, rTop: number, rBottom: number, h: number, x = 0, y = 0, z = 0, seg = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

export function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
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

export const legs = (g: THREE.Group, m: THREE.Material, w: number, d: number, h: number, t = 0.04, inset = 0.04) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, m, t, h, t, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
};


/** Low-poly sphere (also squashed into an ellipsoid). */
export function sph(g: THREE.Group, m: THREE.Material, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

/** Cone standing on its base at (x, y, z). */
export function cone(g: THREE.Group, m: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0, seg = 16) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}

/** A flat leaf or blade: a thin ellipsoid, rotated by (rx, ry, rz) around its base point. */
export function leaf(g: THREE.Group, m: THREE.Material, length: number, width: number, x: number, y: number, z: number, rx: number, ry: number, rz = 0) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.set(rx, ry, rz, 'YXZ');
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), m);
    mesh.scale.set(width, length, 0.012);
    mesh.position.set(0, length / 2, 0);
    mesh.castShadow = true;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
}

/** Deterministic pseudo random numbers, so a model looks the same every time. */
export function rng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** A plant pot with soil; returns the soil height. */
export function pot(g: THREE.Group, color: string, rTop: number, rBottom: number, h: number, name = 'Topf') {
    cyl(g, mat(color, { roughness: 0.7 }, name), rTop, rBottom, h);
    cyl(g, mat('#4a3626', { roughness: 1 }, 'Erde'), rTop * 0.92, rTop * 0.92, 0.01, 0, h - 0.02);
    return h - 0.01;
}
