/**
 * Storage and loading of 3D model assets.
 *
 * Imported models are stored as normalised GLB blobs: with ioBroker in the
 * adapter instance's file storage (vis-3d.0/main/assets/<id>.glb), in the
 * standalone app in the browser's IndexedDB.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createBuiltin, isBuiltin } from './builtin';
import type { FileStore } from '../iobroker/backend';

let remote: FileStore | null = null;
/** Store models in ioBroker's file storage instead of the browser's IndexedDB. */
export function setAssetFiles(f: FileStore | null) {
    remote = f;
}
const assetPath = (id: string) => `main/assets/${id}.glb`;

const DB_NAME = 'vis3d-assets';
const STORE = 'glb';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return db().then(
        d =>
            new Promise<T>((resolve, reject) => {
                const req = fn(d.transaction(STORE, mode).objectStore(STORE));
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            }),
    );
}

export const putAssetData = (id: string, data: ArrayBuffer): Promise<unknown> =>
    remote ? remote.writeBinary(assetPath(id), data) : tx('readwrite', s => s.put(data, id));
export const getAssetData = async (id: string): Promise<ArrayBuffer | undefined> =>
    remote ? ((await remote.readBinary(assetPath(id))) ?? undefined) : tx<ArrayBuffer | undefined>('readonly', s => s.get(id));
export const deleteAssetData = (id: string): Promise<unknown> =>
    remote ? remote.delete(assetPath(id)) : tx('readwrite', s => s.delete(id));

// ---------- loading ----------

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<THREE.Object3D | null>>();
const listeners = new Set<() => void>();

/** Loads an asset's prototype object (shared; clone it before adding to a scene). */
export function loadAsset(id: string): Promise<THREE.Object3D | null> {
    let p = cache.get(id);
    if (!p) {
        p = (async () => {
            if (isBuiltin(id)) return createBuiltin(id);
            const data = await getAssetData(id);
            if (!data) return null;
            const gltf = await loader.parseAsync(data, '');
            gltf.scene.traverse(o => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                    m.castShadow = true;
                    m.receiveShadow = true;
                }
            });
            return gltf.scene;
        })().catch(err => {
            console.error(`Asset ${id} konnte nicht geladen werden`, err);
            return null;
        });
        cache.set(id, p);
    }
    return p;
}

/** Forget a cached asset (after deleting or replacing it). */
export function invalidateAsset(id: string) {
    cache.delete(id);
    listeners.forEach(l => l());
}

export function onAssetsChanged(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * Deep clone with its own materials, so each placed instance can be faded or
 * tinted independently. Geometry and textures stay shared.
 */
export function cloneInstance(proto: THREE.Object3D): THREE.Object3D {
    const copy = proto.clone(true);
    copy.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
    });
    return copy;
}

// ---------- export / import of asset data inside project files ----------

export function bufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
}
