import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { allAssets, useEditor } from '../model/store';
import type { AssetCategory, AssetMeta, Mount } from '../model/types';
import { createBuiltin, disposeObject, isBuiltin } from '../assets/builtin';
import { deleteAssetData, invalidateAsset, putAssetData } from '../assets/assetStore';
import {
    ACCEPT,
    exportGLB,
    prepareModel,
    readModelFiles,
    renderThumbnail,
    UNIT_FACTOR,
    type RawModel,
    type Unit,
} from '../assets/importer';
import { uid } from '../model/ops';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
    furniture: 'Möbel',
    lighting: 'Leuchten',
    appliance: 'Geräte',
    decor: 'Deko',
    other: 'Sonstiges',
};
export const MOUNT_LABELS: Record<Mount, string> = { floor: 'Boden', wall: 'Wand', ceiling: 'Decke' };

const builtinThumbs = new Map<string, string>();
function thumbnailFor(a: AssetMeta): string | undefined {
    if (a.thumbnail) return a.thumbnail;
    if (!isBuiltin(a.id)) return undefined;
    let t = builtinThumbs.get(a.id);
    if (!t) {
        const obj = createBuiltin(a.id);
        if (!obj) return undefined;
        t = renderThumbnail(obj);
        disposeObject(obj);
        builtinThumbs.set(a.id, t);
    }
    return t;
}

