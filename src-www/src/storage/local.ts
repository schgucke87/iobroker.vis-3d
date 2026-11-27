/**
 * Project persistence. For now the project lives in the browser's
 * localStorage, with JSON export/import. The ioBroker file storage
 * (writeFile('vis-3d.0', '<project>/project.json')) will plug in here.
 */
import type { Project } from '../model/types';
import { normalizeProject } from '../model/store';
import { base64ToBuffer, bufferToBase64, getAssetData, putAssetData } from '../assets/assetStore';

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
        return p && p.version === 1 && Array.isArray(p.floors) && p.floors.length ? normalizeProject(p) : null;
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
