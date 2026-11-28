/**
 * Parametric stairs between two storeys, and the loft ladder.
 *
 * A stair is an ordinary scene object whose asset id carries its parameters
 * ("stair:{…json…}"), so moving, rotating, selecting and undo work like for
 * furniture. Model convention as for all assets: metres, Y up, pivot at the
 * bottom centre; the stair starts at the front (+Z) and climbs towards -Z.
 */
import * as THREE from 'three';
import type { AssetMeta } from '../model/types';

export type StairType = 'straight' | 'quarterLeft' | 'quarterRight' | 'half' | 'spiral' | 'loft';
export type Railing = 'none' | 'left' | 'right' | 'both';

export interface StairParams {
    type: StairType;
    /** Height to climb (floor to floor), m. */
    height: number;
    /** Number of risers (the last one ends on the upper floor). */
    steps: number;
    /** Clear width of a flight (spiral: tread length), m. */
    width: number;
    /** Tread depth ("Auftritt"), m. */
    going: number;
    railing: Railing;
}

export const STAIR_TYPES: Record<StairType, string> = {
    straight: 'Gerade',
    quarterLeft: 'Viertelgewendelt links (L)',
    quarterRight: 'Viertelgewendelt rechts (L)',
    half: 'Halbgewendelt (U)',
    spiral: 'Wendeltreppe',
    loft: 'Dachbodentreppe (Bodentreppe)',
};

export const RAILINGS: Record<Railing, string> = { none: 'Kein', left: 'Links', right: 'Rechts', both: 'Beidseitig' };

/** Usual risers for a height: about 18 cm each (loft ladders: about 24 cm). */
export const defaultSteps = (height: number, type: StairType = 'straight') => Math.max(3, Math.round(height / (type === 'loft' ? 0.24 : 0.18)));

export function defaultStair(type: StairType, height: number): StairParams {
    return {
        type,
        height,
        steps: defaultSteps(height, type),
        width: type === 'loft' ? 0.6 : type === 'spiral' ? 0.8 : 1.0,
        going: type === 'loft' ? 0.2 : type === 'spiral' ? 0.25 : 0.27,
        railing: type === 'loft' ? 'none' : type === 'spiral' ? 'right' : 'right',
    };
}

const PREFIX = 'stair:';
export const isStairId = (id: string) => id.startsWith(PREFIX);
export const stairAssetId = (p: StairParams) => PREFIX + JSON.stringify(p);
export function parseStairId(id: string): StairParams | null {
    if (!isStairId(id)) return null;
    try {
        return { ...defaultStair('straight', 2.8), ...(JSON.parse(id.slice(PREFIX.length)) as Partial<StairParams>) };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------

const wood = () => new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.6, name: 'Stufen' });
const stringerMat = () => new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.7, name: 'Wangen' });
const railMat = () => new THREE.MeshStandardMaterial({ color: '#5b6068', roughness: 0.35, metalness: 0.6, name: 'Geländer' });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, name = '') {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    o.receiveShadow = true;
    o.name = name;
    return o;
}

/** A slanted bar from a to b (stringers, handrails). */
function bar(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
    const len = a.distanceTo(b);
    const o = mesh(new THREE.BoxGeometry(w, h, len), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    // a mesh without parent looks along +z at the target: the box's length axis
    o.lookAt(b);
    return o;
}

interface Mats {
    tread: THREE.Material;
    stringer: THREE.Material;
    rail: THREE.Material;
}

/**
 * One straight flight in its own frame: starting at z = 0, climbing towards -z, `count` treads,
 * the first one at riser `first + 1`. Railing sides: -1 = left (−x), +1 = right.
 */
function flight(m: Mats, count: number, first: number, rise: number, going: number, width: number, sides: number[], stringers = true) {
    const g = new THREE.Group();
    const t = 0.04;
    for (let k = 0; k < count; k++) {
        const top = (first + k + 1) * rise;
        const tread = mesh(new THREE.BoxGeometry(width, t, going + 0.03), m.tread, 'tread');
        tread.position.set(0, top - t / 2, -(k * going + going / 2) + 0.015);
        g.add(tread);
    }
    if (count > 0 && stringers) {
        const y0 = first * rise;
        const y1 = (first + count) * rise;
        const z1 = -count * going;
        for (const sx of [-1, 1]) {
            const s = bar(m.stringer, new THREE.Vector3((sx * (width + 0.05)) / 2, y0 + 0.05, 0.02), new THREE.Vector3((sx * (width + 0.05)) / 2, y1 - 0.02, z1), 0.05, 0.25);
            g.add(s);
        }
    }
    for (const side of sides) {
        const x = (side * (width + 0.05)) / 2;
        const a = new THREE.Vector3(x, first * rise + 0.9 + rise, -going * 0.3);
        const b = new THREE.Vector3(x, (first + count) * rise + 0.9, -count * going + going * 0.3);
        if (count < 1) continue;
        g.add(bar(m.rail, a, b, 0.04, 0.04));
        const posts = Math.max(2, Math.round(count * going) + 1);
        for (let i = 0; i < posts; i++) {
            const f = i / (posts - 1);
            const p = a.clone().lerp(b, f);
            const post = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 8), m.rail);
            post.position.set(x, p.y - 0.45, p.z);
            g.add(post);
        }
    }
    return g;
}

