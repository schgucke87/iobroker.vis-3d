import * as THREE from 'three';
import type { Vec2 } from '../model/types';
import { clampOpening, type WallFrame } from './walls';

/** Material slots of a wall mesh. */
export const WALL_RIGHT = 0;
export const WALL_LEFT = 1;
export const WALL_EDGE = 2;

/**
 * Builds a wall mesh: the wall's side profile (u along the wall, v up) with
 * openings cut out as holes is extruded through the wall thickness. The end
 * vertices are then shifted to the mitred corner positions, and the result
 * is placed in world space (plan x → X, plan y → Z, v → Y).
 *
 * `bottom` is negative for walls that also cover the slab below the storey,
 * so the facade has no gap between storeys.
 */
/**
 * `top` optionally replaces the flat top edge: (u, height) points from u = 0
 * to u = length, e.g. a gable following the roof.
 */
export function buildWallGeometry(frame: WallFrame, bottom: number, top?: [number, number][]): THREE.BufferGeometry {
    const { wall, length: L } = frame;
    const H = wall.height;
    const t = wall.thickness;
    const profile: [number, number][] = top && top.length >= 2 ? top : [[0, H], [L, H]];
    const topAt = (u: number) => {
        for (let i = 1; i < profile.length; i++) {
            const [u0, h0] = profile[i - 1];
            const [u1, h1] = profile[i];
            if (u <= u1 || i === profile.length - 1) return u1 - u0 < 1e-9 ? h1 : h0 + ((h1 - h0) * (u - u0)) / (u1 - u0);
        }
        return H;
    };

    const shape = new THREE.Shape();
    shape.moveTo(0, bottom);
    shape.lineTo(L, bottom);
    for (let i = profile.length - 1; i >= 0; i--) shape.lineTo(profile[i][0], profile[i][1]);
    shape.closePath();
    for (const raw of wall.openings) {
        const o = clampOpening(raw, frame);
        const x0 = o.offset - o.width / 2;
        const x1 = o.offset + o.width / 2;
        // a door on the ground floor would touch the profile's bottom edge, which
        // breaks triangulation; keep a hairline of material instead
        const y0 = Math.max(o.sill, bottom + 0.001);
        // under a sloping roof the opening must stay below the wall's top edge
        const y1 = Math.min(o.sill + o.height, Math.min(topAt(x0), topAt(x1), topAt(o.offset)) - 0.05);
        if (y1 <= y0 + 0.05) continue;
        const hole = new THREE.Path();
        hole.moveTo(x0, y0);
        hole.lineTo(x0, y1);
        hole.lineTo(x1, y1);
        hole.lineTo(x1, y0);
        hole.closePath();
        shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
    // ExtrudeGeometry puts both lids (= the two wall faces) in group 0, first the z = 0 lid (right
    // side), then the z = t lid (left side); group 1 holds the edges (top, ends, opening reveals).
    // Split them into material 0 = right face, 1 = left face, 2 = edges.
    const [lids, edges] = geo.groups;
    geo.clearGroups();
    geo.addGroup(lids.start, lids.count / 2, WALL_RIGHT);
    geo.addGroup(lids.start + lids.count / 2, lids.count / 2, WALL_LEFT);
    if (edges) geo.addGroup(edges.start, edges.count, WALL_EDGE);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const [dx, dy] = frame.dir;
    const [nx, ny] = frame.normal;
    const [sx, sy] = frame.start;
    for (let i = 0; i < pos.count; i++) {
        let u = pos.getX(i);
        const v = pos.getY(i);
        const z = pos.getZ(i);
        const side = z / t; // 0 = right side, 1 = left side
        if (Math.abs(u) < 1e-7) u = frame.uStartRight + (frame.uStartLeft - frame.uStartRight) * side;
        else if (Math.abs(u - L) < 1e-7) u = frame.uEndRight + (frame.uEndLeft - frame.uEndRight) * side;
        const w = z - t / 2;
        pos.setXYZ(i, sx + dx * u + nx * w, v, sy + dy * u + ny * w);
    }
    pos.needsUpdate = true;
    geo.deleteAttribute('normal');
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}

/** A prism over a plan polygon from y0 to y1 (hub fillers, floor slabs). */
export function buildPrism(polygon: Vec2[], y0: number, y1: number): THREE.BufferGeometry {
    // Shape in (x, -y) so that rotating by -90° about X maps it to plan (x, z) facing up.
    const shape = new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, -y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0, 0);
    geo.computeVertexNormals();
    return geo;
}

/** Rotation about Y that aligns local +X with the plan direction (dx, dy). */
export const yawFor = (dir: Vec2): number => -Math.atan2(dir[1], dir[0]);

/**
 * Roof planes (underside polygons, points as [x, height, plan y]) as slabs of
 * the given thickness, with UVs in metres for tiled textures.
 */
export function buildRoofGeometry(planes: { points: [number, number, number][] }[], thickness: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: [number, number], ub: [number, number], uc: [number, number]) => {
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        uv.push(...ua, ...ub, ...uc);
    };
    for (const plane of planes) {
        const bottom = plane.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        if (bottom.length < 3) continue;
        const n = new THREE.Vector3().subVectors(bottom[1], bottom[0]).cross(new THREE.Vector3().subVectors(bottom[2], bottom[0])).normalize();
        if (n.y < 0) {
            n.negate();
            bottom.reverse();
        }
        const top = bottom.map(p => p.clone().addScaledVector(n, thickness));
        // texture axes in the plane: along the eaves and up the slope
        let e1 = new THREE.Vector3().crossVectors(n, up);
        if (e1.lengthSq() < 1e-8) e1 = new THREE.Vector3(1, 0, 0);
        e1.normalize();
        const e2 = new THREE.Vector3().crossVectors(e1, n).normalize();
        const uvOf = (p: THREE.Vector3): [number, number] => [p.dot(e1), p.dot(e2)];
        // top (seen from above: counter-clockwise) and underside (reversed), as fans
        // the points run counter-clockwise around n: (p0, pi, pi+1) faces along n
        for (let i = 1; i + 1 < top.length; i++) {
            tri(top[0], top[i], top[i + 1], uvOf(top[0]), uvOf(top[i]), uvOf(top[i + 1]));
            tri(bottom[0], bottom[i + 1], bottom[i], uvOf(bottom[0]), uvOf(bottom[i + 1]), uvOf(bottom[i]));
        }
        // edges, facing outwards
        for (let i = 0; i < bottom.length; i++) {
            const j = (i + 1) % bottom.length;
            const len = bottom[i].distanceTo(bottom[j]);
            tri(bottom[i], bottom[j], top[j], [0, 0], [len, 0], [len, thickness]);
            tri(bottom[i], top[j], top[i], [0, 0], [len, thickness], [0, thickness]);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
}
