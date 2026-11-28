import type { Backend, DatapointInfo, EnumInfo, StateInfo, StateValue } from './backend';
import { detectDevicesInObjects, type DetectionResult } from './devices';

/**
 * Simulated datapoints for trying the app without ioBroker. They match the
 * bindings of the demo house; temperatures drift slowly, and the TV and
 * lights react to setState like real devices (ack after a short delay).
 */
interface DemoPoint {
    id: string;
    name: string;
    role: string;
    type: 'boolean' | 'number' | 'string';
    unit?: string;
    write: boolean;
    room: string;
    fn: string;
    val: StateValue;
    min?: number;
    max?: number;
    /** Name of the channel the datapoint belongs to (its parent id); the channel is the room member then. */
    channel?: string;
}

const P = (
    id: string,
    name: string,
    role: string,
    type: DemoPoint['type'],
    val: StateValue,
    room: string,
    fn: string,
    extra: Partial<DemoPoint> = {},
): DemoPoint => ({ id: `demo.0.${id}`, name, role, type, val, room, fn, write: role.startsWith('switch') || role.startsWith('level'), ...extra });

const POINTS: DemoPoint[] = [
    // one dimmable light = one channel with an on/off and a level datapoint, like real devices
    P('licht.wohnzimmer.on', 'Wohnzimmer Deckenlicht an', 'switch.light', 'boolean', true, 'Wohnzimmer', 'Licht', { channel: 'Wohnzimmer Deckenlicht' }),
    P('licht.wohnzimmer.level', 'Wohnzimmer Deckenlicht Helligkeit', 'level.dimmer', 'number', 80, 'Wohnzimmer', 'Licht', {
        unit: '%',
        min: 0,
        max: 100,
        channel: 'Wohnzimmer Deckenlicht',
    }),
    P('licht.stehlampe', 'Stehlampe', 'switch.light', 'boolean', false, 'Wohnzimmer', 'Licht'),
    P('licht.kueche', 'Küche Deckenlicht', 'switch.light', 'boolean', true, 'Küche', 'Licht'),
    P('licht.schlafzimmer', 'Schlafzimmer Deckenlicht', 'switch.light', 'boolean', false, 'Schlafzimmer', 'Licht'),
    P('tv.power', 'Fernseher', 'switch.power', 'boolean', false, 'Wohnzimmer', 'Multimedia'),
    P('temperatur.wohnzimmer', 'Temperatur Wohnzimmer', 'value.temperature', 'number', 21.4, 'Wohnzimmer', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.kueche', 'Temperatur Küche', 'value.temperature', 'number', 22.6, 'Küche', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.flur', 'Temperatur Flur', 'value.temperature', 'number', 19.2, 'Flur', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.gaeste_wc', 'Temperatur Gäste-WC', 'value.temperature', 'number', 20.1, 'Gäste-WC', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.hauswirtschaft', 'Temperatur Hauswirtschaft', 'value.temperature', 'number', 17.8, 'Hauswirtschaft', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.schlafzimmer', 'Temperatur Schlafzimmer', 'value.temperature', 'number', 18.3, 'Schlafzimmer', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.kinderzimmer', 'Temperatur Kinderzimmer', 'value.temperature', 'number', 21.0, 'Kinderzimmer', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.bad', 'Temperatur Bad', 'value.temperature', 'number', 23.5, 'Bad', 'Heizung', { unit: '°C', write: false }),
    P('temperatur.arbeitszimmer', 'Temperatur Arbeitszimmer', 'value.temperature', 'number', 20.6, 'Arbeitszimmer', 'Heizung', { unit: '°C', write: false }),
    P('fenster.wohnzimmer_west', 'Fenster Wohnzimmer West', 'sensor.window', 'boolean', true, 'Wohnzimmer', 'Sicherheit', { write: true }),
    P('fenster.kueche', 'Fenster Küche', 'value.window', 'number', 1, 'Küche', 'Sicherheit', { write: true, min: 0, max: 2 }),
    P('fenster.schlafzimmer', 'Fenster Schlafzimmer', 'sensor.window', 'boolean', false, 'Schlafzimmer', 'Sicherheit', { write: true }),
    P('tuer.haustuer', 'Haustür', 'sensor.door', 'boolean', false, 'Flur', 'Sicherheit', { write: true }),
    P('tuer.bad', 'Badtür', 'sensor.door', 'boolean', true, 'Bad', 'Sicherheit', { write: true }),
    P('anwesenheit.auto', 'Auto zu Hause', 'indicator', 'boolean', true, 'Flur', 'Anwesenheit', { write: true }),
    // not wired in the demo house yet: these show up as suggestions
    P('licht.flur', 'Flur Deckenlicht', 'switch.light', 'boolean', false, 'Flur', 'Licht'),
    P('licht.kinderzimmer', 'Kinderzimmer Deckenlicht', 'switch.light', 'boolean', true, 'Kinderzimmer', 'Licht'),
    P('licht.esstisch', 'Esstischlampe', 'level.dimmer', 'number', 60, 'Küche', 'Licht', { unit: '%', min: 0, max: 100 }),
    P('rollladen.wohnzimmer', 'Rollladen Wohnzimmer', 'level.blind', 'number', 40, 'Wohnzimmer', 'Rollladen', { unit: '%', min: 0, max: 100 }),
    P('rollladen.schlafzimmer', 'Rollladen Schlafzimmer', 'level.blind', 'number', 0, 'Schlafzimmer', 'Rollladen', { unit: '%', min: 0, max: 100 }),
    P('luftfeuchte.bad', 'Luftfeuchte Bad', 'value.humidity', 'number', 63, 'Bad', 'Heizung', { unit: '%', write: false }),
    P('fenster.kinderzimmer', 'Fenster Kinderzimmer', 'sensor.window', 'boolean', false, 'Kinderzimmer', 'Sicherheit', { write: true }),
    P('fenster.arbeitszimmer', 'Drehgriff Arbeitszimmer', 'value.window', 'number', 2, 'Arbeitszimmer', 'Sicherheit', { write: true, min: 0, max: 2 }),
    P('bewegung.flur', 'Bewegungsmelder Flur', 'sensor.motion', 'boolean', false, 'Flur', 'Sicherheit'),
    // Hue lamps, structured like the ioBroker Hue adapter creates them
    ...hueLamp('hue.nachttisch', 'Hue Nachttischlampe', 'Schlafzimmer', { on: true, level: 70, hue: 280, sat: 85, ct: 2700 }),
    ...hueLamp('hue.arbeitszimmer', 'Hue Ambiance Arbeitszimmer', 'Arbeitszimmer', { on: true, level: 90, ct: 5000 }),
];

/** Datapoints of a Hue lamp; with hue/sat it is a colour lamp, otherwise a white ambiance lamp. */
function hueLamp(base: string, name: string, room: string, v: { on: boolean; level: number; ct: number; hue?: number; sat?: number }): DemoPoint[] {
    const c = { channel: name };
    const points = [
        P(`${base}.on`, `${name} an`, 'switch.light', 'boolean', v.on, room, 'Licht', c),
        P(`${base}.level`, `${name} Helligkeit`, 'level.dimmer', 'number', v.level, room, 'Licht', { ...c, unit: '%', min: 0, max: 100 }),
        P(`${base}.ct`, `${name} Farbtemperatur`, 'level.color.temperature', 'number', v.ct, room, 'Licht', { ...c, unit: 'K', min: 2200, max: 6500 }),
    ];
    if (v.hue !== undefined) {
        points.push(
            P(`${base}.hue`, `${name} Farbton`, 'level.color.hue', 'number', v.hue, room, 'Licht', { ...c, unit: '°', min: 0, max: 360 }),
            P(`${base}.sat`, `${name} Sättigung`, 'level.color.saturation', 'number', v.sat ?? 100, room, 'Licht', { ...c, unit: '%', min: 0, max: 100 }),
        );
    }
    return points;
}

export class DemoBackend implements Backend {
    kind = 'demo' as const;
    label = 'Demo-Daten (kein ioBroker verbunden)';
    files = null;
    private states = new Map<string, StateInfo>();
    private subs = new Set<{ ids: Set<string>; cb: (id: string, s: StateInfo | null) => void }>();

    constructor() {
        const now = Date.now();
        for (const p of POINTS) this.states.set(p.id, { val: p.val, ack: true, ts: now });
        setInterval(() => this.drift(), 4000);
    }

    private emit(id: string) {
        const s = this.states.get(id) ?? null;
        for (const sub of this.subs) if (sub.ids.has(id)) sub.cb(id, s);
    }

    private drift() {
        for (const p of POINTS) {
            if (p.role !== 'value.temperature') continue;
            const cur = this.states.get(p.id)!.val as number;
            const next = Math.round((cur + (Math.random() - 0.5) * 0.2 + ((p.val as number) - cur) * 0.05) * 10) / 10;
            if (next !== cur) {
                this.states.set(p.id, { val: next, ack: true, ts: Date.now() });
                this.emit(p.id);
            }
        }
    }

    subscribe(ids: string[], cb: (id: string, s: StateInfo | null) => void) {
        const sub = { ids: new Set(ids), cb };
        this.subs.add(sub);
        for (const id of ids) cb(id, this.states.get(id) ?? null);
        return () => void this.subs.delete(sub);
    }

    async setState(id: string, val: StateValue) {
        this.states.set(id, { val, ack: false, ts: Date.now() });
        this.emit(id);
        // the "device" confirms shortly after
        setTimeout(() => {
            this.states.set(id, { val, ack: true, ts: Date.now() });
            this.emit(id);
        }, 300);
    }

    async listDatapoints(): Promise<DatapointInfo[]> {
        return POINTS.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            type: p.type,
            unit: p.unit,
            write: p.write,
            min: p.min,
            max: p.max,
            rooms: [p.room],
            functions: [p.fn],
        }));
    }

    async getLocation() {
        return null;
    }

    /** The demo datapoints as ioBroker objects, run through the real type-detector. */
    async detectDevices(): Promise<DetectionResult> {
        const objects: Record<string, ioBroker.Object> = {};
        const enums = new Map<string, { name: string; members: string[] }>();
        const addTo = (id: string, name: string, member: string) => {
            const e = enums.get(id) ?? { name, members: [] };
            e.members.push(member);
            enums.set(id, e);
        };
        for (const p of POINTS) {
            objects[p.id] = {
                _id: p.id,
                type: 'state',
                common: { name: p.name, role: p.role, type: p.type, unit: p.unit, min: p.min, max: p.max, read: true, write: p.write },
                native: {},
            } as ioBroker.StateObject;
            let member = p.id;
            if (p.channel) {
                member = p.id.split('.').slice(0, -1).join('.');
                if (objects[member]) continue; // channel already in the enums
                objects[member] = { _id: member, type: 'channel', common: { name: p.channel }, native: {} } as ioBroker.ChannelObject;
            }
            addTo(`enum.rooms.${slug(p.room)}`, p.room, member);
            addTo(`enum.functions.${slug(p.fn)}`, p.fn, member);
        }
        for (const [id, e] of enums) {
            objects[id] = { _id: id, type: 'enum', common: { name: e.name, members: e.members }, native: {} } as ioBroker.EnumObject;
        }
        return detectDevicesInObjects(objects);
    }

    async listRooms(): Promise<EnumInfo[]> {
        const rooms = new Map<string, string[]>();
        for (const p of POINTS) rooms.set(p.room, [...(rooms.get(p.room) ?? []), p.id]);
        return [...rooms].map(([name, members]) => ({ id: `enum.rooms.${slug(name)}`, name, members }));
    }
}

const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '_');
