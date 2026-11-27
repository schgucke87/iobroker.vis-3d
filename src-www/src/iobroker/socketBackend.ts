import { Connection } from '@iobroker/socket-client';
import type { Backend, DatapointInfo, EnumInfo, FileStore, StateInfo, StateValue } from './backend';
import { objectName } from './backend';

/** Namespace of the adapter instance's file storage (meta object "vis-3d.0"). */
export const FILE_NAMESPACE = 'vis-3d.0';

/** Connection to ioBroker through the web adapter's socket.io / websocket endpoint. */
export class SocketBackend implements Backend {
    kind = 'iobroker' as const;
    label: string;
    files: FileStore | null;
    private datapoints: Promise<DatapointInfo[]> | null = null;

    constructor(
        private conn: Connection,
        host: string,
        hasFileStorage: boolean,
    ) {
        this.label = hasFileStorage
            ? `ioBroker (${host})`
            : `ioBroker (${host}) – Adapter vis-3d nicht installiert, Projekt wird im Browser gespeichert`;
        this.files = hasFileStorage ? new IoBrokerFiles(conn) : null;
    }

    /** Connects and waits for the first successful connection (or fails after `timeoutMs`). */
    static async connect(opts: { host?: string; port?: number; protocol?: string }, timeoutMs = 8000): Promise<SocketBackend> {
        const conn = new Connection({
            name: 'vis-3d',
            host: opts.host ?? location.hostname,
            port: opts.port ?? (location.port || (location.protocol === 'https:' ? 443 : 80)),
            protocol: (opts.protocol ?? location.protocol) as 'http:' | 'https:',
            doNotLoadAllObjects: true,
            doNotLoadACL: true,
            autoSubscribes: [],
        });
        await Promise.race([
            conn.waitForFirstConnection(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung beim Verbinden mit ioBroker')), timeoutMs)),
        ]);
        // project files need the adapter's meta object; without it (e.g. dev mode against a
        // system where vis-3d is not installed yet) fall back to browser storage
        const meta = await conn.getObject(FILE_NAMESPACE).catch(() => null);
        return new SocketBackend(conn, opts.host ? `${opts.host}${opts.port ? `:${opts.port}` : ''}` : location.host, meta?.type === 'meta');
    }

    subscribe(ids: string[], cb: (id: string, s: StateInfo | null) => void) {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length) return () => {};
        const handler = (id: string, state: ioBroker.State | null | undefined) =>
            cb(id, state ? { val: state.val as StateValue, ack: state.ack, ts: state.ts } : null);
        void this.conn.subscribeState(unique, handler);
        // subscribeState delivers changes; fetch the current values explicitly
        void this.conn.getStates(unique).then(states => {
            for (const id of unique) handler(id, states[id]);
        });
        return () => this.conn.unsubscribeState(unique, handler);
    }

    setState(id: string, val: StateValue) {
        return this.conn.setState(id, val as ioBroker.StateValue, false);
    }

    listDatapoints(): Promise<DatapointInfo[]> {
        if (!this.datapoints) {
            this.datapoints = (async () => {
                const [states, channels, devices, rooms, functions] = await Promise.all([
                    this.conn.getObjectViewSystem('state', '', '香'),
                    this.conn.getObjectViewSystem('channel', '', '香'),
                    this.conn.getObjectViewSystem('device', '', '香'),
                    this.conn.getEnums('rooms'),
                    this.conn.getEnums('functions'),
                ]);
                const parentNames = { ...channels, ...devices } as Record<string, ioBroker.Object>;
                const membership = (enums: Record<string, ioBroker.EnumObject>) => {
                    const map = new Map<string, string[]>();
                    for (const e of Object.values(enums)) {
                        const name = objectName(e.common?.name, e._id.split('.').pop()!);
                        for (const m of e.common?.members ?? []) map.set(m, [...(map.get(m) ?? []), name]);
                    }
                    return map;
                };
                const roomMap = membership(rooms);
                const fnMap = membership(functions);
                /** enums are usually assigned to a channel or device: walk up the id. */
                const lookup = (map: Map<string, string[]>, id: string) => {
                    const parts = id.split('.');
                    while (parts.length > 2) {
                        const hit = map.get(parts.join('.'));
                        if (hit) return hit;
                        parts.pop();
                    }
                    return [];
                };
                return Object.values(states).map(o => {
                    const c = (o.common ?? {}) as ioBroker.StateCommon;
                    let name = objectName(c.name, '');
                    if (!name) {
                        const parent = parentNames[o._id.split('.').slice(0, -1).join('.')];
                        name = parent ? `${objectName(parent.common?.name, '')} ${o._id.split('.').pop()}` : o._id.split('.').pop()!;
                    }
                    return {
                        id: o._id,
                        name,
                        role: c.role,
                        type: c.type,
                        unit: c.unit,
                        write: c.write !== false,
                        min: c.min,
                        max: c.max,
                        rooms: lookup(roomMap, o._id),
                        functions: lookup(fnMap, o._id),
                    };
                });
            })().catch(err => {
                this.datapoints = null;
                throw err;
            });
        }
        return this.datapoints;
    }

    async listRooms(): Promise<EnumInfo[]> {
        const rooms = await this.conn.getEnums('rooms');
        return Object.values(rooms).map(e => ({
            id: e._id,
            name: objectName(e.common?.name, e._id.split('.').pop()!),
            members: e.common?.members ?? [],
        }));
    }
}

class IoBrokerFiles implements FileStore {
    constructor(private conn: Connection) {}

    async readText(path: string) {
        try {
            const res = await this.conn.readFile(FILE_NAMESPACE, path);
            return typeof res.file === 'string' ? res.file : null;
        } catch {
            return null; // not found
        }
    }

    writeText(path: string, text: string) {
        return this.conn.writeFile64(FILE_NAMESPACE, path, new TextEncoder().encode(text).buffer as ArrayBuffer);
    }

    async readBinary(path: string) {
        try {
            const res = await this.conn.readFile(FILE_NAMESPACE, path, true);
            const s = atob(res.file);
            const bytes = new Uint8Array(s.length);
            for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
            return bytes.buffer;
        } catch {
            return null;
        }
    }

    writeBinary(path: string, data: ArrayBuffer) {
        return this.conn.writeFile64(FILE_NAMESPACE, path, data);
    }

    async delete(path: string) {
        try {
            await this.conn.deleteFile(FILE_NAMESPACE, path);
        } catch {
            // already gone
        }
    }
}
