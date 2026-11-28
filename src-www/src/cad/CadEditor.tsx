import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadDoc, CadPrimitive, CadShape } from './types';
import { useTheme } from '../ui/theme';
import {
    HOLE_MATERIAL,
    baseGeometry,
    cloneShape,
    docToObject,
    dropToFloor,
    groupShapes,
    newShape,
    setShapeMatrix,
    shapeBox,
    shapeLabel,
    ungroupShape,
} from './csg';
import type { AssetCategory, AssetMeta, Mount } from '../model/types';
import { CATEGORY_LABELS, MOUNT_LABELS } from '../ui/Library';
import { ColorField } from '../ui/Style';
import { exportGLB, prepareModel, renderThumbnail } from '../assets/importer';
import { invalidateAsset, putAssetData } from '../assets/assetStore';
import { useEditor } from '../model/store';
import { uid } from '../model/ops';

const PART_COLORS = ['#c49a6c', '#8b5e3c', '#e8e2d6', '#f5f3ee', '#3f4247', '#7d8a99', '#b23a3a', '#5f8a43', '#d9c27e', '#9aa3ad'];

interface PaletteItem {
    label: string;
    kind: CadPrimitive;
    size: [number, number, number];
    hole?: boolean;
    rotation?: [number, number, number];
}

const PALETTE: { title: string; items: PaletteItem[] }[] = [
    {
        title: 'Körper',
        items: [
            { label: 'Quader', kind: 'box', size: [0.4, 0.4, 0.4] },
            { label: 'Platte', kind: 'box', size: [1.0, 0.02, 0.6] },
            { label: 'Brett', kind: 'box', size: [0.6, 0.3, 0.02] },
            { label: 'Kantholz', kind: 'box', size: [0.05, 0.7, 0.05] },
            { label: 'Zylinder', kind: 'cylinder', size: [0.4, 0.4, 0.4] },
            { label: 'Rundstab', kind: 'cylinder', size: [0.04, 0.7, 0.04] },
            { label: 'Kugel', kind: 'sphere', size: [0.3, 0.3, 0.3] },
            { label: 'Kegel', kind: 'cone', size: [0.4, 0.4, 0.4] },
            { label: 'Keil', kind: 'wedge', size: [0.4, 0.4, 0.4] },
            { label: 'Halbzylinder', kind: 'halfCylinder', size: [0.4, 0.2, 0.4] },
        ],
    },
    {
        title: 'Bohrungen',
        items: [
            { label: 'Bohrung rund', kind: 'cylinder', size: [0.1, 0.4, 0.1], hole: true },
            { label: 'Bohrung eckig', kind: 'box', size: [0.2, 0.4, 0.2], hole: true },
            { label: 'Ausschnitt', kind: 'box', size: [0.5, 0.3, 0.5], hole: true },
            { label: 'Rundung', kind: 'halfCylinder', size: [0.2, 0.1, 0.6], hole: true },
        ],
    },
];

type Mode = 'translate' | 'rotate' | 'scale';

export interface CadEditorProps {
    /** Asset to edit (with its CAD document), or undefined for a new piece. */
    asset?: AssetMeta;
    onClose: () => void;
}

