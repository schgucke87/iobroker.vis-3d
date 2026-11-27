/**
 * Suggestions: turns the devices ioBroker knows per room (type-detector)
 * into concrete edits of the 3D project — bind window/door contacts and
 * roller shutters to openings, show room climate, place or wire lamps.
 */
import type { Behavior, DetectedRoom, Floor, Opening, Project, SceneObject, Vec2 } from './types';
import type { DetectedDevice, DetectionResult } from '../iobroker/devices';
import { isSupported } from '../iobroker/devices';
import { detectRooms } from '../geometry/rooms';
import { computeWallGeometry, pointOnWall, clampOpening } from '../geometry/walls';
import { pointInPolygon, projectOnSegment } from '../geometry/vec';
import { projectStateIds } from '../iobroker/connect';
import { builtinAssets } from '../assets/builtin';
import { findAsset } from './store';
import { newBehavior } from './behaviors';
import { uid } from './ops';

export interface RoomRef {
    key: string;
    floorId: string;
    floorName: string;
    name: string;
    room: DetectedRoom;
}

export interface Target {
    id: string;
    label: string;
}

export type SuggestionKind = 'climate' | 'contact' | 'blind' | 'light';

export interface Suggestion {
    key: string;
    kind: SuggestionKind;
    device: DetectedDevice;
    room: RoomRef;
    title: string;
    /** What happens, for the default target. */
    description: string;
    targets: Target[];
    defaultTarget?: string;
    /** Set when nothing in the 3D room fits (e.g. no window for a window contact). */
    disabledReason?: string;
}

export interface SuggestionResult {
    suggestions: Suggestion[];
    /** ioBroker rooms with supported devices that match no 3D room. */
    unmatched: { id: string; name: string; devices: number }[];
    /** Devices vis-3d cannot show yet (motion detectors, sockets, …). */
    unsupported: DetectedDevice[];
    /** Devices whose datapoints are already used in the project. */
    alreadyBound: number;
}

export const NEW_LAMP = 'new';

const roomKey = (floorId: string, r: DetectedRoom) => `${floorId}|${r.meta?.id ?? r.centroid.map(v => v.toFixed(2)).join(',')}`;

/** All rooms of all floors. */
export function projectRooms(project: Project): RoomRef[] {
    return project.floors.flatMap(f =>
        detectRooms(f).map(r => ({
            key: roomKey(f.id, r),
            floorId: f.id,
            floorName: f.name,
            name: r.meta?.name ?? 'Raum',
            room: r,
        })),
    );
}

export const normalizeName = (s: string) =>
    s
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '');

/**
 * Matches an ioBroker room to a 3D room: an explicit choice first, then the
 * room linked to that enum, then the same name.
 */
export function matchRoom(rooms: RoomRef[], e: { id: string; name: string }, overrides: Record<string, string>): RoomRef | null {
    if (e.id in overrides) return rooms.find(r => r.key === overrides[e.id]) ?? null;
    const byEnum = rooms.find(r => r.room.meta?.enumId === e.id);
    if (byEnum) return byEnum;
    const n = normalizeName(e.name);
    const tail = normalizeName(e.id.split('.').pop() ?? '');
    return rooms.find(r => r.room.meta && (normalizeName(r.name) === n || normalizeName(r.name) === tail)) ?? null;
}

interface OpeningRef {
    id: string;
    floorId: string;
    opening: Opening;
    center: Vec2;
}

/** Openings in the walls around a room. */
function roomOpenings(floor: Floor, room: DetectedRoom): OpeningRef[] {
    const frames = computeWallGeometry(floor).frames;
    const result: OpeningRef[] = [];
    for (const fr of Object.values(frames)) {
        for (const raw of fr.wall.openings) {
            const o = clampOpening(raw, fr);
            const c = pointOnWall(fr, o.offset);
            const onBoundary = room.polygon.some((p, i) => projectOnSegment(c, p, room.polygon[(i + 1) % room.polygon.length]).distance < 0.02);
            if (onBoundary) result.push({ id: raw.id, floorId: floor.id, opening: raw, center: c });
        }
    }
    return result;
}

