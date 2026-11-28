/**
 * Device detection with ioBroker's type-detector (the same library Material,
 * Matter and the Alexa/Google integrations use): which devices exist in
 * which room (enum.rooms), with the datapoints for switching, levels,
 * measured values and so on.
 */
import { ChannelDetector, Types, type PatternControl } from '@iobroker/type-detector';
import { objectName } from './backend';

/** Device types vis-3d can turn into suggestions. */
export type DeviceKind =
    | LightKind
    | 'temperature'
    | 'thermostat'
    | 'humidity'
    | 'window'
    | 'windowTilt'
    | 'door'
    | 'blind';

/** Lights: plain switches, dimmers and colour lights (Hue, RGB, colour temperature, CIE). */
export type LightKind = 'light' | 'dimmer' | 'hue' | 'ct' | 'rgb' | 'rgbSingle' | 'rgbwSingle' | 'cie';
export const LIGHT_KINDS: LightKind[] = ['rgbSingle', 'rgbwSingle', 'cie', 'hue', 'rgb', 'ct', 'dimmer', 'light'];
export const isLightKind = (t: string): t is LightKind => (LIGHT_KINDS as string[]).includes(t);

export const SUPPORTED_KINDS: DeviceKind[] = [...LIGHT_KINDS, 'temperature', 'thermostat', 'humidity', 'window', 'windowTilt', 'door', 'blind'];

export interface DetectedDevice {
    /** Channel, device or state id the device was detected at. */
    id: string;
    name: string;
    /** Type-detector type (also unsupported ones, e.g. "motion"). */
    type: string;
    /** ioBroker room enum ('' when the device is in no ioBroker room). */
    roomId: string;
    roomName: string;
    /** Room name from elsewhere for devices without an ioBroker room (e.g. the Hue bridge's rooms). */
    roomHint?: string;
    /** State names of the pattern (SET, ACTUAL, ON, …) → datapoint id. */
    states: Record<string, string>;
    /** common.max of the main datapoint (for dimmers and blinds). */
    max?: number;
    /** common.max per state name (DIMMER, HUE, SATURATION, …). */
    maxOf: Record<string, number>;
}

export interface DetectionResult {
    devices: DetectedDevice[];
    rooms: { id: string; name: string }[];
}

export function isSupported(d: DetectedDevice): d is DetectedDevice & { type: DeviceKind } {
    return (SUPPORTED_KINDS as string[]).includes(d.type);
}

/**
 * A colour lamp can match several light patterns at once (a Hue lamp is
 * found as "rgb" and as "hue"). Merge the light controls of one channel into
 * a single light with all their datapoints, typed by the richest pattern.
 */
function mergeLights(found: DetectedDevice[]): DetectedDevice[] {
    // group by the channel the datapoints live in, so two lamps of one device stay two lamps
    const channelOf = (d: DetectedDevice) => Object.values(d.states)[0].split('.').slice(0, -1).join('.');
    const groups = new Map<string, DetectedDevice[]>();
    for (const d of found.filter(x => isLightKind(x.type))) groups.set(channelOf(d), [...(groups.get(channelOf(d)) ?? []), d]);
    const result = found.filter(d => !isLightKind(d.type));
    for (const lights of groups.values()) {
        const type = LIGHT_KINDS.find(k => lights.some(d => d.type === k))!;
        const primary = lights.find(d => d.type === type)!;
        const merged: DetectedDevice = { ...primary, states: {}, maxOf: {} };
        // the chosen pattern's states first, the others fill gaps
        for (const d of [primary, ...lights.filter(x => x !== primary)]) {
            for (const [k, v] of Object.entries(d.states)) merged.states[k] ??= v;
            for (const [k, v] of Object.entries(d.maxOf)) merged.maxOf[k] ??= v;
        }
        result.push(merged);
    }
    return result;
}

/**
 * Runs the type-detector on every member of every room enum.
 * `objects` must contain the states, channels and devices, plus the room and
 * function enums (some patterns need the function enum, e.g. a plain
 * "switch" is only a light when it is in the lights function).
 */
