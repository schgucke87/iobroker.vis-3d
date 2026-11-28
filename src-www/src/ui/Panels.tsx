import { useEffect, useMemo, useState } from 'react';
import { activeFloor, findAsset, floorElevations, useEditor } from '../model/store';
import { MOUNT_LABELS } from './Library';
import { BehaviorList } from './Behaviors';
import { StateIdField } from './Datapoints';
import { detectRooms, wallSideRooms } from '../geometry/rooms';
import { ColorField } from './Style';
import { FLOOR_MATERIALS, projectStyle, SWATCHES } from '../model/style';
import { listMaterials, loadAsset, type ModelMaterial } from '../assets/assetStore';
import { pointInPolygon } from '../geometry/vec';
import { computeWallGeometry } from '../geometry/walls';
import { readImageFile } from '../storage/local';
import type { FloorMaterial, Opening, Roof, RoofType } from '../model/types';
import { DEFAULT_ROOF, ROOF_TYPES, roofFrame, roofTop } from '../geometry/roof';

function NumberField(props: { label: string; value: number; step?: number; min?: number; unit?: string; onChange: (v: number) => void }) {
    return (
        <label className="field">
            <span>{props.label}</span>
            <span className="input-unit">
                <input
                    type="number"
                    step={props.step ?? 0.01}
                    min={props.min}
                    value={Number(props.value.toFixed(3))}
                    onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) props.onChange(v);
                    }}
                />
                {props.unit && <em>{props.unit}</em>}
            </span>
        </label>
    );
}

export function FloorPanel() {
    const project = useEditor(s => s.project);
    const activeId = useEditor(s => activeFloor(s).id);
    const focusFloorId = useEditor(s => s.focusFloorId);
    const s = useEditor.getState;
    const elevations = floorElevations(project);
    const floors = project.floors.map((f, i) => ({ f, i })).reverse();

    return (
        <div className="panel">
            <h3>Stockwerke</h3>
            <button className={`floor-item ${focusFloorId === null ? 'active' : ''}`} onClick={() => s().setFocusFloor(null)}>
                <span>🏠 Gesamtes Gebäude</span>
            </button>
            {floors.map(({ f, i }) => (
                <div key={f.id} className={`floor-item ${f.id === activeId ? 'active' : ''}`} onClick={() => s().setActiveFloor(f.id)}>
                    <span className="floor-name">{f.name}</span>
                    <span className="floor-elev">{elevations[i] >= 0 ? '+' : ''}{elevations[i].toFixed(2).replace('.', ',')}</span>
                    <span className="floor-actions" onClick={e => e.stopPropagation()}>
                        <button title="Nach oben" disabled={i === project.floors.length - 1} onClick={() => s().moveFloor(f.id, 1)}>▲</button>
                        <button title="Nach unten" disabled={i === 0} onClick={() => s().moveFloor(f.id, -1)}>▼</button>
                    </span>
                </div>
            ))}
            <button className="add" onClick={() => s().addFloor()}>
                + Stockwerk hinzufügen
            </button>
            <button className="add" onClick={() => s().addAttic()} title="Neues Geschoss mit Kniestock-Außenwänden und Satteldach">
                + Dachboden mit Dach
            </button>
        </div>
    );
}

