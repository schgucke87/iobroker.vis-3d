import { useMemo } from 'react';
import { activeFloor, floorElevations, useEditor } from '../model/store';
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';
import { computeWallGeometry } from '../geometry/walls';
import { readImageFile } from '../storage/local';
import type { Opening } from '../model/types';

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
                    <label className="field">
                        <span>Bodenfarbe</span>
                        <input type="color" value={room.meta?.floorColor ?? '#d8c6a5'} onChange={e => s().updateRoom(selection.anchor, { floorColor: e.target.value })} />
                    </label>
                    <div className="info">Fläche: {room.area.toFixed(2).replace('.', ',')} m²</div>
                </>
            );
        }
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