export function detectDevicesInObjects(objects: Record<string, ioBroker.Object>): DetectionResult {
    const detector = new ChannelDetector();
    const keys = Object.keys(objects).sort();
    const usedIds: string[] = [];
    const devices: DetectedDevice[] = [];
    const rooms: DetectionResult['rooms'] = [];

    const detectAt = (id: string, roomId: string, roomName: string, roomHint?: string, onlySupported = false) => {
        let controls: PatternControl[] | null = null;
        try {
            controls = detector.detect({
                objects,
                id,
                _keysOptional: keys,
                _keysOptionalSorted: true,
                _usedIdsOptional: usedIds,
                ignoreIndicators: ['UNREACH_STICKY'],
                excludedTypes: [Types.info],
            });
        } catch (e) {
            console.warn(`type-detector: ${id}`, e);
        }
        const found: DetectedDevice[] = [];
        for (const control of controls ?? []) {
            const states: Record<string, string> = {};
            const maxOf: Record<string, number> = {};
            for (const s of control.states) {
                if (!s.id) continue;
                states[s.name] = s.id;
                const max = (objects[s.id] as ioBroker.StateObject | undefined)?.common?.max;
                if (typeof max === 'number') maxOf[s.name] = max;
            }
            if (!Object.keys(states).length) continue;
            const main = states.SET ?? states.ACTUAL ?? Object.values(states)[0];
            const mainName = Object.keys(states).find(k => states[k] === main)!;
            found.push({
                id,
                name: objectName(objects[id]?.common?.name, id.split('.').pop()!),
                type: control.type,
                roomId,
                roomName,
                roomHint,
                states,
                maxOf,
                max: maxOf[mainName],
            });
        }
        const merged = mergeLights(found);
        devices.push(...(onlySupported ? merged.filter(isSupported) : merged));
    };

    // 1. everything that is assigned to an ioBroker room
    const roomEnums = keys
        .filter(k => k.startsWith('enum.rooms.') && objects[k].type === 'enum')
        .map(k => objects[k] as ioBroker.EnumObject);
    const members = new Set<string>();
    for (const room of roomEnums) {
        const roomName = objectName(room.common?.name, room._id.split('.').pop()!);
        rooms.push({ id: room._id, name: roomName });
        for (const member of room.common?.members ?? []) {
            if (!objects[member]) continue;
            members.add(member);
            detectAt(member, room._id, roomName);
        }
    }

    // 2. devices without an ioBroker room (e.g. the Hue adapter never assigns rooms);
    //    vis-3d matches them to its rooms later, using the hints collected here
    const hints = roomHints(objects, keys);
    const isMemberOrInside = (id: string) => {
        for (const m of members) if (id === m || id.startsWith(`${m}.`)) return true;
        return false;
    };
    for (const id of keys) {
        const obj = objects[id];
        if (obj.type !== 'channel' && obj.type !== 'device') continue;
        if (isGroup(obj) || isMemberOrInside(id) || !hasRelevantStates(objects, keys, id)) continue;
        // outside rooms only what vis-3d can use: a lamp's transition time is no "slider" device worth listing
        detectAt(id, '', '', hints.get(id), true);
    }
    return { devices, rooms };
}

/** Roles of datapoints that make a channel worth running the detector on. */
const RELEVANT_ROLE = /^(switch\.light|switch$|level\.(dimmer|brightness|blind|color\.|temperature)|value\.(temperature|humidity|window)|sensor\.(window|door))/;

function hasRelevantStates(objects: Record<string, ioBroker.Object>, keys: string[], id: string): boolean {
    const prefix = `${id}.`;
    // keys are sorted: binary search for the first child
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid] < prefix) lo = mid + 1;
        else hi = mid;
    }
    for (let i = lo; i < keys.length && keys[i].startsWith(prefix); i++) {
        const o = objects[keys[i]];
        if (o.type === 'state' && RELEVANT_ROLE.test((o.common as ioBroker.StateCommon)?.role ?? '')) return true;
    }
    return false;
}

const GROUP_ROLES = ['Room', 'Zone', 'LightGroup', 'Entertainment', 'Luminaire', 'LightSource'];

/** Hue (and similar) groups: rooms and zones of the bridge, not lamps of their own. */
function isGroup(obj: ioBroker.Object): boolean {
    const native = obj.native as { lights?: unknown } | undefined;
    return Array.isArray(native?.lights) || GROUP_ROLES.includes(String(obj.common?.role ?? ''));
}

/**
 * Room names for lamps from the rooms of the Hue bridge: the Hue adapter
 * creates a channel per Hue room with the ids of its lamps in native.lights,
 * and every lamp channel carries its Hue id in native.id.
 */
function roomHints(objects: Record<string, ioBroker.Object>, keys: string[]): Map<string, string> {
    const hints = new Map<string, string>();
    const groups = keys.map(k => objects[k]).filter(o => o.type === 'channel' && isGroup(o));
    // rooms win over zones and other groups
    groups.sort((a, b) => Number(groupType(b) === 'Room') - Number(groupType(a) === 'Room'));
    for (const g of groups) {
        const t = groupType(g);
        if (t !== 'Room' && t !== 'Zone') continue;
        const ns = g._id.split('.').slice(0, 2).join('.');
        const lights = ((g.native as { lights?: unknown[] }).lights ?? []).map(String);
        const name = objectName((g.native as { name?: string }).name ?? g.common?.name, g._id.split('.').pop()!);
        for (const k of keys) {
            if (!k.startsWith(`${ns}.`)) continue;
            const o = objects[k];
            if (o.type !== 'channel' || isGroup(o)) continue;
            const lid = (o.native as { id?: unknown } | undefined)?.id;
            if (lid !== undefined && lights.includes(String(lid)) && !hints.has(k)) hints.set(k, name);
        }
    }
    return hints;
}

const groupType = (o: ioBroker.Object) => String((o.native as { type?: string } | undefined)?.type ?? o.common?.role ?? '');