const sidesFor = (r: Railing): number[] => (r === 'both' ? [-1, 1] : r === 'left' ? [-1] : r === 'right' ? [1] : []);

function landing(m: Mats, w: number, d: number, top: number, x: number, z: number) {
    const o = mesh(new THREE.BoxGeometry(w, 0.12, d), m.tread, 'tread');
    o.position.set(x, top - 0.06, z);
    return o;
}

function straight(p: StairParams, m: Mats) {
    const rise = p.height / p.steps;
    return flight(m, p.steps - 1, 0, rise, p.going, p.width, sidesFor(p.railing));
}

function quarter(p: StairParams, m: Mats, left: boolean) {
    const g = new THREE.Group();
    const rise = p.height / p.steps;
    const treads = p.steps - 1;
    const k1 = Math.max(1, Math.floor((treads - 1) / 2));
    const k2 = treads - 1 - k1;
    const w = p.width;
    const dir = left ? -1 : 1;
    // the outer side of the turn gets the railing on "outer" choices
    g.add(flight(m, k1, 0, rise, p.going, w, sidesFor(p.railing)));
    g.add(landing(m, w, w, (k1 + 1) * rise, 0, -k1 * p.going - w / 2));
    const f2 = flight(m, k2, k1 + 1, rise, p.going, w, sidesFor(p.railing));
    f2.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
    f2.position.set((dir * w) / 2, 0, -k1 * p.going - w / 2);
    g.add(f2);
    return g;
}

function half(p: StairParams, m: Mats) {
    const g = new THREE.Group();
    const rise = p.height / p.steps;
    const treads = p.steps - 1;
    const k1 = Math.max(1, Math.floor((treads - 1) / 2));
    const k2 = treads - 1 - k1;
    const w = p.width;
    const gap = 0.1;
    const xr = (w + gap) / 2;
    const f1 = flight(m, k1, 0, rise, p.going, w, p.railing === 'none' ? [] : [1]);
    f1.position.x = xr;
    g.add(f1);
    g.add(landing(m, 2 * w + gap, w, (k1 + 1) * rise, 0, -k1 * p.going - w / 2));
    const f2 = flight(m, k2, k1 + 1, rise, p.going, w, p.railing === 'none' ? [] : [1]);
    f2.rotation.y = Math.PI;
    f2.position.set(-xr, 0, -k1 * p.going);
    g.add(f2);
    return g;
}

function spiral(p: StairParams, m: Mats) {
    const g = new THREE.Group();
    const rise = p.height / p.steps;
    const treads = p.steps - 1;
    const R = p.width + 0.08;
    const step = THREE.MathUtils.degToRad(Math.min(30, Math.max(18, 330 / treads)));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, p.height, 16), m.rail).translateY(p.height / 2));
    const railPts: THREE.Vector3[] = [];
    for (let k = 0; k < treads; k++) {
        // a wedge-shaped tread from the pole to the outer radius
        const a0 = k * step - 0.04;
        const a1 = (k + 1) * step + 0.04;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
        shape.absarc(0, 0, R, a0, a1, false);
        shape.lineTo(0, 0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
        geo.rotateX(-Math.PI / 2);
        const tread = mesh(geo, m.tread, 'tread');
        // start at the front (+z), turning counter-clockwise seen from above
        tread.rotation.y = -Math.PI / 2;
        tread.position.y = (k + 1) * rise - 0.04;
        g.add(tread);
        // handrail point above the outer end of the tread, transformed like the tread shape
        const am = (k + 0.5) * step;
        const v = new THREE.Vector3(Math.cos(am) * (R - 0.03), Math.sin(am) * (R - 0.03), 0)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        railPts.push(new THREE.Vector3(v.x, (k + 1) * rise + 0.9, v.z));
    }
    if (p.railing !== 'none' && railPts.length > 1) {
        const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), treads * 4, 0.02, 6), m.rail);
        g.add(tube);
        railPts.forEach((pt, i) => {
            if (i % 2) return;
            const post = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), m.rail);
            post.position.set(pt.x, pt.y - 0.45, pt.z);
            g.add(post);
        });
    }
    return g;
}

