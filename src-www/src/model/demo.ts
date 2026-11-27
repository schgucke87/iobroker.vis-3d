import type { Floor, Project, Vec2 } from './types';
import * as ops from './ops';
import { newFloor } from './store';
import { projectOnSegment } from '../geometry/vec';
import { builtinAssets } from '../assets/builtin';

const OUTER = { thickness: 0.36, height: 2.6 };
const INNER = { thickness: 0.115, height: 2.6 };

function wall(f: Floor, a: Vec2, b: Vec2, d = INNER) {
    ops.addWall(f, { kind: 'point', point: a }, { kind: 'point', point: b }, d);
}

function poly(f: Floor, pts: Vec2[], d = OUTER) {
    for (let i = 0; i < pts.length; i++) wall(f, pts[i], pts[(i + 1) % pts.length], d);
}

/** Places an opening on the wall that passes through point p. */
function opening(f: Floor, type: 'door' | 'window', p: Vec2, width?: number) {
    for (const w of Object.values(f.walls)) {
        const a = f.nodes[w.a];
        const b = f.nodes[w.b];
        const pr = projectOnSegment(p, [a.x, a.y], [b.x, b.y]);
        if (pr.distance < 1e-3) {
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            ops.addOpening(f, w.id, { ...ops.OPENING_PRESETS[type], ...(width ? { width } : {}), offset: pr.t * l });
            return;
        }
    }
}

function room(f: Floor, name: string, anchor: Vec2, enumId?: string) {
    const id = ops.uid('r');
    f.rooms[id] = { id, name, anchor, enumId };
}

const N = Math.PI; // facing north (-y)
const E = Math.PI / 2; // facing east (+x)
const W = -Math.PI / 2; // facing west (-x)
const S = 0; // facing south (+y)

/** Places a built-in asset; ceiling objects hang from the ceiling. */
function put(f: Floor, asset: string, x: number, y: number, rotation = S, elevation?: number) {
    const meta = builtinAssets().find(a => a.id === `builtin:${asset}`)!;
    const id = ops.uid('o');
    const elev = elevation ?? (meta.mount === 'ceiling' ? f.height - meta.size[1] : 0);
    f.objects[id] = { id, assetId: meta.id, name: meta.name, x, y, elevation: elev, rotation, scale: [1, 1, 1] };
}

export function demoProject(): Project {
    const eg = newFloor('Erdgeschoss');
    eg.height = 2.6;
    poly(eg, [[0, 0], [11, 0], [11, 9], [0, 9]]);
    wall(eg, [6, 0], [6, 9]);
    wall(eg, [0, 5], [6, 5]);
    wall(eg, [6, 4], [11, 4]);
    wall(eg, [8.5, 4], [8.5, 9]);
    opening(eg, 'door', [3, 9], 1.01);
    opening(eg, 'window', [3, 0], 2.0);
    opening(eg, 'window', [0, 2.5], 1.5);
    opening(eg, 'window', [8.5, 0], 1.76);
    opening(eg, 'window', [11, 2], 1.26);
    opening(eg, 'window', [11, 6.5], 0.76);
    opening(eg, 'window', [0, 7], 1.26);
    opening(eg, 'door', [6, 2.5]);
    opening(eg, 'door', [3, 5]);
    opening(eg, 'door', [7.2, 4]);
    opening(eg, 'door', [9.7, 4]);
    opening(eg, 'door', [6, 7]);
    room(eg, 'Wohnzimmer', [3, 2.5], 'enum.rooms.living_room');
    room(eg, 'Flur', [3, 7], 'enum.rooms.corridor');
    room(eg, 'Küche', [8.5, 2], 'enum.rooms.kitchen');
    room(eg, 'Gäste-WC', [7.2, 6.5], 'enum.rooms.wc');
    room(eg, 'Hauswirtschaft', [9.7, 6.5]);
    put(eg, 'sofa', 2.1, 3.7, E);
    put(eg, 'coffeeTable', 3.4, 3.7, E);
    put(eg, 'armchair', 3.4, 2.2, S);
    put(eg, 'floorLamp', 0.6, 4.5);
    put(eg, 'plant', 5.4, 0.6);
    put(eg, 'sideboard', 5.72, 3.7, W);
    put(eg, 'tv', 5.92, 3.7, W, 0.95);
    put(eg, 'ceilingLamp', 3, 2.5);
    put(eg, 'kitchen', 7.5, 0.49, S);
    put(eg, 'fridge', 9.25, 0.51, S);
    put(eg, 'diningTable', 8.5, 2.65);
    put(eg, 'chair', 8.1, 1.95, S);
    put(eg, 'chair', 8.9, 1.95, S);
    put(eg, 'chair', 8.1, 3.35, N);
    put(eg, 'chair', 8.9, 3.35, N);
    put(eg, 'ceilingLamp', 8.5, 2.65);

    const og = newFloor('Obergeschoss');
    og.height = 2.5;
    const d = { ...OUTER, height: 2.5 };
    const di = { ...INNER, height: 2.5 };
    poly(og, [[0, 0], [11, 0], [11, 9], [0, 9]], d);
    wall(og, [5, 0], [5, 9], di);
    wall(og, [5, 4.5], [11, 4.5], di);
    wall(og, [0, 6], [5, 6], di);
    opening(og, 'window', [2.5, 0], 1.5);
    opening(og, 'window', [8, 0], 1.5);
    opening(og, 'window', [11, 6.7], 1.26);
    opening(og, 'window', [2.5, 9], 1.0);
    opening(og, 'window', [0, 3], 1.26);
    opening(og, 'door', [5, 3]);
    opening(og, 'door', [8, 4.5]);
    opening(og, 'door', [2.5, 6]);
    room(og, 'Schlafzimmer', [2.5, 3], 'enum.rooms.sleeping_room');
    room(og, 'Kinderzimmer', [8, 2.2], 'enum.rooms.nursery');
    room(og, 'Bad', [2.5, 7.5], 'enum.rooms.bathroom');
    room(og, 'Arbeitszimmer', [8, 6.7], 'enum.rooms.office');
    put(og, 'bed', 2.5, 1.24, S);
    put(og, 'wardrobe', 4.64, 4.6, W);
    put(og, 'plant', 0.5, 5.4);
    put(og, 'desk', 10.46, 8.0, W);
    put(og, 'chair', 9.85, 8.0, E);
    put(og, 'sideboard', 6.0, 8.6, N);
    put(og, 'bed', 9.5, 1.9, W);
    put(og, 'ceilingLamp', 2.5, 3);

    return { version: 1, name: 'Beispielhaus', floors: [eg, og], assets: {} };
}
