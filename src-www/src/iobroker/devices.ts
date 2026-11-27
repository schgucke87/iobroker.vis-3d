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
    roomId: string;
    roomName: string;
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

    const roomEnums = keys
        .filter(k => k.startsWith('enum.rooms.') && objects[k].type === 'enum')
        .map(k => objects[k] as ioBroker.EnumObject);

    for (const room of roomEnums) {
        const roomName = objectName(room.common?.name, room._id.split('.').pop()!);
        rooms.push({ id: room._id, name: roomName });
        for (const member of room.common?.members ?? []) {
            if (!objects[member]) continue;
            let controls: PatternControl[] | null = null;
            try {
                controls = detector.detect({
                    objects,
                    id: member,
                    _keysOptional: keys,
                    _keysOptionalSorted: true,
                    _usedIdsOptional: usedIds,
                    ignoreIndicators: ['UNREACH_STICKY'],
                    excludedTypes: [Types.info],
                });
            } catch (e) {
                console.warn(`type-detector: ${member}`, e);
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
                    id: member,
                    name: objectName(objects[member]?.common?.name, member.split('.').pop()!),
                    type: control.type,
                    roomId: room._id,
                    roomName,
                    states,
                    maxOf,
                    max: maxOf[mainName],
                });
            }
            devices.push(...mergeLights(found));
        }
    }
    return { devices, rooms };
}