/** A folding loft ladder hanging from a ceiling hatch (about 65°). */
function loft(p: StairParams, m: Mats) {
    const g = new THREE.Group();
    const angle = THREE.MathUtils.degToRad(65);
    const run = p.height / Math.tan(angle);
    const rise = p.height / p.steps;
    const w = p.width;
    // rails from the floor (front) up to the hatch edge (back)
    for (const sx of [-1, 1]) g.add(bar(m.stringer, new THREE.Vector3((sx * (w + 0.04)) / 2, 0.02, 0), new THREE.Vector3((sx * (w + 0.04)) / 2, p.height, -run), 0.03, 0.1));
    for (let k = 1; k < p.steps; k++) {
        const y = k * rise;
        const tread = mesh(new THREE.BoxGeometry(w, 0.025, 0.11), m.tread, 'tread');
        tread.position.set(0, y, -(y / p.height) * run);
        g.add(tread);
    }
    // hatch frame in the ceiling and the open lid hanging under the upper ladder part
    const hatchLen = Math.max(1.0, run + 0.25);
    const frame = mesh(new THREE.BoxGeometry(w + 0.16, 0.03, hatchLen), m.stringer);
    frame.position.set(0, p.height - 0.015, -run + hatchLen / 2 - 0.1);
    g.add(frame);
    const lid = bar(m.stringer, new THREE.Vector3(0, p.height - 0.05, -run - 0.05), new THREE.Vector3(0, p.height - 0.05 - Math.sin(angle) * 1.0, -run - 0.05 + Math.cos(angle) * 1.0), w + 0.1, 0.025);
    lid.position.x = 0;
    lid.translateY(-0.06);
    g.add(lid);
    return g;
}

/** The stair model, moved so its bounding box is centred on the pivot and stands on y = 0. */
export function buildStair(p: StairParams): THREE.Group {
    const m: Mats = { tread: wood(), stringer: stringerMat(), rail: railMat() };
    const steps = Math.max(2, Math.round(p.steps));
    const q = { ...p, steps };
    const inner =
        q.type === 'quarterLeft'
            ? quarter(q, m, true)
            : q.type === 'quarterRight'
              ? quarter(q, m, false)
              : q.type === 'half'
                ? half(q, m)
                : q.type === 'spiral'
                  ? spiral(q, m)
                  : q.type === 'loft'
                    ? loft(q, m)
                    : straight(q, m);
    const g = new THREE.Group();
    g.add(inner);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.x -= c.x;
    inner.position.z -= c.z;
    inner.position.y -= Math.max(0, box.min.y);
    return g;
}

const metaCache = new Map<string, AssetMeta>();

/** Asset metadata of a stair (size measured from its model). */
export function stairMeta(id: string): AssetMeta | undefined {
    const hit = metaCache.get(id);
    if (hit) return hit;
    const p = parseStairId(id);
    if (!p) return undefined;
    const obj = buildStair(p);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.traverse(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    const meta: AssetMeta = {
        id,
        name: p.type === 'loft' ? 'Dachbodentreppe' : 'Treppe',
        category: 'other',
        mount: 'floor',
        size: [size.x, Math.min(size.y, p.height + 1.1), size.z],
    };
    metaCache.set(id, meta);
    return meta;
}

/**
 * Tread outlines of a stair in its local plan frame (x, z), for the 2D symbol:
 * the four top corners of every tread.
 */
export function stairTreadOutlines(id: string): [number, number][][] {
    const p = parseStairId(id);
    if (!p) return [];
    const g = buildStair(p);
    g.updateMatrixWorld(true);
    const out: [number, number][][] = [];
    g.traverse(o => {
        const mm = o as THREE.Mesh;
        if (!mm.isMesh || mm.name !== 'tread') return;
        const geo = mm.geometry;
        geo.computeBoundingBox();
        const b = geo.boundingBox!;
        const corners = [
            [b.min.x, b.min.z],
            [b.max.x, b.min.z],
            [b.max.x, b.max.z],
            [b.min.x, b.max.z],
        ];
        if (geo.type === 'ExtrudeGeometry') {
            // wedge treads: use the real outline points
            const pos = geo.attributes.position;
            const pts: [number, number][] = [];
            for (let i = 0; i < pos.count; i++) {
                const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mm.matrixWorld);
                if (Math.abs(v.y - (b.max.y + mm.matrixWorld.elements[13])) < 1e-3) pts.push([v.x, v.z]);
            }
            out.push(convexHull(pts));
        } else {
            out.push(corners.map(([x, z]) => {
                const v = new THREE.Vector3(x, b.max.y, z).applyMatrix4(mm.matrixWorld);
                return [v.x, v.z] as [number, number];
            }));
        }
    });
    g.traverse(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    return out;
}

function convexHull(points: [number, number][]): [number, number][] {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: [number, number][] = [];
    for (const p of pts.reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}
