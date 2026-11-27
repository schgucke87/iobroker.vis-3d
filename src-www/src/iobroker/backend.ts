/**
 * Data source abstraction. The app talks to ioBroker through the web
 * adapter's socket (SocketBackend) or, without ioBroker, to simulated
 * datapoints (DemoBackend), so it can be developed and tried standalone.
 */

export type StateValue = string | number | boolean | null;

export interface StateInfo {
    val: StateValue;
    ack: boolean;
    ts: number;
}

/** A datapoint as listed in the datapoint browser. */
export interface DatapointInfo {
    id: string;
    name: string;
    role?: string;
    type?: string;
    unit?: string;
    write?: boolean;
    min?: number;
    max?: number;
    /** Names of the rooms (enum.rooms) the datapoint or its parents belong to. */
    rooms: string[];
    functions: string[];
}

export interface EnumInfo {
    id: string;
    name: string;
    members: string[];
}

/** Project and asset files (ioBroker file storage of the adapter instance). */
export interface FileStore {
    readText(path: string): Promise<string | null>;
    writeText(path: string, text: string): Promise<void>;
    readBinary(path: string): Promise<ArrayBuffer | null>;
    writeBinary(path: string, data: ArrayBuffer): Promise<void>;
    delete(path: string): Promise<void>;
}

export interface Backend {
    kind: 'iobroker' | 'demo';
    /** Human readable description for the status display. */
    label: string;
    /** Subscribes to datapoints; the callback also receives the current values. Returns an unsubscribe function. */
    subscribe(ids: string[], cb: (id: string, state: StateInfo | null) => void): () => void;
    setState(id: string, val: StateValue): Promise<void>;
    listDatapoints(): Promise<DatapointInfo[]>;
    listRooms(): Promise<EnumInfo[]>;
    files: FileStore | null;
}

/** Normalises a value to 0…1: booleans and on/off strings to 0/1, numbers relative to [min, max]. */
export function normalizeValue(val: StateValue | undefined, min = 0, max = 1): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (typeof val === 'string') {
        const s = val.trim().toLowerCase();
        if (['true', 'on', 'an', 'ein', 'open', 'offen'].includes(s)) return 1;
        if (['false', 'off', 'aus', 'closed', 'zu', ''].includes(s)) return 0;
        const n = parseFloat(s.replace(',', '.'));
        return Number.isFinite(n) ? clamp01((n - min) / (max - min || 1)) : 0;
    }
    return clamp01((val - min) / (max - min || 1));
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function isTruthy(val: StateValue | undefined): boolean {
    return normalizeValue(val) > 0;
}

export function formatValue(val: StateValue | undefined, decimals = 1, unit = ''): string {
    if (val === null || val === undefined) return '–';
    if (typeof val === 'boolean') return val ? 'an' : 'aus';
    if (typeof val === 'number') {
        const s = val.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return unit ? `${s} ${unit}` : s;
    }
    return unit ? `${val} ${unit}` : String(val);
}

/** ioBroker names may be plain strings or translation objects. */
export function objectName(name: unknown, fallback: string): string {
    if (typeof name === 'string') return name || fallback;
    if (name && typeof name === 'object') {
        const n = name as Record<string, string>;
        return n.de || n.en || Object.values(n)[0] || fallback;
    }
    return fallback;
}
