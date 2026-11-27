/**
 * Project persistence. For now the project lives in the browser's
 * localStorage, with JSON export/import. The ioBroker file storage
 * (writeFile('vis-3d.0', '<project>/project.json')) will plug in here.
 */
import type { Project } from '../model/types';

const KEY = 'vis3d.project';

export function loadLocal(): Project | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as Project;
        return p && p.version === 1 && Array.isArray(p.floors) && p.floors.length ? p : null;
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

export function exportProject(p: Project) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
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
                const p = JSON.parse(await file.text()) as Project;
                if (p.version !== 1 || !Array.isArray(p.floors)) throw new Error('Unbekanntes Dateiformat');
                resolve(p);
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