export function PropertiesPanel() {
    const floor = useEditor(activeFloor);
    const selection = useEditor(s => s.selection);
    const settings = useEditor(s => s.settings);
    const floorsCount = useEditor(s => s.project.floors.length);
    const s = useEditor.getState;

    const rooms = useMemo(() => detectRooms(floor), [floor]);
    const geometry = useMemo(() => computeWallGeometry(floor), [floor]);
    const style = projectStyle(useEditor(st => st.project));

    let content: React.ReactNode = null;
    if (selection?.kind === 'wall' && floor.walls[selection.id]) {
        const w = floor.walls[selection.id];
        const fr = geometry.frames[w.id];
        content = (
            <>
                <h3>Wand</h3>
                <div className="info">Länge: {fr ? fr.length.toFixed(2).replace('.', ',') : '–'} m</div>
                <NumberField label="Stärke" unit="m" value={w.thickness} min={0.05} onChange={v => s().updateWall(w.id, { thickness: Math.max(0.05, v) })} />
                <div className="presets">
                    {[0.115, 0.175, 0.24, 0.365].map(t => (
                        <button key={t} onClick={() => s().updateWall(w.id, { thickness: t })}>{(t * 100).toFixed(1).replace('.0', '').replace('.', ',')} cm</button>
                    ))}
                </div>
                <NumberField label="Höhe" unit="m" value={w.height} min={0.3} onChange={v => s().updateWall(w.id, { height: Math.max(0.3, v) })} />
                <WallColors wallId={w.id} />
                <div className="info">{w.openings.length} Öffnung(en)</div>
                <button className="danger" onClick={() => s().deleteSelection()}>Wand löschen</button>
            </>
        );
    } else if (selection?.kind === 'opening') {
        const o = floor.walls[selection.wallId]?.openings.find(x => x.id === selection.id);
        if (o) {
            const up = (patch: Partial<Opening>) => s().updateOpening(selection.wallId, o.id, patch);
            content = (
                <>
                    <h3>{o.type === 'door' ? 'Tür' : 'Fenster'}</h3>
                    <NumberField label="Breite" unit="m" value={o.width} min={0.3} onChange={v => up({ width: Math.max(0.3, v) })} />
                    <NumberField label="Höhe" unit="m" value={o.height} min={0.2} onChange={v => up({ height: Math.max(0.2, v) })} />
                    <NumberField label="Brüstung" unit="m" value={o.sill} min={0} onChange={v => up({ sill: Math.max(0, v) })} />
                    <NumberField label="Position" unit="m" value={o.offset} onChange={v => up({ offset: v })} />
                    <h3>{o.type === 'door' ? 'Türkontakt' : 'Fensterkontakt'}</h3>
                    <StateIdField label="Datenpunkt" value={o.stateId} roleHint="sensor" onChange={stateId => up({ stateId: stateId || undefined })} />
                    {o.stateId && (
                        <label className="field check">
                            <input type="checkbox" checked={!!o.invert} onChange={e => up({ invert: e.target.checked })} />
                            <span>Umkehren (wahr = geschlossen)</span>
                        </label>
                    )}
                    {o.type === 'window' && (
                        <>
                            <h3>Rollladen</h3>
                            <StateIdField label="Position (0 = zu, 100 = offen)" value={o.blindId} roleHint="level.blind" onChange={blindId => up({ blindId: blindId || undefined })} />
                            {o.blindId && (
                                <label className="field check">
                                    <input type="checkbox" checked={!!o.blindInvert} onChange={e => up({ blindInvert: e.target.checked })} />
                                    <span>Umkehren (100 = geschlossen)</span>
                                </label>
                            )}
                        </>
                    )}
                    <button className="danger" onClick={() => s().deleteSelection()}>Löschen</button>
                </>
            );
        }
    } else if (selection?.kind === 'node' && floor.nodes[selection.id]) {
        const n = floor.nodes[selection.id];
        content = (
            <>
                <h3>Eckpunkt</h3>
                <NumberField label="X" unit="m" value={n.x} onChange={v => s().editFloor(f => void (f.nodes[n.id].x = v))} />
                <NumberField label="Y" unit="m" value={n.y} onChange={v => s().editFloor(f => void (f.nodes[n.id].y = v))} />
                <button className="danger" onClick={() => s().deleteSelection()}>Punkt und Wände löschen</button>
            </>
        );
    } else if (selection?.kind === 'room') {
        const room = rooms.find(r => pointInPolygon(selection.anchor, r.polygon));
        if (room) {
            content = (
                <>
                    <h3>Raum</h3>
                    <label className="field">
                        <span>Name</span>
                        <input value={room.meta?.name ?? ''} placeholder="Raum" onChange={e => s().updateRoom(selection.anchor, { name: e.target.value })} />
                    </label>
                    <label className="field">
                        <span>ioBroker-Raum</span>
                        <input value={room.meta?.enumId ?? ''} placeholder="enum.rooms.…" onChange={e => s().updateRoom(selection.anchor, { enumId: e.target.value || undefined })} />
                    </label>
                    <h3>Boden</h3>
                    <label className="field">
                        <span>Belag</span>
                        <select
                            value={room.meta?.floorMaterial ?? ''}
                            onChange={e => s().updateRoom(selection.anchor, { floorMaterial: (e.target.value || undefined) as FloorMaterial | undefined })}
                        >
                            <option value="">Standard ({FLOOR_MATERIALS[style.floorMaterial]})</option>
                            {(Object.keys(FLOOR_MATERIALS) as FloorMaterial[]).map(m => (
                                <option key={m} value={m}>
                                    {FLOOR_MATERIALS[m]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <ColorField
                        label="Farbe"
                        value={room.meta?.floorColor}
                        fallback={style.floorColor}
                        swatches={SWATCHES.floor}
                        onChange={floorColor => s().updateRoom(selection.anchor, { floorColor })}
                    />
                    <div className="info">Fläche: {room.area.toFixed(2).replace('.', ',')} m²</div>
                    <h3>Raumklima</h3>
                    <StateIdField
                        label="Temperatur"
                        value={room.meta?.temperatureId}
                        roleHint="value.temperature"
                        onChange={id => s().updateRoom(selection.anchor, { temperatureId: id || undefined })}
                    />
                    <StateIdField
                        label="Luftfeuchte"
                        value={room.meta?.humidityId}
                        roleHint="value.humidity"
                        onChange={id => s().updateRoom(selection.anchor, { humidityId: id || undefined })}
                    />
                </>
            );
        }
    } else if (selection?.kind === 'object' && floor.objects[selection.id]) {
        content = <ObjectProps id={selection.id} />;
    } else if (selection?.kind === 'background' && floor.background) {
        content = <BackgroundProps />;
    }

    return (
        <div className="panel">
            {content ?? (
                <>
                    <h3>Stockwerk</h3>
                    <label className="field">
                        <span>Name</span>
                        <input value={floor.name} onChange={e => s().updateFloor(floor.id, { name: e.target.value })} />
                    </label>
                    <NumberField label="Raumhöhe" unit="m" value={floor.height} min={1} onChange={v => s().updateFloor(floor.id, { height: Math.max(1, v) })} />
                    <NumberField label="Deckenstärke" unit="m" value={floor.slab} min={0.05} onChange={v => s().updateFloor(floor.id, { slab: Math.max(0.05, v) })} />
                    <div className="info">
                        {Object.keys(floor.walls).length} Wände · {rooms.length} Räume
                    </div>
                    <button className="danger" disabled={floorsCount <= 1} onClick={() => confirm(`Stockwerk „${floor.name}“ löschen?`) && s().removeFloor(floor.id)}>
                        Stockwerk löschen
                    </button>

                    <RoofProps />

                    <h3>Grundriss-Vorlage</h3>
                    {floor.background ? (
                        <BackgroundProps />
                    ) : (
                        <button
                            onClick={async () => {
                                const img = await readImageFile();
                                // assume roughly 2 cm per pixel until calibrated
                                s().updateFloor(floor.id, {
                                    background: { src: img.src, x: 0, y: 0, scale: 0.02, pxWidth: img.width, pxHeight: img.height, opacity: 0.5, visible: true },
                                });
                                s().setTool('calibrate');
                            }}
                        >
                            Bild laden …
                        </button>
                    )}

                    <h3>Neue Wände</h3>
                    <NumberField label="Wandstärke" unit="m" value={settings.wallThickness} min={0.05} onChange={v => s().updateSettings({ wallThickness: Math.max(0.05, v) })} />
                    <NumberField label="Raster" unit="m" value={settings.grid} min={0.01} onChange={v => s().updateSettings({ grid: Math.max(0.01, v) })} />
                    <label className="field check">
                        <input type="checkbox" checked={settings.snap} onChange={e => s().updateSettings({ snap: e.target.checked })} />
                        <span>Fangen (Shift hält es temporär aus)</span>
                    </label>
                </>
            )}
        </div>
    );
}

function ObjectProps({ id }: { id: string }) {
    const floor = useEditor(activeFloor);
    const project = useEditor(s => s.project);
    const gizmo = useEditor(s => s.gizmo);
    const s = useEditor.getState;
    const o = floor.objects[id];
    const asset = findAsset(project, o.assetId);
    const up = (patch: Parameters<ReturnType<typeof s>['updateObject']>[1]) => s().updateObject(id, patch);
    const deg = Math.round((o.rotation * 180) / Math.PI);
    const dims = asset ? asset.size.map((v, i) => v * o.scale[i]) : [0, 0, 0];
    const setDim = (axis: number, value: number) => {
        if (!asset || !(value > 0)) return;
        const scale = [...o.scale] as [number, number, number];
        scale[axis] = value / asset.size[axis];
        up({ scale });
    };
    return (
        <>
            <h3>Objekt</h3>
            <label className="field">
                <span>Name</span>
                <input value={o.name ?? ''} placeholder={asset?.name} onChange={e => up({ name: e.target.value || undefined })} />
            </label>
            <div className="info">
                {asset ? `${asset.name} · ${MOUNT_LABELS[asset.mount]}` : 'Modell fehlt'}
            </div>
            <NumberField label="X" unit="m" value={o.x} onChange={v => up({ x: v })} />
            <NumberField label="Y" unit="m" value={o.y} onChange={v => up({ y: v })} />
            <NumberField label="Höhe über Boden" unit="m" value={o.elevation} min={0} onChange={v => up({ elevation: Math.max(0, v) })} />
            <NumberField label="Drehung" unit="°" step={5} value={deg} onChange={v => up({ rotation: (v * Math.PI) / 180 })} />
            <div className="row">
                <button onClick={() => s().rotateSelection(90)} title="R">↺ 90°</button>
                <button onClick={() => s().rotateSelection(-90)}>↻ 90°</button>
            </div>
            <ObjectColors id={id} />
            <h3>Größe</h3>
            {(['Breite', 'Höhe', 'Tiefe'] as const).map((label, i) => (
                <NumberField key={label} label={label} unit="m" value={dims[i]} min={0.01} onChange={v => setDim(i, v)} />
            ))}
            <button disabled={o.scale.every(v => v === 1)} onClick={() => up({ scale: [1, 1, 1] })}>
                Originalgröße
            </button>
            <h3>Verhalten (ioBroker)</h3>
            <BehaviorList behaviors={o.behaviors ?? []} onChange={behaviors => up({ behaviors })} />
            <h3>3D-Gizmo</h3>
            <div className="row">
                <button className={gizmo === 'translate' ? 'active' : ''} onClick={() => s().setGizmo('translate')}>Verschieben</button>
                <button className={gizmo === 'rotate' ? 'active' : ''} onClick={() => s().setGizmo('rotate')}>Drehen</button>
            </div>
            <div className="row">
                <button onClick={() => s().duplicateObject(id)} title="Strg+D">Duplizieren</button>
                <button className="danger" onClick={() => s().deleteSelection()}>Löschen</button>
            </div>
        </>
    );
}

function BackgroundProps() {
    const floor = useEditor(activeFloor);
    const s = useEditor.getState;
    const bg = floor.background!;
    const up = (patch: Partial<typeof bg>) => s().updateFloor(floor.id, { background: { ...bg, ...patch } });
    return (
        <>
            <label className="field check">
                <input type="checkbox" checked={bg.visible} onChange={e => up({ visible: e.target.checked })} />
                <span>Anzeigen</span>
            </label>
            <label className="field">
                <span>Deckkraft</span>
                <input type="range" min={0.05} max={1} step={0.05} value={bg.opacity} onChange={e => up({ opacity: parseFloat(e.target.value) })} />
            </label>
            <div className="info">Breite im Plan: {(bg.pxWidth * bg.scale).toFixed(2).replace('.', ',')} m</div>
            <div className="row">
                <button onClick={() => s().setTool('calibrate')}>Maßstab kalibrieren</button>
                <button onClick={() => s().setTool('background')}>Verschieben</button>
            </div>
            <button className="danger" onClick={() => s().updateFloor(floor.id, { background: undefined })}>Vorlage entfernen</button>
        </>
    );
}

/** Colours of the two sides of a wall, labelled with the room on that side (or "außen"). */
function WallColors({ wallId }: { wallId: string }) {
    const floor = useEditor(activeFloor);
    const style = projectStyle(useEditor(s => s.project));
    const sides = useMemo(() => {
        const frames = computeWallGeometry(floor).frames;
        return wallSideRooms(frames, detectRooms(floor))[wallId];
    }, [floor, wallId]);
    const w = floor.walls[wallId];
    if (!w || !sides) return null;
    const s = useEditor.getState;
    const label = (room: typeof sides.left) => (room ? `Seite ${room.meta?.name ?? 'Raum'}` : 'Außenseite');
    const side = (key: 'colorLeft' | 'colorRight', room: typeof sides.left) => (
        <ColorField
            label={label(room)}
            value={w[key]}
            fallback={room ? style.wallInterior : style.wallExterior}
            swatches={SWATCHES.wall}
            onChange={c => s().updateWall(wallId, { [key]: c })}
        />
    );
    return (
        <>
            <h3>Farbe</h3>
            {side('colorLeft', sides.left)}
            {side('colorRight', sides.right)}
        </>
    );
}

/** Colours of the model's materials, grouped by material name. */
function ObjectColors({ id }: { id: string }) {
    const floor = useEditor(activeFloor);
    const o = floor.objects[id];
    const [materials, setMaterials] = useState<ModelMaterial[] | null>(null);
    useEffect(() => {
        let alive = true;
        setMaterials(null);
        void loadAsset(o.assetId).then(proto => alive && setMaterials(proto ? listMaterials(proto) : []));
        return () => {
            alive = false;
        };
    }, [o.assetId]);
    if (!materials?.length) return null;

    // materials with the same name (e.g. the four handles of a wardrobe) are coloured together
    const groups = new Map<string, ModelMaterial[]>();
    for (const m of materials) groups.set(m.name, [...(groups.get(m.name) ?? []), m]);
    const set = (list: ModelMaterial[], color: string | undefined) => {
        const materialColors = { ...(o.materialColors ?? {}) };
        for (const m of list) {
            if (color) materialColors[m.index] = color;
            else delete materialColors[m.index];
        }
        useEditor.getState().updateObject(id, { materialColors: Object.keys(materialColors).length ? materialColors : undefined });
    };
    return (
        <>
            <h3>Farben</h3>
            {[...groups].map(([name, list]) => (
                <ColorField
                    key={name}
                    label={name}
                    value={o.materialColors?.[list[0].index]}
                    fallback={list[0].color}
                    onChange={c => set(list, c)}
                />
            ))}
            {o.materialColors && (
                <button className="small" onClick={() => useEditor.getState().updateObject(id, { materialColors: undefined })}>
                    Alle Farben zurücksetzen
                </button>
            )}
        </>
    );
}

const ROOF_COLORS = ['#8e4636', '#a8553a', '#5c3b30', '#3f4247', '#5f6670', '#7d8a99', '#4f6b4a'];

/** Roof of the active storey. */
function RoofProps() {
    const floor = useEditor(activeFloor);
    const s = useEditor.getState;
    const roof = floor.roof;
    const set = (patch: Partial<Roof> | null) => s().updateFloor(floor.id, { roof: patch === null ? undefined : { ...(roof ?? DEFAULT_ROOF), ...patch } });
    const frame = useMemo(() => (roof ? roofFrame(floor) : null), [floor, roof]);
    return (
        <>
            <h3>Dach</h3>
            <label className="field">
                <span>Dachform</span>
                <select value={roof?.type ?? ''} onChange={e => set(e.target.value ? { type: e.target.value as RoofType } : null)}>
                    <option value="">Kein Dach</option>
                    {(Object.keys(ROOF_TYPES) as RoofType[]).map(t => (
                        <option key={t} value={t}>
                            {ROOF_TYPES[t]}
                        </option>
                    ))}
                </select>
            </label>
            {roof && (
                <>
                    {roof.type !== 'flat' && (
                        <NumberField label="Neigung" unit="°" step={5} min={0} value={roof.pitch} onChange={v => set({ pitch: Math.min(75, Math.max(0, v)) })} />
                    )}
                    <NumberField label="Dachüberstand" unit="m" step={0.05} min={0} value={roof.overhang} onChange={v => set({ overhang: Math.max(0, v) })} />
                    {(roof.type === 'gable' || roof.type === 'shed') && (
                        <label className="field">
                            <span>First</span>
                            <select value={roof.ridge} onChange={e => set({ ridge: e.target.value as Roof['ridge'] })}>
                                <option value="auto">entlang der langen Seite</option>
                                <option value="x">waagerecht im Plan</option>
                                <option value="y">senkrecht im Plan</option>
                            </select>
                        </label>
                    )}
                    {roof.type === 'shed' && (
                        <label className="field check">
                            <input type="checkbox" checked={!!roof.flip} onChange={e => set({ flip: e.target.checked })} />
                            <span>Hohe Seite gegenüber</span>
                        </label>
                    )}
                    <ColorField label="Farbe" value={roof.color} fallback={roof.color} swatches={ROOF_COLORS} onChange={c => c && set({ color: c })} />
                    {frame && (
                        <div className="info">
                            Firsthöhe {(roofTop(frame) - floor.height).toFixed(2).replace('.', ',')} m über den Wänden · Traufe auf {floor.height.toFixed(2).replace('.', ',')} m (Raumhöhe = Kniestock)
                        </div>
                    )}
                    <div className="hint-small">
                        Außenwände wachsen bis unters Dach (Giebel), Innenwände werden an der Schräge abgeschnitten. Für einen Dachboden ein eigenes Geschoss mit niedriger Raumhöhe (Kniestock) anlegen.
                    </div>
                </>
            )}
        </>
    );
}