export function LibraryPanel() {
    const project = useEditor(s => s.project);
    const placeAssetId = useEditor(s => s.placeAssetId);
    const tool = useEditor(s => s.tool);
    const s = useEditor.getState;
    const [filter, setFilter] = useState<AssetCategory | 'all'>('all');
    const [query, setQuery] = useState('');
    const [importing, setImporting] = useState<File[] | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const assets = useMemo(() => allAssets(project), [project]);
    const shown = assets.filter(
        a => (filter === 'all' || a.category === filter) && (!query || a.name.toLowerCase().includes(query.toLowerCase())),
    );

    const pickFiles = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = ACCEPT;
        input.onchange = () => input.files?.length && setImporting([...input.files]);
        input.click();
    };

    return (
        <div
            className={`panel library ${dragOver ? 'drag-over' : ''}`}
            onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) setImporting([...e.dataTransfer.files]);
            }}
        >
            <button className="import-btn" onClick={pickFiles}>
                ⤓ Modell importieren …
            </button>
            <div className="hint-small">GLB, glTF, OBJ (+MTL), FBX, STL – auch per Drag & Drop. Texturen einfach mit auswählen.</div>
            <input className="search" placeholder="Suchen …" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="chips">
                {(['all', 'furniture', 'lighting', 'appliance', 'decor', 'other'] as const).map(c => (
                    <button key={c} className={filter === c ? 'active' : ''} onClick={() => setFilter(c)}>
                        {c === 'all' ? 'Alle' : CATEGORY_LABELS[c]}
                    </button>
                ))}
            </div>
            <div className="asset-grid">
                {shown.map(a => (
                    <div
                        key={a.id}
                        className={`asset-tile ${tool === 'place' && placeAssetId === a.id ? 'active' : ''}`}
                        title={`${a.name} – ${a.size.map(v => v.toFixed(2).replace('.', ',')).join(' × ')} m · ${MOUNT_LABELS[a.mount]}`}
                        onClick={() => s().startPlacing(a.id)}
                    >
                        <div className="thumb">{thumbnailFor(a) ? <img src={thumbnailFor(a)} alt="" /> : <span>?</span>}</div>
                        <div className="asset-name">{a.name}</div>
                        {!isBuiltin(a.id) && (
                            <button
                                className="asset-delete"
                                title="Aus dem Projekt entfernen"
                                onClick={async e => {
                                    e.stopPropagation();
                                    const used = project.floors.reduce(
                                        (n, f) => n + Object.values(f.objects).filter(o => o.assetId === a.id).length,
                                        0,
                                    );
                                    if (!confirm(`„${a.name}“ entfernen?${used ? ` ${used} platzierte(s) Objekt(e) werden ebenfalls gelöscht.` : ''}`)) return;
                                    s().removeAsset(a.id);
                                    await deleteAssetData(a.id);
                                    invalidateAsset(a.id);
                                }}
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {importing && <ImportDialog files={importing} onClose={() => setImporting(null)} />}
        </div>
    );
}

// ---------------------------------------------------------------------------

function ImportDialog({ files, onClose }: { files: File[]; onClose: () => void }) {
    const [raw, setRaw] = useState<RawModel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [category, setCategory] = useState<AssetCategory>('furniture');
    const [mount, setMount] = useState<Mount>('floor');
    const [unit, setUnit] = useState<Unit>('auto');
    const [zUp, setZUp] = useState(false);
    const [rotateY, setRotateY] = useState(0);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        let alive = true;
        readModelFiles(files)
            .then(r => {
                if (!alive) return;
                setRaw(r);
                setName(r.name);
                setZUp(r.format === 'stl');
            })
            .catch(e => alive && setError(String(e?.message ?? e)));
        return () => {
            alive = false;
        };
    }, [files]);

    const effectiveUnit = unit === 'auto' ? (raw?.guessedUnit ?? 'm') : unit;
    const prepared = useMemo(
        () => (raw ? prepareModel(raw.object, { unit: effectiveUnit, zUp, rotateY, scale }) : null),
        [raw, effectiveUnit, zUp, rotateY, scale],
    );

    const setDimension = (axis: 0 | 1 | 2, value: number) => {
        if (!prepared || !(value > 0)) return;
        const current = prepared.size.getComponent(axis);
        if (current > 0) setScale(sc => (sc * value) / current);
    };

    const save = async () => {
        if (!raw || !prepared) return;
        setBusy(true);
        try {
            const id = uid('a');
            const data = await exportGLB(prepared.object);
            await putAssetData(id, data);
            const thumbnail = renderThumbnail(prepared.object);
            const meta: AssetMeta = {
                id,
                name: name.trim() || raw.name,
                category,
                mount,
                size: [prepared.size.x, prepared.size.y, prepared.size.z],
                thumbnail,
                bytes: data.byteLength,
            };
            const st = useEditor.getState();
            st.addAsset(meta);
            invalidateAsset(id);
            st.startPlacing(id);
            onClose();
        } catch (e) {
            setError(`Speichern fehlgeschlagen: ${String((e as Error)?.message ?? e)}`);
        } finally {
            setBusy(false);
        }
    };

    const dim = (v: number) => Number(v.toFixed(3));

    return (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
            <div className="modal import-dialog">
                <header>
                    <h2>Modell importieren</h2>
                    <button onClick={onClose} disabled={busy}>
                        ×
                    </button>
                </header>
                {error && <div className="error">{error}</div>}
                {!raw && !error && <div className="loading">Lade {files.map(f => f.name).join(', ')} …</div>}
                {raw && prepared && (
                    <div className="import-body">
                        <div className="import-preview">
                            <PreviewCanvas object={prepared.object} size={prepared.size} />
                            <div className="preview-caption">
                                Raster: 1 m · Front des Modells zeigt zum Betrachter (blaue Linie)
                            </div>
                        </div>
                        <div className="import-form">
                            <label className="field">
                                <span>Name</span>
                                <input value={name} onChange={e => setName(e.target.value)} />
                            </label>
                            <label className="field">
                                <span>Kategorie</span>
                                <select value={category} onChange={e => setCategory(e.target.value as AssetCategory)}>
                                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="field">
                                <span>Befestigung</span>
                                <select value={mount} onChange={e => setMount(e.target.value as Mount)}>
                                    {Object.entries(MOUNT_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <h3>Ausrichtung & Größe</h3>
                            <label className="field">
                                <span>Einheit</span>
                                <select value={unit} onChange={e => setUnit(e.target.value as Unit)}>
                                    <option value="auto">Automatisch ({raw.guessedUnit})</option>
                                    {Object.keys(UNIT_FACTOR).map(u => (
                                        <option key={u} value={u}>
                                            {u}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="field check">
                                <input type="checkbox" checked={zUp} onChange={e => setZUp(e.target.checked)} />
                                <span>Z-Achse zeigt nach oben</span>
                            </label>
                            <div className="field">
                                <span>Drehen</span>
                                <span className="row">
                                    <button onClick={() => setRotateY(r => (r + 270) % 360)}>↺ 90°</button>
                                    <button onClick={() => setRotateY(r => (r + 90) % 360)}>↻ 90°</button>
                                </span>
                            </div>
                            {(['Breite', 'Höhe', 'Tiefe'] as const).map((label, axis) => (
                                <label key={label} className="field">
                                    <span>{label}</span>
                                    <span className="input-unit">
                                        <input
                                            type="number"
                                            step={0.01}
                                            min={0.001}
                                            value={dim(prepared.size.getComponent(axis))}
                                            onChange={e => setDimension(axis as 0 | 1 | 2, parseFloat(e.target.value))}
                                        />
                                        <em>m</em>
                                    </span>
                                </label>
                            ))}
                            <div className="info">
                                {raw.format.toUpperCase()} · {raw.triangles.toLocaleString('de-DE')} Dreiecke
                                {raw.triangles > 300000 && ' – sehr detailliert, kann auf Tablets langsam sein'}
                            </div>
                            <div className="row actions">
                                <button onClick={onClose} disabled={busy}>
                                    Abbrechen
                                </button>
                                <button className="primary" onClick={save} disabled={busy}>
                                    {busy ? 'Speichere …' : 'Zur Bibliothek hinzufügen'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PreviewCanvas({ object, size }: { object: THREE.Object3D; size: THREE.Vector3 }) {
    const radius = Math.max(0.5, size.length() / 2);
    const controls = useRef(null);
    const frontLine = useMemo(() => {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, 0), new THREE.Vector3(0, 0.01, size.z / 2 + 0.3)]);
        return g;
    }, [size.z]);
    const cells = Math.max(4, Math.ceil(radius * 2.5));
    return (
        <Canvas camera={{ position: [radius * 1.6, radius * 1.3, radius * 2.2], fov: 40, near: 0.01, far: 500 }} shadows>
            <color attach="background" args={['#f1f3f6']} />
            <hemisphereLight args={['#ffffff', '#a59d8e', 1.8]} />
            <directionalLight position={[3, 6, 4]} intensity={1.5} />
            <gridHelper args={[cells, cells, '#b4bac4', '#d9dde3']} />
            <primitive object={object} />
            <lineSegments geometry={frontLine}>
                <lineBasicMaterial color="#3b74e8" />
            </lineSegments>
            <OrbitControls ref={controls} target={[0, size.y / 2, 0]} makeDefault />
        </Canvas>
    );
}