export function CadEditor({ asset, onClose }: CadEditorProps) {
    const [doc, setDocState] = useState<CadDoc>(() => (asset?.cad ? structuredClone(asset.cad) : { version: 1, shapes: [] }));
    const [selected, setSelected] = useState<string[]>([]);
    const [mode, setMode] = useState<Mode>('translate');
    const [name, setName] = useState(asset?.name ?? 'Eigenes Möbel');
    const [category, setCategory] = useState<AssetCategory>(asset?.category ?? 'furniture');
    const [mount, setMount] = useState<Mount>(asset?.mount ?? 'floor');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const history = useRef<{ past: CadDoc[]; future: CadDoc[] }>({ past: [], future: [] });
    const [, bump] = useState(0);
    const dirty = useRef(false);

    /** Changes the document as one undo step. */
    const setDoc = useCallback((next: CadDoc | ((d: CadDoc) => CadDoc)) => {
        setDocState(prev => {
            const value = typeof next === 'function' ? next(prev) : next;
            if (value !== prev) {
                history.current.past.push(prev);
                if (history.current.past.length > 100) history.current.past.shift();
                history.current.future = [];
                dirty.current = true;
                bump(n => n + 1);
            }
            return value;
        });
    }, []);
    const undo = useCallback(() => {
        const prev = history.current.past.pop();
        if (!prev) return;
        setDocState(cur => {
            history.current.future.push(cur);
            return prev;
        });
        bump(n => n + 1);
    }, []);
    const redo = useCallback(() => {
        const next = history.current.future.pop();
        if (!next) return;
        setDocState(cur => {
            history.current.past.push(cur);
            return next;
        });
        bump(n => n + 1);
    }, []);

    const sel = doc.shapes.filter(s => selected.includes(s.id));
    const single = sel.length === 1 ? sel[0] : null;

    const updateShape = (id: string, patch: Partial<CadShape> | ((s: CadShape) => CadShape)) =>
        setDoc(d => ({ ...d, shapes: d.shapes.map(s => (s.id === id ? (typeof patch === 'function' ? patch(s) : { ...s, ...patch }) : s)) }));

    // ---------- commands ----------
    const add = (item: PaletteItem) => {
        // place new parts next to what is there, on the work plane
        const box = new THREE.Box3();
        doc.shapes.forEach(s => box.union(shapeBox(s)));
        const x = box.isEmpty() ? 0 : box.max.x + item.size[0] / 2 + 0.1;
        const s = newShape(item.kind, item.size, {
            hole: !!item.hole,
            color: PART_COLORS[doc.shapes.filter(x => !x.hole).length % PART_COLORS.length],
            position: [Math.round(x * 100) / 100, item.size[1] / 2, 0],
            rotation: item.rotation ?? [0, 0, 0],
        });
        setDoc(d => ({ ...d, shapes: [...d.shapes, s] }));
        setSelected([s.id]);
    };
    const remove = () => {
        if (!sel.length) return;
        setDoc(d => ({ ...d, shapes: d.shapes.filter(s => !selected.includes(s.id)) }));
        setSelected([]);
    };
    const duplicate = () => {
        if (!sel.length) return;
        const copies = sel.map(s => {
            const c = cloneShape(s);
            c.position = [s.position[0] + 0.1, s.position[1], s.position[2] + 0.1];
            return c;
        });
        setDoc(d => ({ ...d, shapes: [...d.shapes, ...copies] }));
        setSelected(copies.map(c => c.id));
    };
    const group = () => {
        if (sel.length < 2) return;
        const g = groupShapes(sel);
        setDoc(d => ({ ...d, shapes: [...d.shapes.filter(s => !selected.includes(s.id)), g] }));
        setSelected([g.id]);
    };
    const ungroup = () => {
        const groups = sel.filter(s => s.kind === 'group');
        if (!groups.length) return;
        const parts = groups.flatMap(ungroupShape);
        setDoc(d => ({ ...d, shapes: [...d.shapes.filter(s => !groups.some(g => g.id === s.id)), ...parts] }));
        setSelected(parts.map(p => p.id));
    };
    const toggleHole = () => sel.forEach(s => updateShape(s.id, { hole: !s.hole }));

    // ---------- keyboard ----------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
            const mod = e.ctrlKey || e.metaKey;
            const k = e.key.toLowerCase();
            let handled = true;
            if (mod && k === 'z') e.shiftKey ? redo() : undo();
            else if (mod && k === 'y') redo();
            else if (mod && k === 'g') e.shiftKey ? ungroup() : group();
            else if (mod && k === 'd') duplicate();
            else if (mod && k === 'a') setSelected(doc.shapes.map(s => s.id));
            else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) remove();
            else if (!mod && k === 'h') toggleHole();
            else if (!mod && k === 't') setMode('translate');
            else if (!mod && k === 'r') setMode('rotate');
            else if (!mod && k === 's') setMode('scale');
            else if (e.key === 'Escape') setSelected([]);
            else handled = false;
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    // ---------- saving ----------
    const save = async () => {
        setError(null);
        const obj = docToObject(doc);
        if (!obj) {
            setError('Es gibt noch keinen Körper – nur Bohrungen lassen sich nicht speichern.');
            return;
        }
        setBusy(true);
        try {
            const prepared = prepareModel(obj, { unit: 'm', zUp: false, rotateY: 0, scale: 1 });
            const id = asset?.id ?? uid('a');
            const data = await exportGLB(prepared.object);
            await putAssetData(id, data);
            const meta: AssetMeta = {
                id,
                name: name.trim() || 'Eigenes Möbel',
                category,
                mount,
                size: [prepared.size.x, prepared.size.y, prepared.size.z],
                thumbnail: renderThumbnail(prepared.object),
                bytes: data.byteLength,
                cad: doc,
            };
            const st = useEditor.getState();
            st.addAsset(meta);
            invalidateAsset(id);
            if (!asset) st.startPlacing(id);
            dirty.current = false;
            onClose();
        } catch (e) {
            setError(`Speichern fehlgeschlagen: ${String((e as Error)?.message ?? e)}`);
        } finally {
            setBusy(false);
        }
    };
    const cancel = () => {
        if (dirty.current && !confirm('Änderungen verwerfen?')) return;
        onClose();
    };

    const total = useMemo(() => {
        const box = new THREE.Box3();
        doc.shapes.filter(s => !s.hole).forEach(s => box.union(shapeBox(s)));
        return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
    }, [doc]);

    return (
        <div className="modal-backdrop cad-backdrop">
            <div className="modal cad-editor">
                <header className="cad-toolbar">
                    <h2>Möbel bauen</h2>
                    <div className="group">
                        <button onClick={undo} disabled={!history.current.past.length} title="Rückgängig (Strg+Z)">
                            ↶
                        </button>
                        <button onClick={redo} disabled={!history.current.future.length} title="Wiederholen (Strg+Y)">
                            ↷
                        </button>
                    </div>
                    <div className="group">
                        {(['translate', 'rotate', 'scale'] as Mode[]).map(m => (
                            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} title={{ translate: 'Verschieben (T)', rotate: 'Drehen (R)', scale: 'Größe ziehen (S)' }[m]}>
                                {{ translate: '✥ Verschieben', rotate: '⟳ Drehen', scale: '⤡ Größe' }[m]}
                            </button>
                        ))}
                    </div>
                    <div className="group">
                        <button onClick={() => setSelected(doc.shapes.map(s => s.id))} disabled={!doc.shapes.length} title="Alles auswählen (Strg+A)">
                            Alle
                        </button>
                        <button onClick={group} disabled={sel.length < 2} title="Gruppieren (Strg+G) – Körper werden vereint, Bohrungen ausgeschnitten">
                            ⊞ Gruppieren
                        </button>
                        <button onClick={ungroup} disabled={!sel.some(s => s.kind === 'group')} title="Gruppierung lösen (Strg+Umschalt+G)">
                            ⊟ Lösen
                        </button>
                        <button onClick={duplicate} disabled={!sel.length} title="Duplizieren (Strg+D)">
                            ⧉
                        </button>
                        <button onClick={remove} disabled={!sel.length} className="danger" title="Löschen (Entf)">
                            🗑
                        </button>
                    </div>
                    <div className="spacer" />
                    <button onClick={cancel} disabled={busy}>
                        Abbrechen
                    </button>
                    <button className="primary" onClick={save} disabled={busy || !doc.shapes.length}>
                        {busy ? 'Speichere …' : asset ? 'Speichern' : 'In Bibliothek speichern'}
                    </button>
                </header>
                {error && <div className="error">{error}</div>}
                <div className="cad-body">
                    <aside className="cad-palette">
                        {PALETTE.map(sec => (
                            <div key={sec.title}>
                                <h3>{sec.title}</h3>
                                <div className="cad-palette-grid">
                                    {sec.items.map(it => (
                                        <button key={it.label} className={`cad-tool ${it.hole ? 'hole' : ''}`} onClick={() => add(it)}>
                                            <ShapeIcon kind={it.kind} hole={!!it.hole} />
                                            <span>{it.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="hint-small">
                            Klicken wählt aus, <b>Umschalt</b>+Klick wählt mehrere. Mehrere Teile <b>gruppieren</b>: Körper werden vereint, Bohrungen
                            herausgeschnitten. Raster 1 cm, Drehung in 15°-Schritten.
                        </div>
                    </aside>
                    <div className="cad-view">
                        <Canvas shadows camera={{ position: [1.6, 1.3, 2.0], fov: 40, near: 0.01, far: 100 }} onPointerMissed={() => setSelected([])}>
                            <ThemedBackground light="#eef1f5" dark="#1a1d23" />
                            <hemisphereLight args={['#ffffff', '#a59d8e', 1.6]} />
                            <directionalLight position={[3, 6, 4]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
                            <Workplane />
                            {doc.shapes.map(s => (
                                <ShapeMesh
                                    key={s.id}
                                    shape={s}
                                    selected={selected.includes(s.id)}
                                    single={single?.id === s.id}
                                    mode={mode}
                                    onSelect={(e: ThreeEvent<MouseEvent>) => {
                                        e.stopPropagation();
                                        setSelected(cur => (e.shiftKey ? (cur.includes(s.id) ? cur.filter(x => x !== s.id) : [...cur, s.id]) : [s.id]));
                                    }}
                                    onTransformEnd={m => updateShape(s.id, cur => setShapeMatrix(cur, m))}
                                />
                            ))}
                            <OrbitControls makeDefault target={[0, 0.3, 0]} maxPolarAngle={Math.PI / 2 - 0.02} />
                        </Canvas>
                        <div className="cad-status">
                            {total ? `Gesamt: ${cm(total.x)} × ${cm(total.y)} × ${cm(total.z)} cm (B × H × T)` : 'Leere Arbeitsfläche – links eine Form wählen'}
                        </div>
                    </div>
                    <aside className="cad-props">
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
                        <hr />
                        {single ? (
                            <ShapeProps shape={single} onChange={(patch, step = true) => (step ? updateShape(single.id, patch) : setDocState(d => ({ ...d, shapes: d.shapes.map(s => (s.id === single.id ? { ...s, ...patch } : s)) })))} />
                        ) : sel.length > 1 ? (
                            <>
                                <h3>{sel.length} Teile ausgewählt</h3>
                                <button onClick={group}>⊞ Gruppieren</button>
                                <button onClick={toggleHole}>Körper ↔ Bohrung</button>
                            </>
                        ) : (
                            <div className="hint-small">Nichts ausgewählt.</div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}

const cm = (m: number) => (Math.round(m * 1000) / 10).toLocaleString('de-DE');

function ThemedBackground({ light, dark }: { light: string; dark: string }) {
    const isDark = useTheme(s => s.dark);
    return <color attach="background" args={[isDark ? dark : light]} />;
}

function Workplane() {
    const dark = useTheme(s => s.dark);
    return (
        <group key={dark ? 'd' : 'l'}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
                <planeGeometry args={[6, 6]} />
                <meshStandardMaterial color={dark ? '#262a31' : '#f8f9fb'} roughness={1} />
            </mesh>
            {/* 10 cm grid with 1 m lines */}
            <gridHelper args={[6, 60, dark ? '#3a404b' : '#c9ced6', dark ? '#2e333c' : '#e1e4e9']} position={[0, 0, 0]} />
            <gridHelper args={[6, 6, dark ? '#5a6372' : '#9aa3b0', dark ? '#5a6372' : '#9aa3b0']} position={[0, 0.0005, 0]} />
        </group>
    );
}

function ShapeMesh(props: {
    shape: CadShape;
    selected: boolean;
    single: boolean;
    mode: Mode;
    onSelect: (e: ThreeEvent<MouseEvent>) => void;
    onTransformEnd: (m: THREE.Matrix4) => void;
}) {
    const { shape: s } = props;
    const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
    const base = useMemo(() => baseGeometry(s), [s]);
    const D2R = Math.PI / 180;
    const scale = s.kind === 'group' ? s.size.map((v, i) => v / ((s.baseSize ?? s.size)[i] || 1)) : s.size;
    const material = s.hole ? HOLE_MATERIAL : base?.materials.length === 1 ? base.materials[0] : base?.materials;
    const edges = useMemo(() => (base && props.selected ? new THREE.EdgesGeometry(base.geometry, 30) : null), [base, props.selected]);
    useEffect(() => () => edges?.dispose(), [edges]);
    if (!base) return null;
    return (
        <>
            <mesh
                ref={setMesh}
                geometry={base.geometry}
                material={material}
                position={s.position}
                rotation={[s.rotation[0] * D2R, s.rotation[1] * D2R, s.rotation[2] * D2R]}
                scale={scale as [number, number, number]}
                castShadow={!s.hole}
                receiveShadow
                onClick={props.onSelect}
            >
                {edges && (
                    <lineSegments geometry={edges} raycast={() => null}>
                        <lineBasicMaterial color={s.hole ? '#c43d3d' : '#3b74e8'} />
                    </lineSegments>
                )}
            </mesh>
            {props.single && mesh && (
                <TransformControls
                    object={mesh}
                    mode={props.mode}
                    size={0.7}
                    translationSnap={0.01}
                    rotationSnap={Math.PI / 12}
                    scaleSnap={0.05}
                    onMouseUp={() => {
                        mesh.updateMatrix();
                        props.onTransformEnd(mesh.matrix.clone());
                    }}
                />
            )}
        </>
    );
}

function ShapeProps({ shape: s, onChange }: { shape: CadShape; onChange: (patch: Partial<CadShape>, step?: boolean) => void }) {
    const num = (label: string, value: number, set: (v: number) => void, unit: string, step = 1) => (
        <label className="field compact">
            <span>{label}</span>
            <span className="input-unit">
                <input
                    type="number"
                    step={step}
                    value={Math.round(value * 10) / 10}
                    onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) set(v);
                    }}
                />
                <em>{unit}</em>
            </span>
        </label>
    );
    const vec = (v: [number, number, number], i: number, x: number): [number, number, number] => {
        const c = [...v] as [number, number, number];
        c[i] = x;
        return c;
    };
    const box = shapeBox(s);
    return (
        <>
            <h3>{shapeLabel(s)}</h3>
            <label className="field">
                <span>Bezeichnung</span>
                <input value={s.name ?? ''} placeholder={shapeLabel(s)} onChange={e => onChange({ name: e.target.value || undefined })} />
            </label>
            <div className="row">
                <button className={!s.hole ? 'active' : ''} onClick={() => onChange({ hole: false })}>
                    Körper
                </button>
                <button className={s.hole ? 'active' : ''} onClick={() => onChange({ hole: true })} title="H">
                    Bohrung
                </button>
            </div>
            {!s.hole && s.kind !== 'group' && <ColorField label="Farbe" value={s.color} fallback={s.color} swatches={PART_COLORS} onChange={c => c && onChange({ color: c })} />}
            {s.kind === 'group' && !s.hole && <div className="hint-small">Farben einer Gruppe: Gruppierung lösen, Teile färben, neu gruppieren.</div>}
            <h3>Größe</h3>
            {num('Breite', s.size[0] * 100, v => onChange({ size: vec(s.size, 0, Math.max(0.001, v / 100)) }), 'cm')}
            {num('Höhe', s.size[1] * 100, v => onChange({ size: vec(s.size, 1, Math.max(0.001, v / 100)) }), 'cm')}
            {num('Tiefe', s.size[2] * 100, v => onChange({ size: vec(s.size, 2, Math.max(0.001, v / 100)) }), 'cm')}
            <h3>Position</h3>
            {num('X (links/rechts)', s.position[0] * 100, v => onChange({ position: vec(s.position, 0, v / 100) }), 'cm')}
            {num('Über Boden', box.min.y * 100, v => onChange({ position: vec(s.position, 1, s.position[1] + v / 100 - box.min.y) }), 'cm')}
            {num('Z (vorne/hinten)', s.position[2] * 100, v => onChange({ position: vec(s.position, 2, v / 100) }), 'cm')}
            <button onClick={() => onChange(dropToFloor(s))}>Auf Arbeitsfläche legen</button>
            <h3>Drehung</h3>
            {(['X', 'Y', 'Z'] as const).map((a, i) => num(a, s.rotation[i], v => onChange({ rotation: vec(s.rotation, i, v) }), '°', 15))}
        </>
    );
}

/** Tiny icons for the palette. */
function ShapeIcon({ kind, hole }: { kind: CadPrimitive; hole: boolean }) {
    const fill = hole ? 'none' : '#c49a6c';
    const stroke = hole ? '#6b7280' : '#8b5e3c';
    const dash = hole ? '3 2' : undefined;
    const common = { fill, stroke, strokeWidth: 1.5, strokeDasharray: dash };
    switch (kind) {
        case 'box':
            return (
                <svg viewBox="0 0 32 32">
                    <path d="M6 11 L16 6 L26 11 L26 23 L16 28 L6 23 Z M6 11 L16 16 L26 11 M16 16 L16 28" {...common} />
                </svg>
            );
        case 'cylinder':
            return (
                <svg viewBox="0 0 32 32">
                    <path d="M7 9 C7 5 25 5 25 9 L25 23 C25 27 7 27 7 23 Z M7 9 C7 13 25 13 25 9" {...common} />
                </svg>
            );
        case 'sphere':
            return (
                <svg viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="10" {...common} />
                </svg>
            );
        case 'cone':
            return (
                <svg viewBox="0 0 32 32">
                    <path d="M16 5 L26 24 C26 28 6 28 6 24 Z" {...common} />
                </svg>
            );
        case 'wedge':
            return (
                <svg viewBox="0 0 32 32">
                    <path d="M6 24 L6 10 L18 6 L26 20 L26 24 Z M6 10 L26 24" {...common} />
                </svg>
            );
        case 'halfCylinder':
            return (
                <svg viewBox="0 0 32 32">
                    <path d="M5 22 C5 8 27 8 27 22 Z" {...common} />
                </svg>
            );
    }
}
