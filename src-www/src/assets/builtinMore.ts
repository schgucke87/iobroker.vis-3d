/**
 * More built-in models: indoor and garden plants, garden furniture, more
 * furniture, bathroom and lights. Same convention as builtin.ts: metres,
 * Y up, pivot at the bottom centre, front facing +Z. Material names are
 * shown in the colour editor; lamps name their glowing part "light-emitter".
 */
import * as THREE from 'three';
import type { AssetMeta } from '../model/types';
import { box, cone, cyl, leaf, legs, mat, pot, rng, sph, type Factory } from './primitives';

const G = () => new THREE.Group();
const emitter = <T extends THREE.Object3D>(o: T) => ((o.name = 'light-emitter'), o);

/** A cluster of low-poly balls: tree crowns, bushes, hedges. */
function crown(g: THREE.Group, m: THREE.Material, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, seed: number) {
    const r = rng(seed);
    sph(g, m, 1, cx, cy, cz, rx * 0.8, ry * 0.8, rz * 0.8);
    for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const e = (r() - 0.3) * 1.2;
        const rad = 0.35 + r() * 0.3;
        sph(g, m, 1, cx + Math.cos(a) * rx * 0.55, cy + e * ry * 0.4, cz + Math.sin(a) * rz * 0.55, rx * rad, ry * rad, rz * rad);
    }
}

/** Small blossoms scattered over a shape. */
function blossoms(g: THREE.Group, m: THREE.Material, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, size: number, seed: number) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const b = r() * Math.PI * 0.55;
        sph(g, m, size, cx + Math.cos(a) * Math.sin(b) * rx, cy + Math.cos(b) * ry, cz + Math.sin(a) * Math.sin(b) * rz, 1, 1, 1, 0);
    }
}

