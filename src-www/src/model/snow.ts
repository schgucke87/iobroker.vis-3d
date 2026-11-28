/**
 * Lying snow: from a datapoint of the user's choice (snow yes/no or depth in
 * cm) or the modelled snow depth of Open-Meteo for the ioBroker location.
 */
import type { StateValue } from '../iobroker/backend';

/** Snow depth in cm → how much of the outdoor surfaces is covered (0…1); a dusting already shows. */
export function snowAmount(depthCm: number | undefined): number {
    if (depthCm === undefined || !Number.isFinite(depthCm) || depthCm < 0.3) return 0;
    return Math.min(1, 0.3 + (depthCm / 10) * 0.7);
}

/** A datapoint value as snow depth in cm: booleans mean "snow lies" (a closed cover), numbers are cm. */
export function snowDepthFromState(v: StateValue | undefined): number | undefined {
    if (typeof v === 'boolean') return v ? 10 : 0;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, v) : undefined;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === 'ja' || s === 'on') return 10;
        if (s === 'false' || s === 'nein' || s === 'off') return 0;
        const n = Number(s.replace(',', '.'));
        return s !== '' && Number.isFinite(n) ? Math.max(0, n) : undefined;
    }
    return undefined;
}

export const openMeteoUrl = (lat: number, lon: number) =>
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&current=snow_depth&hourly=snow_depth&past_days=1&forecast_days=1&timezone=GMT';

interface OpenMeteoResponse {
    current?: { time?: string; snow_depth?: number | null };
    hourly?: { time?: string[]; snow_depth?: (number | null)[] };
}

/** Snow depth in cm from an Open-Meteo answer (metres): the current value, else the hour closest to now. */
export function openMeteoSnowDepth(json: OpenMeteoResponse, now = new Date()): { depthCm: number; time: Date } | null {
    const cur = json.current;
    if (cur && typeof cur.snow_depth === 'number') return { depthCm: cur.snow_depth * 100, time: parseGmt(cur.time) ?? now };
    const times = json.hourly?.time ?? [];
    const values = json.hourly?.snow_depth ?? [];
    let best: { depthCm: number; time: Date } | null = null;
    let bestDiff = Infinity;
    times.forEach((t, i) => {
        const v = values[i];
        const d = parseGmt(t);
        if (typeof v !== 'number' || !d) return;
        const diff = Math.abs(d.getTime() - now.getTime());
        if (diff < bestDiff) {
            bestDiff = diff;
            best = { depthCm: v * 100, time: d };
        }
    });
    return best;
}

/** Open-Meteo times with timezone=GMT come without a zone: "2026-11-28T07:00". */
function parseGmt(t: string | undefined): Date | null {
    if (!t) return null;
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- fetching, shared by all users of the value ----------

const REFRESH_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<{ depthCm: number; time: Date } | null> }>();

/** Snow depth for a location, fetched at most every 30 minutes. */
export function fetchOpenMeteoSnow(lat: number, lon: number): Promise<{ depthCm: number; time: Date } | null> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < REFRESH_MS) return hit.promise;
    const promise = fetch(openMeteoUrl(lat, lon))
        .then(r => {
            if (!r.ok) throw new Error(`Open-Meteo: HTTP ${r.status}`);
            return r.json() as Promise<OpenMeteoResponse>;
        })
        .then(j => openMeteoSnowDepth(j));
    // failures are retried on the next call
    promise.catch(() => cache.delete(key));
    cache.set(key, { at: Date.now(), promise });
    return promise;
}
