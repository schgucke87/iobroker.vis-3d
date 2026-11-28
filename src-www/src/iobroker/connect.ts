import { create } from 'zustand';
import type { Backend, StateInfo, StateValue } from './backend';
import { DemoBackend } from './demoBackend';
import type { Project } from '../model/types';
import { behaviorStateIds } from '../model/behaviors';
import { weatherIds } from '../model/weather';

/**
 * Chooses the data source at startup:
 * - `?demo`               → simulated datapoints
 * - `?host=192.168.1.5:8082` → ioBroker web adapter on another host (handy with `npm run dev`)
 * - otherwise             → the web adapter that serves this page; falls back to demo data
 */
export async function initBackend(): Promise<Backend> {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) return setBackend(new DemoBackend(), null);

    const remote = params.get('host');
    try {
        const { SocketBackend } = await import('./socketBackend');
        if (remote) {
            const url = new URL(remote.includes('://') ? remote : `${location.protocol}//${remote}`);
            await loadScript(`${url.origin}/lib/js/socket.io.js`);
            const b = await SocketBackend.connect({ host: url.hostname, port: Number(url.port) || undefined, protocol: url.protocol });
            return setBackend(b, null);
        }
        await loadScript('../lib/js/socket.io.js');
        await loadScript('_socket/info.js').catch(() => undefined); // optional: socket URL of the web adapter
        if (!(window as unknown as { io?: unknown }).io) throw new Error('Kein ioBroker web-Adapter gefunden');
        return setBackend(await SocketBackend.connect({}), null);
    } catch (e) {
        return setBackend(new DemoBackend(), String((e as Error)?.message ?? e));
    }
}

function loadScript(src: string, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        const timer = setTimeout(() => reject(new Error(`Zeitüberschreitung: ${src}`)), timeoutMs);
        el.onload = () => {
            clearTimeout(timer);
            resolve();
        };
        el.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Nicht gefunden: ${src}`));
        };
        document.head.appendChild(el);
    });
}

// ---------------------------------------------------------------------------

interface ConnectionState {
    backend: Backend | null;
    /** Why the app runs on demo data although ioBroker was expected. */
    fallbackReason: string | null;
    values: Record<string, StateInfo | null>;
}

export const useConnection = create<ConnectionState>(() => ({ backend: null, fallbackReason: null, values: {} }));

function setBackend(b: Backend, reason: string | null): Backend {
    useConnection.setState({ backend: b, fallbackReason: reason });
    return b;
}

export const getBackend = () => useConnection.getState().backend;

/** Live value of a datapoint (undefined while unknown). */
export function useStateValue(id: string | undefined): StateValue | undefined {
    return useConnection(s => (id ? s.values[id]?.val : undefined));
}

export function setStateValue(id: string, val: StateValue) {
    const b = getBackend();
    if (b && id) void b.setState(id, val);
}

// ---------- subscriptions follow the datapoints the project uses ----------

const active = new Map<string, () => void>();
let pending: Record<string, StateInfo | null> = {};
let flushQueued = false;

function onValue(id: string, s: StateInfo | null) {
    pending[id] = s;
    if (!flushQueued) {
        flushQueued = true;
        // batch bursts of updates into one render
        requestAnimationFrame(() => {
            flushQueued = false;
            const batch = pending;
            pending = {};
            useConnection.setState(st => ({ values: { ...st.values, ...batch } }));
        });
    }
}

export function syncSubscriptions(ids: Iterable<string>) {
    const b = getBackend();
    if (!b) return;
    const wanted = new Set([...ids].filter(Boolean));
    for (const [id, unsub] of active) {
        if (!wanted.has(id)) {
            unsub();
            active.delete(id);
        }
    }
    const added = [...wanted].filter(id => !active.has(id));
    if (!added.length) return;
    const unsub = b.subscribe(added, onValue);
    // one shared unsubscribe for the batch; only call it when all of them are gone
    let remaining = added.length;
    for (const id of added) {
        active.set(id, () => {
            if (--remaining === 0) unsub();
        });
    }
}

/** All datapoint ids referenced by a project. */
export function projectStateIds(p: Project): Set<string> {
    const ids = new Set<string>();
    for (const f of p.floors) {
        for (const o of Object.values(f.objects)) for (const b of o.behaviors ?? []) behaviorStateIds(b).forEach(id => ids.add(id));
        for (const w of Object.values(f.walls)) {
            for (const o of w.openings) {
                if (o.stateId) ids.add(o.stateId);
                if (o.blindId) ids.add(o.blindId);
            }
        }
        for (const rf of f.roof?.features ?? []) if (rf.stateId) ids.add(rf.stateId);
        for (const r of Object.values(f.rooms)) {
            if (r.temperatureId) ids.add(r.temperatureId);
            if (r.humidityId) ids.add(r.humidityId);
        }
    }
    if (p.style?.weather === 'live' && p.style.weatherChannel) weatherIds(p.style.weatherChannel).forEach(id => ids.add(id));
    return ids;
}