const RAW: Record<string, Factory> = {
    // ---------------- indoor plants ----------------
    monstera: () => {
        const g = G();
        const top = pot(g, '#d9d4cb', 0.2, 0.16, 0.34);
        const green = mat('#2f6b3a', { side: THREE.DoubleSide }, 'Blätter');
        const stem = mat('#4c7a3a', {}, 'Stiele');
        const r = rng(3);
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + r() * 0.4;
            const tilt = 0.35 + r() * 0.5;
            const len = 0.45 + r() * 0.35;
            const s = leaf(g, stem, len, 0.03, 0, top, 0, -tilt, a);
            // the big leaf at the end of the stem
            const blade = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), green);
            blade.scale.set(0.34, 0.3, 0.015);
            blade.position.set(0, len + 0.12, 0);
            blade.rotation.x = -0.9;
            blade.castShadow = true;
            s.add(blade);
        }
        return g;
    },
    ficus: () => {
        const g = G();
        const top = pot(g, '#b9673f', 0.19, 0.15, 0.32);
        const bark = mat('#6b5440', {}, 'Stamm');
        cyl(g, bark, 0.025, 0.035, 0.9, 0, top);
        cyl(g, bark, 0.015, 0.02, 0.35, 0.06, top + 0.55).rotation.z = -0.5;
        crown(g, mat('#3f7d3a', {}, 'Blätter'), 0, top + 1.15, 0, 0.33, 0.38, 0.33, 7, 11);
        return g;
    },
    snakePlant: () => {
        const g = G();
        const top = pot(g, '#3d3f43', 0.16, 0.16, 0.3);
        const blade = mat('#3d6b3c', { side: THREE.DoubleSide }, 'Blätter');
        const r = rng(5);
        for (let i = 0; i < 11; i++) {
            const a = r() * Math.PI * 2;
            const d = r() * 0.08;
            leaf(g, blade, 0.45 + r() * 0.35, 0.07, Math.cos(a) * d, top, Math.sin(a) * d, -(0.05 + r() * 0.18), a);
        }
        return g;
    },
    cactus: () => {
        const g = G();
        const top = pot(g, '#c97a4a', 0.13, 0.1, 0.18);
        const green = mat('#4c7d45', { roughness: 0.6 }, 'Kaktus');
        cyl(g, green, 0.07, 0.08, 0.55, 0, top, 0, 10);
        sph(g, green, 0.07, 0, top + 0.55, 0, 1, 1, 1, 1);
        const arm = (side: number, y: number, h: number) => {
            box(g, green, 0.12, 0.07, 0.07, side * 0.1, top + y, 0);
            cyl(g, green, 0.045, 0.05, h, side * 0.16, top + y, 0, 10);
            sph(g, green, 0.045, side * 0.16, top + y + h, 0, 1, 1, 1, 1);
        };
        arm(1, 0.22, 0.2);
        arm(-1, 0.32, 0.15);
        return g;
    },
    kentiaPalm: () => {
        const g = G();
        const top = pot(g, '#e5e1d8', 0.24, 0.19, 0.4);
        const frond = mat('#3c7a3e', { side: THREE.DoubleSide }, 'Wedel');
        const stem = mat('#5d7d3b', {}, 'Stiele');
        const r = rng(9);
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + r() * 0.3;
            const p = leaf(g, stem, 0.9 + r() * 0.5, 0.02, 0, top, 0, -(0.25 + r() * 0.45), a);
            // leaflets along the stem
            for (let k = 2; k < 9; k++) {
                for (const side of [-1, 1]) {
                    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), frond);
                    l.scale.set(0.035, 0.32 - k * 0.02, 0.01);
                    l.position.set(side * 0.08, k * 0.12, 0);
                    l.rotation.z = side * 1.1;
                    p.add(l);
                }
            }
        }
        return g;
    },
    tablePlant: () => {
        const g = G();
        const top = pot(g, '#f0ede6', 0.08, 0.065, 0.13);
        crown(g, mat('#4f8a4a', {}, 'Blätter'), 0, top + 0.1, 0, 0.12, 0.1, 0.12, 5, 21);
        return g;
    },
    flowerPot: () => {
        const g = G();
        const top = pot(g, '#b9673f', 0.12, 0.09, 0.18);
        crown(g, mat('#4c8a3f', {}, 'Blätter'), 0, top + 0.1, 0, 0.13, 0.1, 0.13, 4, 31);
        blossoms(g, mat('#d8436b', {}, 'Blüten'), 0, top + 0.12, 0, 0.13, 0.12, 0.13, 14, 0.025, 7);
        return g;
    },

    // ---------------- garden plants ----------------
    deciduousTree: () => {
        const g = G();
        const bark = mat('#5e4a38', {}, 'Stamm');
        cyl(g, bark, 0.1, 0.16, 2.4);
        cyl(g, bark, 0.05, 0.07, 1.0, 0.25, 1.9).rotation.z = -0.6;
        cyl(g, bark, 0.05, 0.07, 1.0, -0.2, 2.0, 0.1).rotation.z = 0.6;
        crown(g, mat('#4b7f3a', {}, 'Krone'), 0, 3.7, 0, 1.7, 1.5, 1.7, 9, 41);
        return g;
    },
    conifer: () => {
        const g = G();
        cyl(g, mat('#5a4434', {}, 'Stamm'), 0.08, 0.13, 0.8);
        const needles = mat('#2f5e3a', {}, 'Nadeln');
        for (let i = 0; i < 5; i++) cone(g, needles, 1.25 - i * 0.22, 1.5, 0, 0.6 + i * 0.75, 0, 10);
        return g;
    },
    fruitTree: () => {
        const g = G();
        cyl(g, mat('#6b5440', {}, 'Stamm'), 0.07, 0.11, 1.5);
        crown(g, mat('#56883f', {}, 'Krone'), 0, 2.3, 0, 1.2, 0.95, 1.2, 8, 51);
        blossoms(g, mat('#c8332b', { roughness: 0.5 }, 'Äpfel'), 0, 2.3, 0, 1.15, 0.9, 1.15, 26, 0.05, 13);
        return g;
    },
    thuja: () => {
        const g = G();
        const m = mat('#3b6b37', {}, 'Laub');
        sph(g, m, 1, 0, 1.3, 0, 0.45, 1.35, 0.45);
        sph(g, m, 1, 0, 2.3, 0, 0.3, 0.6, 0.3);
        return g;
    },
    bush: () => {
        const g = G();
        crown(g, mat('#4a7d3c', {}, 'Laub'), 0, 0.55, 0, 0.7, 0.5, 0.7, 7, 61);
        return g;
    },
    hedge: () => {
        const g = G();
        const m = mat('#3e6e36', { roughness: 0.95 }, 'Hecke');
        box(g, m, 2.0, 1.6, 0.6, 0, 0, 0, 0.12);
        const r = rng(71);
        for (let i = 0; i < 10; i++) sph(g, m, 0.18, -0.9 + r() * 1.8, 1.45 + r() * 0.12, (r() - 0.5) * 0.4, 1, 0.6, 1, 0);
        return g;
    },
    roseBush: () => {
        const g = G();
        crown(g, mat('#3f6e37', {}, 'Laub'), 0, 0.45, 0, 0.45, 0.4, 0.45, 6, 81);
        blossoms(g, mat('#e4577a', {}, 'Blüten'), 0, 0.45, 0, 0.46, 0.42, 0.46, 30, 0.04, 17);
        return g;
    },
    lavender: () => {
        const g = G();
        crown(g, mat('#7a8f6e', {}, 'Laub'), 0, 0.2, 0, 0.3, 0.18, 0.3, 5, 91);
        const flower = mat('#8b6fc4', {}, 'Blüten');
        const r = rng(19);
        for (let i = 0; i < 26; i++) {
            const a = r() * Math.PI * 2;
            const d = r() * 0.25;
            cyl(g, flower, 0.012, 0.012, 0.12, Math.cos(a) * d, 0.32 + r() * 0.08, Math.sin(a) * d, 5);
        }
        return g;
    },
    ornamentalGrass: () => {
        const g = G();
        const blade = mat('#a7a463', { side: THREE.DoubleSide }, 'Halme');
        const r = rng(23);
        for (let i = 0; i < 40; i++) {
            const a = r() * Math.PI * 2;
            leaf(g, blade, 0.6 + r() * 0.5, 0.025, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, -(0.15 + r() * 0.55), a);
        }
        return g;
    },
    flowerBed: () => {
        const g = G();
        box(g, mat('#5a4030', { roughness: 1 }, 'Erde'), 2.0, 0.06, 1.0, 0, 0, 0, 0.05);
        const colors = ['#e4577a', '#f2c94c', '#ffffff', '#8b6fc4', '#e8743b'];
        const leafM = mat('#4c8a3f', {}, 'Laub');
        const r = rng(29);
        for (let i = 0; i < 22; i++) {
            const x = -0.85 + r() * 1.7;
            const z = -0.4 + r() * 0.8;
            sph(g, leafM, 0.09, x, 0.12, z, 1, 0.8, 1, 0);
            sph(g, mat(colors[i % colors.length], {}, `Blüten ${(i % colors.length) + 1}`), 0.045, x, 0.2, z, 1, 1, 1, 0);
        }
        return g;
    },
    raisedBed: () => {
        const g = G();
        const wood = mat('#9b7451', { roughness: 0.8 }, 'Holz');
        for (const [w, d, x, z] of [
            [1.6, 0.05, 0, 0.375],
            [1.6, 0.05, 0, -0.375],
            [0.05, 0.8, 0.775, 0],
            [0.05, 0.8, -0.775, 0],
        ]) box(g, wood, w, 0.75, d, x, 0, z);
        box(g, mat('#4a3626', { roughness: 1 }, 'Erde'), 1.5, 0.02, 0.7, 0, 0.7);
        const veg = mat('#5a9a44', {}, 'Gemüse');
        for (let i = 0; i < 6; i++) for (const z of [-0.18, 0.18]) sph(g, veg, 0.08, -0.6 + i * 0.24, 0.8, z, 1, 0.7, 1, 0);
        return g;
    },
    bamboo: () => {
        const g = G();
        const cane = mat('#7a9a3a', {}, 'Halme');
        const foliage = mat('#5c8f3a', {}, 'Laub');
        const r = rng(37);
        for (let i = 0; i < 9; i++) {
            const x = (r() - 0.5) * 0.5;
            const z = (r() - 0.5) * 0.5;
            const h = 2 + r() * 1.2;
            cyl(g, cane, 0.02, 0.025, h, x, 0, z, 8);
            sph(g, foliage, 0.25, x, h - 0.2, z, 1, 1.6, 1, 0);
        }
        return g;
    },

    // ---------------- garden furniture ----------------
    gardenTable: () => {
        const g = G();
        const wood = mat('#a77b52', { roughness: 0.75 }, 'Holz');
        legs(g, mat('#3b3f45', { metalness: 0.5 }, 'Gestell'), 1.6, 0.9, 0.72, 0.05, 0.08);
        for (let i = 0; i < 8; i++) box(g, wood, 1.6, 0.03, 0.1, 0, 0.72, -0.39 + i * 0.111);
        return g;
    },
    gardenChair: () => {
        const g = G();
        const frame = mat('#3b3f45', { metalness: 0.5 }, 'Gestell');
        const wood = mat('#a77b52', { roughness: 0.75 }, 'Holz');
        legs(g, frame, 0.55, 0.55, 0.45, 0.03, 0.03);
        for (let i = 0; i < 5; i++) box(g, wood, 0.55, 0.025, 0.09, 0, 0.45, -0.22 + i * 0.11);
        box(g, frame, 0.03, 0.45, 0.03, -0.25, 0.45, -0.25);
        box(g, frame, 0.03, 0.45, 0.03, 0.25, 0.45, -0.25);
        for (let i = 0; i < 3; i++) box(g, wood, 0.55, 0.08, 0.025, 0, 0.55 + i * 0.12, -0.26);
        return g;
    },
    lounger: () => {
        const g = G();
        const frame = mat('#d9d6cf', {}, 'Gestell');
        const pad = mat('#6f8fa8', {}, 'Auflage');
        legs(g, frame, 0.7, 1.95, 0.3, 0.04, 0.05);
        box(g, frame, 0.7, 0.04, 1.95, 0, 0.3);
        box(g, pad, 0.66, 0.06, 1.35, 0, 0.34, 0.28, 0.03);
        const back = box(g, pad, 0.66, 0.06, 0.62, 0, 0.34, 0, 0.03);
        back.rotation.x = -0.9;
        back.position.set(0, 0.55, -0.62);
        return g;
    },
    parasol: () => {
        const g = G();
        cyl(g, mat('#555b63', { metalness: 0.4 }, 'Fuß'), 0.25, 0.28, 0.08);
        cyl(g, mat('#e9e6df', { metalness: 0.3 }, 'Mast'), 0.02, 0.02, 2.35, 0, 0.08);
        const canopy = cone(g, mat('#e8dcc4', { side: THREE.DoubleSide }, 'Schirm'), 1.4, 0.45, 0, 1.95, 0, 8);
        canopy.castShadow = true;
        return g;
    },
    gardenBench: () => {
        const g = G();
        const wood = mat('#9b7451', { roughness: 0.75 }, 'Holz');
        const iron = mat('#2f3338', { metalness: 0.5 }, 'Gestell');
        for (const x of [-0.7, 0.7]) {
            box(g, iron, 0.05, 0.45, 0.5, x, 0, 0);
            box(g, iron, 0.05, 0.45, 0.05, x, 0.45, -0.22);
        }
        for (let i = 0; i < 4; i++) box(g, wood, 1.5, 0.03, 0.1, 0, 0.45, -0.18 + i * 0.12);
        for (let i = 0; i < 3; i++) box(g, wood, 1.5, 0.09, 0.025, 0, 0.55 + i * 0.12, -0.24);
        return g;
    },
    grill: () => {
        const g = G();
        const black = mat('#1e1f22', { roughness: 0.4, metalness: 0.4 }, 'Gehäuse');
        legs(g, mat('#6b6f76', { metalness: 0.6 }, 'Beine'), 0.5, 0.5, 0.6, 0.03, 0.08);
        sph(g, black, 0.3, 0, 0.72, 0, 1, 0.55, 1);
        box(g, mat('#a7abb1', { metalness: 0.7 }, 'Griff'), 0.2, 0.02, 0.03, 0, 0.92, 0.27);
        return g;
    },
    firePit: () => {
        const g = G();
        cyl(g, mat('#6f6a63', { roughness: 0.95 }, 'Stein'), 0.5, 0.55, 0.35, 0, 0, 0, 12);
        cyl(g, mat('#2a2522', { roughness: 1 }, 'Asche'), 0.4, 0.4, 0.02, 0, 0.34);
        const glow = cone(g, mat('#ff8a3c', { emissive: '#ff6a1a', emissiveIntensity: 0.8 }, 'Feuer'), 0.18, 0.35, 0, 0.36, 0, 7);
        emitter(glow);
        return g;
    },

    // ---------------- furniture ----------------
    cornerSofa: () => {
        const g = G();
        const fabric = mat('#6e7a6a', {}, 'Bezug');
        const cushion = mat('#808c7b', {}, 'Kissen');
        box(g, fabric, 2.6, 0.42, 0.95, 0, 0, -0.875, 0.04);
        box(g, fabric, 0.95, 0.42, 1.8, 0.825, 0, 0.0, 0.04);
        box(g, fabric, 2.6, 0.4, 0.2, 0, 0.42, -1.25, 0.06);
        box(g, fabric, 0.2, 0.4, 2.7, 1.2, 0.42, -0.45, 0.06);
        for (const x of [-1.0, -0.2]) box(g, cushion, 0.75, 0.1, 0.65, x, 0.42, -0.8, 0.04);
        box(g, cushion, 0.65, 0.1, 1.4, 0.75, 0.42, 0.1, 0.04);
        return g;
    },
    bookshelf: () => {
        const g = G();
        const wood = mat('#e9e4da', {}, 'Korpus');
        box(g, wood, 0.03, 2.0, 0.35, -0.485, 0, 0);
        box(g, wood, 0.03, 2.0, 0.35, 0.485, 0, 0);
        box(g, wood, 1.0, 0.02, 0.35, 0, 0, -0.0);
        box(g, wood, 1.0, 0.01, 0.01, 0, 0, -0.17);
        const colors = ['#8c3b3b', '#2f5d8a', '#c9a227', '#3f7d4a', '#6b4f8a', '#d17a3f'];
        const r = rng(43);
        for (let s = 0; s < 5; s++) {
            const y = s * 0.4;
            box(g, wood, 0.94, 0.025, 0.33, 0, y + 0.38);
            let x = -0.44;
            while (x < 0.36 && s < 4) {
                const w = 0.03 + r() * 0.03;
                const h = 0.22 + r() * 0.1;
                box(g, mat(colors[Math.floor(r() * colors.length)], {}, 'Bücher'), w, h, 0.22, x + w / 2, y + 0.4, 0.02);
                x += w + 0.004;
                if (r() < 0.06) x += 0.12;
            }
        }
        return g;
    },
    dresser: () => {
        const g = G();
        const body = mat('#f1eee8', {}, 'Korpus');
        legs(g, mat('#8a6a4a'), 1.0, 0.45, 0.1, 0.03, 0.05);
        box(g, body, 1.0, 0.8, 0.45, 0, 0.1);
        for (let i = 0; i < 3; i++) {
            box(g, mat('#d9d4ca'), 0.96, 0.004, 0.01, 0, 0.36 + i * 0.25, 0.226);
            box(g, mat('#8d8d8d', { metalness: 0.6 }, 'Griffe'), 0.15, 0.02, 0.02, 0, 0.23 + i * 0.25, 0.235);
        }
        return g;
    },
    nightstand: () => {
        const g = G();
        const body = mat('#b08a5f', { roughness: 0.6 }, 'Holz');
        legs(g, mat('#2f2f2f'), 0.45, 0.38, 0.12, 0.025, 0.04);
        box(g, body, 0.45, 0.4, 0.38, 0, 0.12);
        box(g, mat('#8a6a48'), 0.43, 0.004, 0.01, 0, 0.36, 0.191);
        return g;
    },
    singleBed: () => {
        const g = G();
        const frame = mat('#c9b08a', { roughness: 0.6 }, 'Rahmen');
        box(g, frame, 1.0, 0.28, 2.05, 0, 0.06);
        legs(g, mat('#6b5440'), 1.0, 2.05, 0.06, 0.05, 0.06);
        box(g, mat('#f4f4f2', {}, 'Matratze'), 0.92, 0.18, 1.98, 0, 0.34, 0.02, 0.05);
        box(g, frame, 1.0, 0.55, 0.06, 0, 0.3, -1.0);
        box(g, mat('#ffffff', {}, 'Kissen'), 0.6, 0.11, 0.4, 0, 0.52, -0.72, 0.05);
        box(g, mat('#c98f6a', {}, 'Bettdecke'), 0.94, 0.06, 1.3, 0, 0.52, 0.3, 0.02);
        return g;
    },
    officeChair: () => {
        const g = G();
        const black = mat('#2b2d31', {}, 'Gestell');
        const fabric = mat('#3c4a5c', {}, 'Bezug');
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const arm = box(g, black, 0.04, 0.03, 0.3, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15);
            arm.rotation.y = a;
            sph(g, black, 0.03, Math.sin(a) * 0.3, 0.03, Math.cos(a) * 0.3, 1, 1, 1, 0);
        }
        cyl(g, mat('#8d9096', { metalness: 0.7 }), 0.025, 0.025, 0.38, 0, 0.08);
        box(g, fabric, 0.5, 0.08, 0.48, 0, 0.46, 0, 0.03);
        const back = box(g, fabric, 0.46, 0.55, 0.06, 0, 0.6, -0.24, 0.03);
        back.rotation.x = -0.12;
        return g;
    },
    tvBoard: () => {
        const g = G();
        const body = mat('#3d3a37', { roughness: 0.5 }, 'Korpus');
        legs(g, mat('#8a6a48'), 1.8, 0.4, 0.12, 0.03, 0.06);
        box(g, body, 1.8, 0.4, 0.4, 0, 0.12);
        for (const x of [-0.45, 0.45]) box(g, mat('#2c2a28'), 0.004, 0.36, 0.01, x, 0.14, 0.201);
        return g;
    },
    roundTable: () => {
        const g = G();
        const wood = mat('#c7a57a', { roughness: 0.6 }, 'Holz');
        cyl(g, mat('#2f2f2f', {}, 'Fuß'), 0.25, 0.28, 0.03);
        cyl(g, mat('#2f2f2f', {}, 'Fuß'), 0.04, 0.04, 0.7, 0, 0.03);
        cyl(g, wood, 0.55, 0.55, 0.035, 0, 0.72, 0, 40);
        return g;
    },
    barStool: () => {
        const g = G();
        const metal = mat('#3a3d42', { metalness: 0.6 }, 'Gestell');
        cyl(g, metal, 0.2, 0.2, 0.02);
        cyl(g, metal, 0.025, 0.025, 0.72, 0, 0.02);
        cyl(g, metal, 0.16, 0.16, 0.012, 0, 0.3);
        cyl(g, mat('#6b4a33', {}, 'Sitz'), 0.19, 0.19, 0.06, 0, 0.74, 0, 32);
        return g;
    },
    rug: () => {
        const g = G();
        box(g, mat('#b7a58c', { roughness: 1 }, 'Teppich'), 2.0, 0.012, 1.4, 0, 0, 0, 0.003);
        box(g, mat('#8c6f55', { roughness: 1 }, 'Rand'), 1.8, 0.002, 1.2, 0, 0.012);
        box(g, mat('#b7a58c', { roughness: 1 }), 1.7, 0.003, 1.1, 0, 0.012);
        return g;
    },
    wardrobeSmall: () => {
        const g = G();
        const body = mat('#ece8e1', {}, 'Korpus');
        box(g, body, 1.0, 2.0, 0.58);
        box(g, mat('#bdb6aa'), 0.006, 1.9, 0.01, 0, 0.05, 0.291);
        for (const x of [-0.06, 0.06]) box(g, mat('#8d8d8d', { metalness: 0.6 }, 'Griffe'), 0.02, 0.3, 0.03, x, 0.9, 0.3);
        return g;
    },
    coatRack: () => {
        const g = G();
        const wood = mat('#8a6a48', {}, 'Holz');
        box(g, mat('#efece6', {}, 'Bank'), 0.9, 0.45, 0.35);
        box(g, wood, 0.9, 0.6, 0.02, 0, 1.2, -0.16);
        for (let i = 0; i < 4; i++) box(g, mat('#3a3d42', { metalness: 0.5 }), 0.02, 0.02, 0.08, -0.33 + i * 0.22, 1.65, -0.11);
        return g;
    },
    mirror: () => {
        const g = G();
        box(g, mat('#c2a46b', { metalness: 0.6, roughness: 0.4 }, 'Rahmen'), 0.6, 0.9, 0.03);
        box(g, mat('#dfe7ee', { metalness: 0.9, roughness: 0.05 }, 'Spiegel'), 0.54, 0.84, 0.01, 0, 0.03, 0.016);
        return g;
    },

    // ---------------- bathroom & household ----------------
    bathtub: () => {
        const g = G();
        const white = mat('#f6f6f4', { roughness: 0.3 }, 'Wanne');
        box(g, white, 1.7, 0.55, 0.75, 0, 0, 0, 0.06);
        box(g, mat('#dfe7ec', { roughness: 0.2 }), 1.5, 0.01, 0.55, 0, 0.55);
        cyl(g, mat('#c0c4c8', { metalness: 0.8, roughness: 0.2 }, 'Armatur'), 0.02, 0.02, 0.12, -0.75, 0.55, 0);
        return g;
    },
    shower: () => {
        const g = G();
        box(g, mat('#f2f2f0', { roughness: 0.3 }, 'Wanne'), 0.9, 0.06, 0.9);
        const glass = mat('#cfe3ee', { transparent: true, opacity: 0.35, roughness: 0.05 }, 'Glas');
        box(g, glass, 0.9, 1.95, 0.01, 0, 0.06, 0.445);
        box(g, glass, 0.01, 1.95, 0.9, 0.445, 0.06, 0);
        const chrome = mat('#c0c4c8', { metalness: 0.8, roughness: 0.2 }, 'Armatur');
        cyl(g, chrome, 0.012, 0.012, 1.1, -0.42, 0.9, -0.42);
        cyl(g, chrome, 0.1, 0.1, 0.02, -0.33, 2.0, -0.33);
        return g;
    },
    toilet: () => {
        const g = G();
        const white = mat('#f6f6f4', { roughness: 0.3 }, 'Keramik');
        box(g, white, 0.36, 0.38, 0.4, 0, 0, 0.05, 0.08);
        box(g, white, 0.4, 0.04, 0.5, 0, 0.38, 0.06, 0.15);
        box(g, white, 0.4, 0.35, 0.16, 0, 0.42, -0.2, 0.04);
        return g;
    },
    washbasin: () => {
        const g = G();
        box(g, mat('#7a5a3c', { roughness: 0.6 }, 'Unterschrank'), 0.8, 0.5, 0.45, 0, 0.35);
        box(g, mat('#f6f6f4', { roughness: 0.3 }, 'Becken'), 0.82, 0.08, 0.47, 0, 0.85, 0, 0.03);
        cyl(g, mat('#c0c4c8', { metalness: 0.8, roughness: 0.2 }, 'Armatur'), 0.015, 0.015, 0.16, 0, 0.93, -0.16);
        return g;
    },
    washingMachine: () => {
        const g = G();
        box(g, mat('#f4f5f6', { roughness: 0.4 }, 'Gehäuse'), 0.6, 0.85, 0.6);
        cyl(g, mat('#9aa3ad', { metalness: 0.5 }, 'Bullauge'), 0.17, 0.17, 0.03, 0, 0.4, 0.3, 32).rotation.x = Math.PI / 2;
        cyl(g, mat('#22313c', { roughness: 0.1 }), 0.13, 0.13, 0.035, 0, 0.4, 0.3, 32).rotation.x = Math.PI / 2;
        box(g, mat('#d8dbde'), 0.56, 0.08, 0.01, 0, 0.74, 0.3);
        return g;
    },
    dishwasher: () => {
        const g = G();
        box(g, mat('#e6e8ea', { roughness: 0.35, metalness: 0.3 }, 'Front'), 0.6, 0.82, 0.58);
        box(g, mat('#8d8d8d', { metalness: 0.7 }, 'Griff'), 0.4, 0.02, 0.03, 0, 0.7, 0.3);
        return g;
    },
    stove: () => {
        const g = G();
        box(g, mat('#e6e8ea', { roughness: 0.35, metalness: 0.3 }, 'Front'), 0.6, 0.85, 0.6);
        box(g, mat('#111', { roughness: 0.15 }, 'Kochfeld'), 0.58, 0.01, 0.52, 0, 0.85);
        box(g, mat('#1d2228', { roughness: 0.1 }, 'Backofentür'), 0.5, 0.42, 0.01, 0, 0.2, 0.301);
        return g;
    },

    // ---------------- lights ----------------
    pendantLamp: () => {
        const g = G();
        cyl(g, mat('#333', {}, 'Baldachin'), 0.05, 0.05, 0.02, 0, 0.98);
        cyl(g, mat('#222'), 0.003, 0.003, 0.7, 0, 0.28);
        emitter(cone(g, mat('#2f3a33', { side: THREE.DoubleSide }, 'Schirm'), 0.2, 0.22, 0, 0.06, 0, 32));
        emitter(sph(g, mat('#fff7e0', {}, 'Leuchtmittel'), 0.05, 0, 0.08, 0));
        return g;
    },
    chandelier: () => {
        const g = G();
        const brass = mat('#c2a46b', { metalness: 0.7, roughness: 0.35 }, 'Messing');
        cyl(g, brass, 0.06, 0.06, 0.02, 0, 0.78);
        cyl(g, brass, 0.008, 0.008, 0.48, 0, 0.3);
        cyl(g, brass, 0.04, 0.03, 0.12, 0, 0.2);
        const bulb = mat('#fff3cf', {}, 'Kerzen');
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const x = Math.cos(a) * 0.32;
            const z = Math.sin(a) * 0.32;
            const arm = box(g, brass, 0.32, 0.015, 0.015, x / 2, 0.24, z / 2);
            arm.rotation.y = -a;
            cyl(g, brass, 0.03, 0.02, 0.04, x, 0.24, z);
            emitter(cyl(g, bulb, 0.012, 0.012, 0.1, x, 0.28, z, 8));
        }
        return g;
    },
    tableLamp: () => {
        const g = G();
        cyl(g, mat('#d8cfc0', { roughness: 0.5 }, 'Fuß'), 0.06, 0.09, 0.28, 0, 0, 0, 20);
        emitter(cyl(g, mat('#f6efe1', { side: THREE.DoubleSide }, 'Schirm'), 0.1, 0.15, 0.2, 0, 0.28, 0, 24));
        return g;
    },
    wallLamp: () => {
        const g = G();
        box(g, mat('#3a3d42', { metalness: 0.4 }, 'Halter'), 0.08, 0.14, 0.02, 0, 0, -0.06);
        const shade = cyl(g, mat('#f3ead7', {}, 'Schirm'), 0.08, 0.08, 0.16, 0, -0.01, 0.01, 24);
        emitter(shade);
        return g;
    },
    arcLamp: () => {
        const g = G();
        const metal = mat('#b9bcc0', { metalness: 0.8, roughness: 0.3 }, 'Metall');
        box(g, mat('#e8e6e2', { roughness: 0.3 }, 'Marmorfuß'), 0.3, 0.06, 0.3, 0, 0, -0.9);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) {
            const t = (i / 20) * Math.PI * 0.62;
            pts.push(new THREE.Vector3(0, 0.06 + Math.sin(t) * 1.9, -0.9 + (1 - Math.cos(t)) * 1.2));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 8), metal);
        tube.castShadow = true;
        g.add(tube);
        const end = pts[pts.length - 1];
        const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c9ccd0', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }, 'Schirm'));
        shade.position.set(0, end.y - 0.18, end.z);
        shade.castShadow = true;
        g.add(emitter(shade));
        return g;
    },
    spot1: () => ceilingSpots(1),
    spot2: () => ceilingSpots(2),
    spot3: () => ceilingSpots(3),
    spot3Round: () => ceilingSpots(3, true),
    recessedSpot: () => {
        const g = G();
        // square trim flush with the ceiling, a tilted (swivelling) spot inside
        box(g, mat('#f0f0f0', {}, 'Rahmen'), 0.09, 0.012, 0.09, 0, 0.02);
        const head = new THREE.Group();
        // the spot sits inside the ceiling, only the trim is flush with it
        head.position.set(0, 0.0, 0);
        head.rotation.x = 0.35;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), mat('#d9d9d9', { metalness: 0.4 }, 'Spot'));
        body.position.y = 0.0;
        head.add(body);
        const light = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 20), mat('#fffaf0', {}, 'Licht'));
        light.position.y = -0.016;
        head.add(emitter(light));
        g.add(head);
        return g;
    },
    downlight: () => {
        const g = G();
        cyl(g, mat('#e9e9e9', {}, 'Ring'), 0.05, 0.05, 0.015, 0, 0.005, 0, 24);
        emitter(cyl(g, mat('#fffaf0', {}, 'Licht'), 0.035, 0.035, 0.005, 0, 0, 0, 24));
        return g;
    },
    ledStrip: () => {
        const g = G();
        box(g, mat('#c0c4c8', { metalness: 0.6 }, 'Profil'), 1.0, 0.012, 0.02);
        emitter(box(g, mat('#fff4e0', {}, 'LED'), 0.98, 0.004, 0.012, 0, 0.012));
        return g;
    },
    bollardLight: () => {
        const g = G();
        const dark = mat('#2f3338', { metalness: 0.4, roughness: 0.5 }, 'Gehäuse');
        cyl(g, dark, 0.07, 0.07, 0.5, 0, 0, 0, 20);
        emitter(cyl(g, mat('#f3f0e6', { transparent: true, opacity: 0.9 }, 'Glas'), 0.065, 0.065, 0.12, 0, 0.5, 0, 20));
        cyl(g, dark, 0.09, 0.09, 0.02, 0, 0.62, 0, 20);
        return g;
    },
    gardenSpot: () => {
        const g = G();
        const dark = mat('#2f3338', { metalness: 0.4 }, 'Gehäuse');
        box(g, dark, 0.02, 0.18, 0.02, 0, 0, 0);
        const head = cyl(g, dark, 0.04, 0.05, 0.1, 0, 0.16, 0.02, 16);
        head.rotation.x = 0.6;
        emitter(cyl(g, mat('#fff6dc', {}, 'Licht'), 0.035, 0.035, 0.01, 0, 0.22, 0.06, 16)).rotation.x = 0.6;
        return g;
    },
    outdoorWallLight: () => {
        const g = G();
        const dark = mat('#2b2e33', { metalness: 0.5, roughness: 0.4 }, 'Gehäuse');
        box(g, dark, 0.12, 0.22, 0.03, 0, 0, -0.08);
        box(g, dark, 0.14, 0.02, 0.16, 0, 0.2, -0.02);
        emitter(box(g, mat('#f6efdc', { transparent: true, opacity: 0.85 }, 'Glas'), 0.11, 0.16, 0.12, 0, 0.04, -0.02));
        return g;
    },
    stringLights: () => {
        const g = G();
        const wire = mat('#2b2b2b', {}, 'Kabel');
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) {
            const x = -1.5 + (i / 20) * 3;
            pts.push(new THREE.Vector3(x, 0.3 - 0.3 * (1 - (x / 1.5) ** 2), 0));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.004, 5), wire));
        const bulb = mat('#ffe7a8', {}, 'Lampen');
        for (let i = 1; i < 20; i += 2) emitter(sph(g, bulb, 0.03, pts[i].x, pts[i].y - 0.04, 0, 1, 1.3, 1, 1));
        return g;
    },
};

