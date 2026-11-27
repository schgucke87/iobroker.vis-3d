import type { Behavior, BehaviorType } from './types';
import { normalizeValue, type StateValue } from '../iobroker/backend';
import { uid } from './ops';

export const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
    light: 'Leuchten',
    color: 'Färben',
    visibility: 'Sichtbarkeit',
    transform: 'Bewegen / Drehen',
    label: 'Wert anzeigen',
    action: 'Klick-Aktion',
};

export const BEHAVIOR_HINTS: Record<BehaviorType, string> = {
    light: 'Lichtquelle und leuchtende Teile; Schalter (an/aus) oder Dimmer (0…max)',
    color: 'Farbe zwischen zwei Werten, z. B. Heizkörper nach Temperatur',
    visibility: 'Objekt nur zeigen, wenn der Datenpunkt wahr ist',
    transform: 'Drehen oder Verschieben abhängig vom Wert, z. B. Garagentor, Rollladen',
    label: 'Aktuellen Wert über dem Objekt anzeigen',
    action: 'Beim Antippen in der Ansicht schalten oder einen Wert setzen',
};

export function newBehavior(type: BehaviorType, stateId = ''): Behavior {
    const id = uid('b');
    switch (type) {
        case 'light':
            return { id, type, stateId, color: '#ffd9a0', intensity: 6, range: 6, max: 100 };
        case 'color':
            return { id, type, stateId, min: 18, max: 26, colorMin: '#4a90e2', colorMax: '#e2554a' };
        case 'visibility':
            return { id, type, stateId, invert: false };
        case 'transform':
            return { id, type, stateId, mode: 'move', axis: 'y', min: 0, max: 100, from: 0, to: 1 };
        case 'label':
            return { id, type, stateId, unit: '', decimals: 1, prefix: '' };
        case 'action':
            return { id, type, stateId, mode: 'toggle', value: '' };
    }
}

/** 0…1 brightness of a light: booleans on/off, numbers relative to `max`. */
export function lightLevel(val: StateValue | undefined, max: number): number {
    if (typeof val === 'boolean' || typeof val === 'string') return normalizeValue(val);
    return normalizeValue(val, 0, max || 1);
}

/** Parses a configured value ("true", "42", "on") into the state's type. */
export function parseConfiguredValue(v: string): StateValue {
    const s = v.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && Number.isFinite(Number(s.replace(',', '.')))) return Number(s.replace(',', '.'));
    return s;
}

/** The value an action writes, given the current value. */
export function actionValue(b: Extract<Behavior, { type: 'action' }>, current: StateValue | undefined): StateValue {
    switch (b.mode) {
        case 'toggle':
            if (typeof current === 'number') return current > 0 ? 0 : b.value ? Number(b.value) || 100 : 100;
            return !(normalizeValue(current) > 0);
        case 'set':
            return parseConfiguredValue(b.value);
        case 'increment':
            return (typeof current === 'number' ? current : 0) + (Number(b.value.replace(',', '.')) || 1);
    }
}

/**
 * State of a window/door contact: 0 closed, 0.5 tilted, 1 open.
 * Booleans: true = open (or closed when inverted). Numbers: 0/1/2 as reported
 * by rotary handle sensors (closed / tilted / open).
 */
export function contactLevel(val: StateValue | undefined, invert = false): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') {
        if (val >= 2) return 1;
        if (val >= 1) return invert ? 0 : 0.5;
        return invert ? 1 : 0;
    }
    const open = normalizeValue(val) > 0;
    return open !== invert ? 1 : 0;
}

/** Colour scale for room temperatures (heat map). */
export function temperatureColor(t: number): string {
    const stops: [number, [number, number, number]][] = [
        [16, [70, 120, 220]],
        [19, [90, 190, 220]],
        [21, [110, 200, 120]],
        [23, [240, 200, 80]],
        [26, [230, 80, 60]],
    ];
    if (t <= stops[0][0]) return rgb(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
            const [t0, c0] = stops[i - 1];
            const [t1, c1] = stops[i];
            const k = (t - t0) / (t1 - t0);
            return rgb([0, 1, 2].map(j => c0[j] + (c1[j] - c0[j]) * k) as [number, number, number]);
        }
    }
    return rgb(stops[stops.length - 1][1]);
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
