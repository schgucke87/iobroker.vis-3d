/**
 * Project persistence.
 * - With ioBroker: the adapter instance's file storage, vis-3d.0/main/project.json
 *   (models in vis-3d.0/main/assets/), so every browser sees the same project.
 * - Standalone: the browser's localStorage (models in IndexedDB).
 * Plus JSON export/import with the models embedded.
 */
import type { Project } from '../model/types';
import { normalizeProject } from '../model/store';
import { base64ToBuffer, bufferToBase64, getAssetData, putAssetData, setAssetFiles } from '../assets/assetStore';
import type { FileStore } from '../iobroker/backend';

const PROJECT_FILE = 'main/project.json';
let files: FileStore | null = null;

/** Switches project and asset storage to ioBroker files (null = browser storage). */
export function useFileStore(f: FileStore | null) {
    files = f;
    setAssetFiles(f);
}

export const storageLabel = () => (files ? 'ioBroker (vis-3d.0/main)' : 'Browser');

function valid(p: Project | null | undefined): p is Project {
    return !!p && p.version === 1 && Array.isArray(p.floors) && p.floors.length > 0;
}

export async function loadProject(): Promise<Project | null> {
    if (files) {
        const text = await files.readText(PROJECT_FILE);
        if (!text) return null;
        try {
            const p = JSON.parse(text) as Project;
            return valid(p) ? normalizeProject(p) : null;
        } catch {
            return null;
        }
    }
    return loadLocal();
}

export async function saveProject(p: Project): Promise<void> {
    if (files) await files.writeText(PROJECT_FILE, JSON.stringify(p));
    else saveLocal(p);
}

/** Project file format: the project plus the imported models embedded as base64 GLB. */
interface ProjectFile extends Project {
    assetData?: Record<string, string>;
}

const KEY = 'vis3d.project';

export function loadLocal(): Project | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as Project;
        return valid(p) ? normalizeProject(p) : null;
    } catch {
        return null;
    }
}

export function saveLocal(p: Project): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        // storage full or unavailable (e.g. very large background images)
    }
}

export async function exportProject(p: Project) {
    const assetData: Record<string, string> = {};
    for (const id of Object.keys(p.assets)) {
        const data = await getAssetData(id);
        if (data) assetData[id] = bufferToBase64(data);
    }
    const file: ProjectFile = { ...p, assetData };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_') || 'projekt'}.vis3d.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importProjectFile(): Promise<Project> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return reject(new Error('Keine Datei gewählt'));
            try {
                const { assetData, ...p } = JSON.parse(await file.text()) as ProjectFile;
                if (p.version !== 1 || !Array.isArray(p.floors)) throw new Error('Unbekanntes Dateiformat');
                for (const [id, b64] of Object.entries(assetData ?? {})) await putAssetData(id, base64ToBuffer(b64));
                resolve(normalizeProject(p));
            } catch (e) {
                reject(e);
            }
        };
        input.click();
    });
}

export function readImageFile(): Promise<{ src: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return reject(new Error('Keine Datei gewählt'));
            const reader = new FileReader();
            reader.onload = () => {
                const src = reader.result as string;
                const img = new Image();
                img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
                img.src = src;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    });
}