/** Moves a model so its bounding box sits on the ground, centred on the pivot (the asset convention). */
function grounded(f: Factory): Factory {
    return () => {
        const g = f();
        const box = new THREE.Box3().setFromObject(g);
        const c = box.getCenter(new THREE.Vector3());
        const inner = new THREE.Group();
        inner.add(...g.children);
        inner.position.set(-c.x, -box.min.y, -c.z);
        g.add(inner);
        return g;
    };
}

/**
 * Ceiling spot light with 1–3 swivelling heads: a round canopy for one head,
 * a bar (or a round plate with `round`) for more; every head points a little outwards.
 */
function ceilingSpots(n: number, round = false): THREE.Group {
    const g = G();
    const finish = mat('#2f3135', { metalness: 0.5, roughness: 0.35 }, 'Gehäuse');
    const top = 0.26;
    if (n === 1 || round) cyl(g, finish, round ? 0.14 : 0.05, round ? 0.14 : 0.05, 0.025, 0, top - 0.025, 0, 32);
    else box(g, finish, 0.2 * n + 0.06, 0.025, 0.06, 0, top - 0.025, 0);
    for (let i = 0; i < n; i++) {
        const x = round ? Math.cos((i / n) * Math.PI * 2) * 0.08 : (i - (n - 1) / 2) * 0.2;
        const z = round ? Math.sin((i / n) * Math.PI * 2) * 0.08 : 0;
        cyl(g, finish, 0.008, 0.008, 0.08, x, top - 0.1, z, 8);
        const head = new THREE.Group();
        head.position.set(x, top - 0.12, z);
        // tilt every head a bit outwards (or alternately for a bar)
        const out = round ? Math.atan2(z, x) : 0;
        head.rotation.set(round ? 0 : 0.35 * (i % 2 ? -1 : 1), -out, round ? 0.35 : 0);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 20), finish);
        body.castShadow = true;
        head.add(body);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 20), mat('#fff6e0', {}, 'Licht'));
        lens.position.y = -0.056;
        head.add(emitter(lens));
        g.add(head);
    }
    return g;
}

