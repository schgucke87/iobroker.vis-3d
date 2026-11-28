import { useEditor } from '../model/store';
import { FLOOR_DEFAULT_COLOR, FLOOR_MATERIALS, GROUND_DEFAULT_COLOR, GROUND_MATERIALS, projectStyle, SKY_MODES, SWATCHES } from '../model/style';
import type { FloorMaterial, GroundMaterial, SkyMode } from '../model/types';

/** Colour picker with a row of suggested colours and an optional "default" reset. */
export function ColorField(props: {
    label: string;
    value: string | undefined;
    fallback: string;
    swatches?: string[];
    onChange: (c: string | undefined) => void;
}) {
    const current = props.value ?? props.fallback;
    return (
        <div className="color-field">
            <div className="color-head">
                <span>{props.label}</span>
                <span className="color-controls">
                    {props.value !== undefined && (
                        <button className="small link" title="Auf Standard zurücksetzen" onClick={() => props.onChange(undefined)}>
                            Standard
                        </button>
                    )}
                    <input type="color" value={current} onChange={e => props.onChange(e.target.value)} />
                </span>
            </div>
            {props.swatches && (
                <div className="swatches">
                    {props.swatches.map(c => (
                        <button
                            key={c}
                            className={`swatch ${c.toLowerCase() === current.toLowerCase() ? 'active' : ''}`}
                            style={{ background: c }}
                            title={c}
                            onClick={() => props.onChange(c)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Project-wide look: sky, ground, default wall and floor colours. */
export function StylePanel() {
    const project = useEditor(s => s.project);
    const style = projectStyle(project);
    const set = useEditor.getState().updateStyle;
    return (
        <div className="panel">
            <h3>Himmel</h3>
            <div className="chips">
                {(Object.keys(SKY_MODES) as SkyMode[]).map(m => (
                    <button key={m} className={style.sky === m ? 'active' : ''} onClick={() => set({ sky: m })}>
                        {SKY_MODES[m]}
                    </button>
                ))}
            </div>
            {style.sky === 'color' && <ColorField label="Farbe" value={project.style?.skyColor} fallback={style.skyColor} swatches={SWATCHES.sky} onChange={skyColor => set({ skyColor })} />}
            {style.sky === 'night' && <div className="hint-small">Nachts wird die Grundbeleuchtung gedimmt – eingeschaltete Lampen kommen besser zur Geltung.</div>}

            <h3>Grundstück</h3>
            <label className="field">
                <span>Oberfläche</span>
                <select
                    value={style.groundMaterial}
                    onChange={e => {
                        const groundMaterial = e.target.value as GroundMaterial;
                        set({ groundMaterial, groundColor: GROUND_DEFAULT_COLOR[groundMaterial] });
                    }}
                >
                    {(Object.keys(GROUND_MATERIALS) as GroundMaterial[]).map(m => (
                        <option key={m} value={m}>
                            {GROUND_MATERIALS[m]}
                        </option>
                    ))}
                </select>
            </label>
            <ColorField label="Farbe" value={project.style?.groundColor} fallback={style.groundColor} swatches={SWATCHES.ground} onChange={groundColor => set({ groundColor })} />

            <h3>Wände (Standard)</h3>
            <ColorField label="Innen" value={project.style?.wallInterior} fallback={style.wallInterior} swatches={SWATCHES.wall} onChange={wallInterior => set({ wallInterior })} />
            <ColorField label="Außen (Fassade)" value={project.style?.wallExterior} fallback={style.wallExterior} swatches={SWATCHES.wall} onChange={wallExterior => set({ wallExterior })} />
            <div className="hint-small">Einzelne Wände und Wandseiten lassen sich in ihren Eigenschaften abweichend färben.</div>

            <h3>Böden (Standard)</h3>
            <label className="field">
                <span>Belag</span>
                <select
                    value={style.floorMaterial}
                    onChange={e => {
                        const floorMaterial = e.target.value as FloorMaterial;
                        set({ floorMaterial, floorColor: FLOOR_DEFAULT_COLOR[floorMaterial] });
                    }}
                >
                    {(Object.keys(FLOOR_MATERIALS) as FloorMaterial[]).map(m => (
                        <option key={m} value={m}>
                            {FLOOR_MATERIALS[m]}
                        </option>
                    ))}
                </select>
            </label>
            <ColorField label="Farbe" value={project.style?.floorColor} fallback={style.floorColor} swatches={SWATCHES.floor} onChange={floorColor => set({ floorColor })} />
            <div className="hint-small">Jeder Raum kann einen eigenen Bodenbelag bekommen (Raum anklicken).</div>
        </div>
    );
}
