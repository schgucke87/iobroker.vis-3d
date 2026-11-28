import { useEditor } from '../model/store';
import { FLOOR_DEFAULT_COLOR, FLOOR_MATERIALS, GROUND_DEFAULT_COLOR, GROUND_MATERIALS, projectStyle, SKY_MODES, SWATCHES } from '../model/style';
import type { FloorMaterial, GroundMaterial, SkyMode } from '../model/types';
import { useLiveSun } from '../view3d/Environment';
import { useEffect, useState } from 'react';
import { findWeatherChannels, WEATHER_MODES, weatherSummary, type WeatherMode } from '../model/weather';
import { useWeather } from '../view3d/Weather3D';
import { useConnection } from '../iobroker/connect';
import { useSnowCover } from '../view3d/useSnowCover';
import { StateIdField } from './Datapoints';

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
            {style.sky === 'auto' && <LiveSunInfo />}
            <label className="field">
                <span>Nordrichtung im Plan</span>
                <span className="input-unit">
                    <input
                        type="number"
                        step={5}
                        value={style.northAngle}
                        onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) set({ northAngle: ((v % 360) + 360) % 360 });
                        }}
                    />
                    <em>°</em>
                </span>
            </label>
            <div className="hint-small">0° = Norden zeigt im Grundriss nach oben, 90° = nach rechts. Bestimmt, von wo die Sonne scheint.</div>

            <WeatherSettings />

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

function LiveSunInfo() {
    const live = useLiveSun(true);
    const alt = (live.sun.altitude * 180) / Math.PI;
    const az = (live.sun.azimuth * 180) / Math.PI;
    const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(az / 45) % 8];
    return (
        <div className="hint-small">
            {live.now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr · Sonne{' '}
            {alt > 0 ? `${alt.toFixed(0)}° hoch im ${dir}` : `${(-alt).toFixed(0)}° unter dem Horizont`}
            <br />
            Standort {live.location.latitude.toFixed(2)}° N, {live.location.longitude.toFixed(2)}° O{' '}
            {live.fromIoBroker ? '(aus den ioBroker-Systemeinstellungen)' : '(Standard – in den ioBroker-Systemeinstellungen keiner hinterlegt)'}
        </div>
    );
}

/** Weather mode, the daswetter channel for live weather, and what it currently shows. */
function WeatherSettings() {
    const project = useEditor(s => s.project);
    const style = projectStyle(project);
    const set = useEditor.getState().updateStyle;
    const backend = useConnection(s => s.backend);
    const [channels, setChannels] = useState<string[] | null>(null);
    const weather = useWeather(style);

    useEffect(() => {
        if (style.weather !== 'live' || !backend) return;
        let alive = true;
        void backend
            .listDatapoints()
            .then(list => {
                if (!alive) return;
                const found = findWeatherChannels(list.map(d => d.id));
                setChannels(found);
                const current = useEditor.getState().project.style?.weatherChannel;
                if (!current && found.length) set({ weatherChannel: found[0] });
            })
            .catch(() => alive && setChannels([]));
        return () => {
            alive = false;
        };
    }, [style.weather, backend, set]);

    const options = [...new Set([...(channels ?? []), ...(style.weatherChannel ? [style.weatherChannel] : [])])];
    return (
        <>
            <h3>Wetter</h3>
            <div className="chips">
                {(Object.keys(WEATHER_MODES) as WeatherMode[]).map(m => (
                    <button key={m} className={style.weather === m ? 'active' : ''} onClick={() => set({ weather: m })}>
                        {WEATHER_MODES[m]}
                    </button>
                ))}
            </div>
            {style.weather === 'live' && (
                <>
                    {options.length > 0 ? (
                        <label className="field">
                            <span>Datenquelle</span>
                            <select value={style.weatherChannel ?? ''} onChange={e => set({ weatherChannel: e.target.value || undefined })}>
                                {options.map(c => (
                                    <option key={c} value={c}>
                                        {c.replace(/\.ForecastHourly\./, ' · ').replace('Current', 'aktuelle Stunde').replace('Hour_1', 'nächste Stunde')}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <div className="hint-small">
                            {channels === null
                                ? 'Suche daswetter-Datenpunkte …'
                                : 'Keine daswetter-Daten gefunden. Bitte den Adapter „daswetter“ installieren und einen Ort einrichten (stündliche Vorhersage aktivieren).'}
                        </div>
                    )}
                    <div className="hint-small">
                        {weather ? weatherSummary(weather) : style.weatherChannel ? 'Noch keine Werte empfangen.' : ''}
                        {options.length > 0 && !style.weatherChannel?.endsWith('Current') && (
                            <>
                                <br />
                                Tipp: In daswetter „Aktuelle Stunde kopieren“ aktivieren, dann wird genau die laufende Stunde verwendet.
                            </>
                        )}
                    </div>
                    <SnowSettings />
                </>
            )}
            {style.weather !== 'off' && style.weather !== 'live' && <div className="hint-small">Vorschau – das Wetter bleibt fest eingestellt.</div>}
        </>
    );
}

/** Where vis-3d learns whether snow lies outside. */
function SnowSettings() {
    const project = useEditor(s => s.project);
    const style = projectStyle(project);
    const set = useEditor.getState().updateStyle;
    const cover = useSnowCover(style);
    const depth = cover.depthCm !== undefined ? `${cover.depthCm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} cm` : '';
    const status =
        cover.source === 'datapoint'
            ? `Schnee laut Datenpunkt: ${cover.depthCm ? depth : 'keiner'}`
            : cover.source === 'openmeteo'
              ? `Schneehöhe laut Open-Meteo: ${depth}${cover.time ? ` (Stand ${cover.time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr)` : ''}`
              : cover.source === 'falling'
                ? 'Es schneit – leichte Schneedecke.'
                : 'Kein Schnee liegt.';
    return (
        <>
            <h4 className="sub-head">Schneedecke</h4>
            <label className="field check">
                <input type="checkbox" checked={!!style.snowOpenMeteo} onChange={e => set({ snowOpenMeteo: e.target.checked || undefined })} />
                <span>Schneehöhe von Open-Meteo abrufen</span>
            </label>
            <div className="hint-small">
                Fragt alle 30 Minuten die berechnete Schneehöhe für den Standort aus den ioBroker-Systemeinstellungen ab
                (api.open-meteo.com, kostenlos, ohne Anmeldung). Dabei werden die Koordinaten an Open-Meteo übertragen.
            </div>
            <StateIdField label="Datenpunkt (hat Vorrang)" value={style.snowStateId} onChange={id => set({ snowStateId: id || undefined })} />
            <div className="hint-small">Wahr/falsch für „Schnee liegt“ oder eine Zahl für die Schneehöhe in cm, z. B. von einer Wetterstation.</div>
            <div className="hint-small">
                {status}
                {cover.error && (
                    <>
                        <br />
                        Open-Meteo: {cover.error}
                    </>
                )}
            </div>
        </>
    );
}