export const MORE: Record<string, Factory> = Object.fromEntries(Object.entries(RAW).map(([k, f]) => [k, grounded(f)]));

export const MORE_META: Omit<AssetMeta, 'size'>[] = [
    // indoor plants
    { id: 'builtin:monstera', name: 'Monstera', category: 'plant', mount: 'floor' },
    { id: 'builtin:ficus', name: 'Ficus (Birkenfeige)', category: 'plant', mount: 'floor' },
    { id: 'builtin:kentiaPalm', name: 'Zimmerpalme', category: 'plant', mount: 'floor' },
    { id: 'builtin:snakePlant', name: 'Bogenhanf', category: 'plant', mount: 'floor' },
    { id: 'builtin:cactus', name: 'Kaktus', category: 'plant', mount: 'floor' },
    { id: 'builtin:tablePlant', name: 'Tischpflanze', category: 'plant', mount: 'floor' },
    { id: 'builtin:flowerPot', name: 'Blumentopf (blühend)', category: 'plant', mount: 'floor' },
    // garden
    { id: 'builtin:deciduousTree', name: 'Laubbaum', category: 'garden', mount: 'floor' },
    { id: 'builtin:fruitTree', name: 'Obstbaum', category: 'garden', mount: 'floor' },
    { id: 'builtin:conifer', name: 'Nadelbaum', category: 'garden', mount: 'floor' },
    { id: 'builtin:thuja', name: 'Thuja / Säulenbaum', category: 'garden', mount: 'floor' },
    { id: 'builtin:bamboo', name: 'Bambus', category: 'garden', mount: 'floor' },
    { id: 'builtin:bush', name: 'Strauch', category: 'garden', mount: 'floor' },
    { id: 'builtin:hedge', name: 'Hecke (2 m)', category: 'garden', mount: 'floor' },
    { id: 'builtin:roseBush', name: 'Rosenbusch', category: 'garden', mount: 'floor' },
    { id: 'builtin:lavender', name: 'Lavendel', category: 'garden', mount: 'floor' },
    { id: 'builtin:ornamentalGrass', name: 'Ziergras', category: 'garden', mount: 'floor' },
    { id: 'builtin:flowerBed', name: 'Blumenbeet', category: 'garden', mount: 'floor' },
    { id: 'builtin:raisedBed', name: 'Hochbeet', category: 'garden', mount: 'floor' },
    { id: 'builtin:gardenTable', name: 'Gartentisch', category: 'garden', mount: 'floor' },
    { id: 'builtin:gardenChair', name: 'Gartenstuhl', category: 'garden', mount: 'floor' },
    { id: 'builtin:gardenBench', name: 'Gartenbank', category: 'garden', mount: 'floor' },
    { id: 'builtin:lounger', name: 'Sonnenliege', category: 'garden', mount: 'floor' },
    { id: 'builtin:parasol', name: 'Sonnenschirm', category: 'garden', mount: 'floor' },
    { id: 'builtin:grill', name: 'Kugelgrill', category: 'garden', mount: 'floor' },
    { id: 'builtin:firePit', name: 'Feuerstelle', category: 'garden', mount: 'floor' },
    // furniture
    { id: 'builtin:cornerSofa', name: 'Ecksofa', category: 'furniture', mount: 'floor' },
    { id: 'builtin:bookshelf', name: 'Bücherregal', category: 'furniture', mount: 'floor' },
    { id: 'builtin:dresser', name: 'Kommode', category: 'furniture', mount: 'floor' },
    { id: 'builtin:nightstand', name: 'Nachttisch', category: 'furniture', mount: 'floor' },
    { id: 'builtin:singleBed', name: 'Einzelbett', category: 'furniture', mount: 'floor' },
    { id: 'builtin:wardrobeSmall', name: 'Schrank (1 m)', category: 'furniture', mount: 'floor' },
    { id: 'builtin:tvBoard', name: 'TV-Board', category: 'furniture', mount: 'floor' },
    { id: 'builtin:roundTable', name: 'Runder Tisch', category: 'furniture', mount: 'floor' },
    { id: 'builtin:barStool', name: 'Barhocker', category: 'furniture', mount: 'floor' },
    { id: 'builtin:officeChair', name: 'Bürostuhl', category: 'furniture', mount: 'floor' },
    { id: 'builtin:coatRack', name: 'Garderobe', category: 'furniture', mount: 'wall' },
    { id: 'builtin:mirror', name: 'Spiegel', category: 'decor', mount: 'wall' },
    { id: 'builtin:rug', name: 'Teppich', category: 'decor', mount: 'floor' },
    // bathroom & household
    { id: 'builtin:bathtub', name: 'Badewanne', category: 'appliance', mount: 'floor' },
    { id: 'builtin:shower', name: 'Dusche', category: 'appliance', mount: 'floor' },
    { id: 'builtin:toilet', name: 'WC', category: 'appliance', mount: 'wall' },
    { id: 'builtin:washbasin', name: 'Waschtisch', category: 'appliance', mount: 'wall' },
    { id: 'builtin:washingMachine', name: 'Waschmaschine', category: 'appliance', mount: 'floor' },
    { id: 'builtin:dishwasher', name: 'Spülmaschine', category: 'appliance', mount: 'floor' },
    { id: 'builtin:stove', name: 'Herd', category: 'appliance', mount: 'floor' },
    // lights
    { id: 'builtin:pendantLamp', name: 'Pendelleuchte', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:chandelier', name: 'Kronleuchter', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:spot1', name: 'Deckenspot 1-flammig', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:spot2', name: 'Deckenspot 2-flammig', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:spot3', name: 'Deckenspot 3-flammig', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:spot3Round', name: 'Deckenspot 3-flammig (rund)', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:recessedSpot', name: 'Einbauspot (schwenkbar)', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:downlight', name: 'Einbaustrahler', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:tableLamp', name: 'Tischlampe', category: 'lighting', mount: 'floor' },
    { id: 'builtin:arcLamp', name: 'Bogenleuchte', category: 'lighting', mount: 'floor' },
    { id: 'builtin:wallLamp', name: 'Wandleuchte', category: 'lighting', mount: 'wall' },
    { id: 'builtin:ledStrip', name: 'LED-Leiste (1 m)', category: 'lighting', mount: 'ceiling' },
    { id: 'builtin:outdoorWallLight', name: 'Außenwandleuchte', category: 'lighting', mount: 'wall' },
    { id: 'builtin:bollardLight', name: 'Pollerleuchte', category: 'lighting', mount: 'floor' },
    { id: 'builtin:gardenSpot', name: 'Gartenstrahler', category: 'lighting', mount: 'floor' },
    { id: 'builtin:stringLights', name: 'Lichterkette (3 m)', category: 'lighting', mount: 'floor' },
];
