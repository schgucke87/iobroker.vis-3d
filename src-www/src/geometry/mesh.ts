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
export function buildWallGeometry(frame: WallFrame, bottom: number): THREE.BufferGeometry {
    const { wall, length: L } = frame;
    const H = wall.height;
    const t = wall.thickness;

    const shape = new THREE.Shape();
    shape.moveTo(0, bottom);
    shape.lineTo(L, bottom);
    shape.lineTo(L, H);
    shape.lineTo(0, H);
    shape.closePath();
    for (const raw of wall.openings) {
        const o = clampOpening(raw, frame);
        const x0 = o.offset - o.width / 2;
        const x1 = o.offset + o.width / 2;
        // a door on the ground floor would touch the profile's bottom edge, which
        // breaks triangulation; keep a hairline of material instead
        const y0 = Math.max(o.sill, bottom + 0.001);
        const y1 = o.sill + o.height;
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