const COMPASS = ['Ost', 'Süd', 'West', 'Nord'];
function compass(from: Vec2, to: Vec2): string {
    // plan y points south
    const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
    return COMPASS[((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4];
}

const fmtM = (m: number) => `${m.toFixed(2).replace('.', ',')} m`;

function openingLabel(o: OpeningRef, room: DetectedRoom): string {
    const kind = o.opening.type === 'door' ? 'Tür' : 'Fenster';
    return `${kind} ${compass(room.centroid, o.center)} (${fmtM(o.opening.width)})`;
}

function lampsIn(project: Project, floor: Floor, room: DetectedRoom) {
    return Object.values(floor.objects).filter(
        o =>
            findAsset(project, o.assetId)?.category === 'lighting' &&
            pointInPolygon([o.x, o.y], room.polygon) &&
            !(o.behaviors ?? []).some(b => b.type === 'light'),
    );
}

const deviceIds = (d: DetectedDevice) => Object.values(d.states);

/** Keywords that tie a light's name to a kind of lamp model. */
const LAMP_WORDS: [RegExp, RegExp][] = [
    [/decke|ceiling|haupt|deckenl|spot|pendel/, /decke|ceiling|pendel|spot/],
    [/steh|floor|stand/, /steh|floor|stand/],
    [/tisch|table|desk|nacht/, /tisch|table|desk|nacht/],
    [/wand|wall/, /wand|wall/],
];

/** How well a detected light fits an existing lamp object (0 = no evidence). */
function lampScore(project: Project, d: DetectedDevice, lamp: SceneObject): number {
    const dn = normalizeName(d.name);
    const ln = normalizeName(lamp.name ?? '');
    const an = normalizeName(findAsset(project, lamp.assetId)?.name ?? '') + normalizeName(lamp.assetId);
    let score = 0;
    if (ln && ln.length > 3 && (dn.includes(ln) || ln.includes(dn))) score += 5;
    for (const [dev, model] of LAMP_WORDS) if (dev.test(dn) && (model.test(ln) || model.test(an))) score += 3;
    return score;
}

/**
 * Assigns the room's lights to its existing lamps: best name matches first,
 * then remaining lamps to remaining lights; the rest get new lamps.
 */
function assignLamps(project: Project, lights: DetectedDevice[], lamps: SceneObject[]): Map<string, string> {
    const pairs: { d: string; l: string; score: number; order: number }[] = [];
    lights.forEach((d, i) => lamps.forEach(l => pairs.push({ d: d.id, l: l.id, score: lampScore(project, d, l), order: i })));
    pairs.sort((a, b) => b.score - a.score || a.order - b.order);
    const result = new Map<string, string>();
    const usedLamps = new Set<string>();
    for (const p of pairs) {
        if (result.has(p.d) || usedLamps.has(p.l)) continue;
        // lights with a name that clearly points to another kind of lamp don't take this one
        if (p.score === 0 && LAMP_WORDS.some(([dev]) => dev.test(normalizeName(lights.find(x => x.id === p.d)!.name)))) continue;
        result.set(p.d, p.l);
        usedLamps.add(p.l);
    }
    return result;
}

export function buildSuggestions(project: Project, detection: DetectionResult, overrides: Record<string, string> = {}): SuggestionResult {
    const rooms = projectRooms(project);
    const used = projectStateIds(project);
    const result: SuggestionResult = { suggestions: [], unmatched: [], unsupported: [], alreadyBound: 0 };
    // targets handed out as defaults, so two devices don't default to the same window or lamp
    const taken = new Set<string>();

    const byRoom = new Map<string, DetectedDevice[]>();
    for (const d of detection.devices) byRoom.set(d.roomId, [...(byRoom.get(d.roomId) ?? []), d]);

    for (const e of detection.rooms) {
        const devices = byRoom.get(e.id) ?? [];
        const supported = devices.filter(isSupported);
        result.unsupported.push(...devices.filter(d => !isSupported(d)));
        if (!supported.length) continue;
        const ref = matchRoom(rooms, e, overrides);
        if (!ref) {
            result.unmatched.push({ id: e.id, name: e.name, devices: supported.length });
            continue;
        }
        const floor = project.floors.find(f => f.id === ref.floorId)!;
        const openings = roomOpenings(floor, ref.room);
        const lamps = lampsIn(project, floor, ref.room);
        const lampFor = assignLamps(
            project,
            supported.filter(d => (d.type === 'light' || d.type === 'dimmer') && !deviceIds(d).some(id => used.has(id))),
            lamps,
        );

        for (const d of supported) {
            if (deviceIds(d).some(id => used.has(id))) {
                result.alreadyBound++;
                continue;
            }
            const base = { key: `${d.id}|${d.type}`, device: d, room: ref, title: d.name, targets: [] as Target[] };
            switch (d.type) {
                case 'temperature':
                case 'thermostat':
                case 'humidity': {
                    const meta = ref.room.meta;
                    const temp = d.type === 'humidity' ? undefined : d.states.ACTUAL;
                    const hum = d.type === 'humidity' ? d.states.ACTUAL : (d.states.HUMIDITY ?? d.states.SECOND);
                    const parts = [temp && !meta?.temperatureId && 'Temperatur', hum && !meta?.humidityId && 'Luftfeuchte'].filter(Boolean);
                    if (!parts.length) {
                        result.alreadyBound++;
                        continue;
                    }
                    result.suggestions.push({ ...base, kind: 'climate', description: `${parts.join(' und ')} am Raum anzeigen` });
                    break;
                }
                case 'window':
                case 'windowTilt':
                case 'door': {
                    const want = d.type === 'door' ? 'door' : 'window';
                    const cands = openings.filter(o => o.opening.type === want);
                    const free = cands.filter(o => !o.opening.stateId);
                    const targets = (free.length ? free : cands).map(o => ({ id: o.id, label: openingLabel(o, ref.room) }));
                    const def = targets.find(t => !taken.has(t.id)) ?? targets[0];
                    if (def) taken.add(def.id);
                    result.suggestions.push({
                        ...base,
                        kind: 'contact',
                        targets,
                        defaultTarget: def?.id,
                        description: def ? `Kontakt an ${def.label}` : '',
                        disabledReason: def ? undefined : `Kein${want === 'door' ? 'e Tür' : ' Fenster'} in diesem Raum gezeichnet`,
                    });
                    break;
                }
                case 'blind': {
                    const cands = openings.filter(o => o.opening.type === 'window');
                    const free = cands.filter(o => !o.opening.blindId);
                    const targets = (free.length ? free : cands).map(o => ({ id: o.id, label: openingLabel(o, ref.room) }));
                    const def = targets.find(t => !taken.has(`blind:${t.id}`)) ?? targets[0];
                    if (def) taken.add(`blind:${def.id}`);
                    result.suggestions.push({
                        ...base,
                        kind: 'blind',
                        targets,
                        defaultTarget: def?.id,
                        description: def ? `Rollladen an ${def.label}` : '',
                        disabledReason: def ? undefined : 'Kein Fenster in diesem Raum gezeichnet',
                    });
                    break;
                }
                case 'light':
                case 'dimmer': {
                    const targets: Target[] = [
                        ...lamps.map(l => ({ id: l.id, label: `vorhandene ${l.name ?? 'Leuchte'}` })),
                        { id: NEW_LAMP, label: 'neue Deckenleuchte platzieren' },
                    ];
                    const def = targets.find(t => t.id === (lampFor.get(d.id) ?? NEW_LAMP))!;
                    result.suggestions.push({
                        ...base,
                        kind: 'light',
                        targets,
                        defaultTarget: def.id,
                        description: def.id === NEW_LAMP ? 'Neue Deckenleuchte platzieren' : `Mit ${def.label.replace('vorhandene ', '')} verbinden`,
                    });
                    break;
                }
            }
        }
    }
    return result;
}

export interface Choice {
    suggestion: Suggestion;
    target?: string;
}

/** Light behaviours for a detected light or dimmer: lamp follows the level/switch, tapping toggles. */
export function lightBehaviors(d: DetectedDevice): Behavior[] {
    if (d.type === 'dimmer') {
        const max = d.max ?? 100;
        const light = { ...(newBehavior('light', d.states.SET) as Extract<Behavior, { type: 'light' }>), max };
        const onId = d.states.ON_SET ?? d.states.ON;
        const action = onId
            ? newBehavior('action', onId)
            : { ...(newBehavior('action', d.states.SET) as Extract<Behavior, { type: 'action' }>), value: String(max) };
        return [light, action];
    }
    const id = d.states.SET ?? d.states.ON_SET ?? d.states.ON ?? Object.values(d.states)[0];
    return [newBehavior('light', id), newBehavior('action', id)];
}

/**
 * Applies the chosen suggestions and room assignments to a copy of the
 * project. `assignments` links ioBroker room enums to 3D rooms (by RoomRef key).
 */
export function applySuggestions(project: Project, choices: Choice[], assignments: Record<string, string> = {}, enumNames: Record<string, string> = {}): Project {
    const p = structuredClone(project);
    const floorOf = (id: string) => p.floors.find(f => f.id === id)!;
    const rooms = projectRooms(p);

    /** Metadata of a room in the copied project, created if the room has none. */
    const metaFor = (ref: RoomRef, fallbackName: string) => {
        const floor = floorOf(ref.floorId);
        const existing = ref.room.meta && floor.rooms[ref.room.meta.id];
        if (existing) return existing;
        const id = uid('r');
        floor.rooms[id] = { id, name: ref.room.meta?.name ?? fallbackName, anchor: ref.room.centroid };
        // later lookups of the same room must find this meta
        ref.room.meta = floor.rooms[id];
        return floor.rooms[id];
    };
    const findOpening = (floorId: string, id: string) => {
        for (const w of Object.values(floorOf(floorId).walls)) {
            const o = w.openings.find(x => x.id === id);
            if (o) return o;
        }
        return undefined;
    };

    for (const [enumId, key] of Object.entries(assignments)) {
        const ref = rooms.find(r => r.key === key);
        if (ref) metaFor(ref, enumNames[enumId] ?? 'Raum').enumId = enumId;
    }

    const newLamps = new Map<string, number>();
    const lampCount = new Map<string, number>();
    for (const c of choices) if (c.suggestion.kind === 'light' && (c.target ?? c.suggestion.defaultTarget) === NEW_LAMP) {
        lampCount.set(c.suggestion.room.key, (lampCount.get(c.suggestion.room.key) ?? 0) + 1);
    }

    for (const { suggestion: s, target: chosen } of choices) {
        const target = chosen ?? s.defaultTarget;
        // re-resolve the room in the copy (suggestions were built on the original)
        const ref = rooms.find(r => r.key === s.room.key) ?? s.room;
        const floor = floorOf(ref.floorId);
        const d = s.device;
        switch (s.kind) {
            case 'climate': {
                const meta = metaFor(ref, d.roomName);
                if (!meta.enumId) meta.enumId = d.roomId;
                if (d.type !== 'humidity' && d.states.ACTUAL && !meta.temperatureId) meta.temperatureId = d.states.ACTUAL;
                const hum = d.type === 'humidity' ? d.states.ACTUAL : (d.states.HUMIDITY ?? d.states.SECOND);
                if (hum && !meta.humidityId) meta.humidityId = hum;
                break;
            }
            case 'contact': {
                const o = target && findOpening(ref.floorId, target);
                if (o) o.stateId = d.states.ACTUAL ?? Object.values(d.states)[0];
                break;
            }
            case 'blind': {
                const o = target && findOpening(ref.floorId, target);
                if (o) {
                    o.blindId = d.states.ACTUAL ?? d.states.SET;
                    if (d.max && d.max !== 100) o.blindMax = d.max;
                }
                break;
            }
            case 'light': {
                const behaviors = lightBehaviors(d);
                if (target && target !== NEW_LAMP && floor.objects[target]) {
                    const obj = floor.objects[target];
                    obj.behaviors = [...(obj.behaviors ?? []), ...behaviors];
                    break;
                }
                const lamp = builtinAssets().find(a => a.id === 'builtin:ceilingLamp')!;
                const n = lampCount.get(ref.key) ?? 1;
                const i = newLamps.get(ref.key) ?? 0;
                newLamps.set(ref.key, i + 1);
                const [cx, cy] = ref.room.centroid;
                // several new lamps in one room: line them up through the room centre
                const x = cx + (i - (n - 1) / 2) * 0.9;
                const id = uid('o');
                floor.objects[id] = {
                    id,
                    assetId: lamp.id,
                    name: d.name,
                    x: pointInPolygon([x, cy], ref.room.polygon) ? x : cx,
                    y: cy,
                    elevation: floor.height - lamp.size[1],
                    rotation: 0,
                    scale: [1, 1, 1],
                    behaviors,
                };
                break;
            }
        }
        if (s.kind !== 'climate') {
            const meta = metaFor(ref, d.roomName);
            if (!meta.enumId) meta.enumId = d.roomId;
        }
    }
    return p;
}
