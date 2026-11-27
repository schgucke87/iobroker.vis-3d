import type { Backend, DatapointInfo, EnumInfo, StateInfo, StateValue } from './backend';

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
    P('licht.wohnzimmer_decke', 'Wohnzimmer Deckenlicht', 'switch.light', 'boolean', true, 'Wohnzimmer', 'Licht'),
    P('licht.wohnzimmer_decke_level', 'Wohnzimmer Deckenlicht Helligkeit', 'level.dimmer', 'number', 80, 'Wohnzimmer', 'Licht', { unit: '%', min: 0, max: 100 }),
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
];

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

    async listRooms(): Promise<EnumInfo[]> {
        const rooms = new Map<string, string[]>();
        for (const p of POINTS) rooms.set(p.room, [...(rooms.get(p.room) ?? []), p.id]);
        return [...rooms].map(([name, members]) => ({ id: `enum.rooms.${name.toLowerCase()}`, name, members }));
    }
}
