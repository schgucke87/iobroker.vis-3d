import type { Behavior, BehaviorType, LightColorMode } from './types';
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

// ---------- light colours (Hue, RGB, colour temperature, CIE) ----------

export const COLOR_MODE_LABELS: Record<LightColorMode, string> = {
    rgb: 'RGB-Text (#rrggbb)',
    hue: 'Farbton + Sättigung',
    ct: 'Farbtemperatur',
    cie: 'CIE xy',
    rgbParts: 'Rot / Grün / Blau einzeln',
};

/** Labels of the colour datapoints per mode (the optional ones are marked). */
export const COLOR_ID_LABELS: Record<LightColorMode, string[]> = {
    rgb: ['Farbe'],
    hue: ['Farbton', 'Sättigung (optional)', 'Farbtemperatur (optional, für Weiß-Modus)'],
    ct: ['Farbtemperatur'],
    cie: ['xy-Farbe'],
    rgbParts: ['Rot', 'Grün', 'Blau'],
};

const hex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

const num = (v: StateValue | undefined): number | undefined => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return undefined;
};

/** HSV (h 0…360, s 0…1, v = 1) to hex. */
export function hsvToHex(h: number, s: number): string {
    const c = s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = 1 - c;
    const [r, g, b] =
        h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hex(r + m, g + m, b + m);
}

/** Colour temperature (Kelvin, or mired below 1000) to hex (Tanner Helland's approximation). */
export function kelvinToHex(value: number): string {
    const k = value < 1000 ? 1e6 / Math.max(value, 1) : value;
    const t = Math.min(40000, Math.max(1000, k)) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return hex(r / 255, g / 255, b / 255);
}

/** CIE 1931 xy (full brightness) to hex, as Philips Hue does it. */
export function xyToHex(x: number, y: number): string {
    if (y <= 0) return '#ffffff';
    const Y = 1;
    const X = (Y / y) * x;
    const Z = (Y / y) * (1 - x - y);
    let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
    const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    [r, g, b] = [gamma(Math.max(0, r)), gamma(Math.max(0, g)), gamma(Math.max(0, b))];
    const max = Math.max(r, g, b, 1e-6);
    return hex(r / max, g / max, b / max);
}

/** Parses "#rrggbb", "rrggbb", "#rrggbbww" or "r,g,b". */
export function parseRgb(v: StateValue | undefined): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
    if (m) return `#${m[1].toLowerCase()}`;
    const parts = s.split(/[,;\s]+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(n => Number.isFinite(n))) return hex(parts[0] / 255, parts[1] / 255, parts[2] / 255);
    return null;
}

function parseXy(v: StateValue | undefined): [number, number] | null {
    if (typeof v !== 'string') return null;
    const n = v.replace(/[[\]{}"xy:]/g, ' ').split(/[,;\s]+/).filter(Boolean).map(Number);
    return n.length >= 2 && n.every(Number.isFinite) ? [n[0], n[1]] : null;
}

/**
 * The current light colour from its colour datapoints, or null when it is
 * unknown (then the behaviour's fixed colour is used).
 */
export function lightColor(mode: LightColorMode | undefined, vals: (StateValue | undefined)[], maxes: (number | undefined)[] = []): string | null {
    switch (mode) {
        case 'rgb':
            return parseRgb(vals[0]);
        case 'rgbParts': {
            const [r, g, b] = [0, 1, 2].map(i => num(vals[i]));
            if (r === undefined || g === undefined || b === undefined) return null;
            const m = (i: number) => maxes[i] || 255;
            return hex(r / m(0), g / m(1), b / m(2));
        }
        case 'hue': {
            const h = num(vals[0]);
            if (h === undefined) return null;
            const sRaw = num(vals[1]);
            const s = sRaw === undefined ? 1 : Math.min(1, Math.max(0, sRaw / (maxes[1] || 100)));
            const ct = num(vals[2]);
            // nearly unsaturated: the lamp is in white mode, its colour temperature is the better guess
            if (s < 0.1 && ct !== undefined) return kelvinToHex(ct);
            return hsvToHex(((h / (maxes[0] || 360)) * 360) % 360, s);
        }
        case 'ct': {
            const ct = num(vals[0]);
            return ct === undefined ? null : kelvinToHex(ct);
        }
        case 'cie': {
            const xy = parseXy(vals[0]);
            return xy ? xyToHex(xy[0], xy[1]) : null;
        }
        default:
            return null;
    }
}

/** All datapoint ids a behaviour reads. */
export function behaviorStateIds(b: Behavior): string[] {
    const ids = [b.stateId];
    if (b.type === 'light') {
        if (b.onId) ids.push(b.onId);
        ids.push(...(b.colorIds ?? []));
    }
    return ids.filter(Boolean);
}
