import { useEffect, useMemo, useState } from 'react';
import { getBackend, setStateValue, syncSubscriptions, useConnection, useStateValue } from '../iobroker/connect';
import { formatValue, type DatapointInfo } from '../iobroker/backend';
import { useEditor } from '../model/store';
import { projectStateIds } from '../iobroker/connect';

const MAX_ROWS = 300;

/** Input for a datapoint id with a browse button and the live value. */
export function StateIdField(props: { label: string; value: string | undefined; onChange: (id: string) => void; roleHint?: string }) {
    const [open, setOpen] = useState(false);
    const val = useStateValue(props.value || undefined);
    const known = useConnection(s => (props.value ? props.value in s.values : false));
    usePreviewSubscription(props.value);
    return (
        <div className="state-field">
            <span className="state-label">{props.label}</span>
            <div className="state-input">
                <input value={props.value ?? ''} placeholder="Datenpunkt-ID" onChange={e => props.onChange(e.target.value.trim())} />
                <button title="Datenpunkt auswählen" onClick={() => setOpen(true)}>
                    …
                </button>
            </div>
            {props.value && (
                <span className={`state-value ${known && val !== undefined ? '' : 'missing'}`}>
                    {known && val !== undefined ? `Wert: ${formatValue(val, 2)}` : 'kein Wert (Datenpunkt unbekannt?)'}
                </span>
            )}
            {open && (
                <DatapointPicker
                    initial={props.value}
                    roleHint={props.roleHint}
                    onSelect={id => {
                        props.onChange(id);
                        setOpen(false);
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

/**
 * Datapoints typed into a field are not part of the saved project until the
 * edit is committed; subscribe to them meanwhile so the live value shows.
 */
function usePreviewSubscription(id: string | undefined) {
    useEffect(() => {
        if (!id) return;
        const ids = projectStateIds(useEditor.getState().project);
        ids.add(id);
        syncSubscriptions(ids);
    }, [id]);
}

export function DatapointPicker(props: { initial?: string; roleHint?: string; onSelect: (id: string) => void; onClose: () => void }) {
    const [all, setAll] = useState<DatapointInfo[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [room, setRoom] = useState('');
    const [roleFilter, setRoleFilter] = useState(props.roleHint ?? '');
    const backendLabel = useConnection(s => s.backend?.label ?? '');

    useEffect(() => {
        getBackend()
            ?.listDatapoints()
            .then(list => setAll(list.sort((a, b) => a.id.localeCompare(b.id))))
            .catch(e => setError(String(e?.message ?? e)));
    }, []);

    const rooms = useMemo(() => [...new Set((all ?? []).flatMap(d => d.rooms))].sort(), [all]);
    const filtered = useMemo(() => {
        if (!all) return [];
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return all.filter(
            d =>
                (!room || d.rooms.includes(room)) &&
                (!roleFilter || (d.role ?? '').startsWith(roleFilter)) &&
                words.every(w => d.id.toLowerCase().includes(w) || d.name.toLowerCase().includes(w) || (d.role ?? '').includes(w)),
        );
    }, [all, query, room, roleFilter]);
    const shown = filtered.slice(0, MAX_ROWS);

    // live values for the visible rows
    useEffect(() => {
        const ids = projectStateIds(useEditor.getState().project);
        shown.slice(0, 60).forEach(d => ids.add(d.id));
        syncSubscriptions(ids);
        return () => syncSubscriptions(projectStateIds(useEditor.getState().project));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown.map(d => d.id).slice(0, 60).join()]);

    return (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && props.onClose()}>
            <div className="modal picker">
                <header>
                    <h2>Datenpunkt auswählen</h2>
                    <span className="muted">{backendLabel}</span>
                    <button onClick={props.onClose}>×</button>
                </header>
                <div className="picker-filters">
                    <input autoFocus placeholder="Suchen (Name, ID, Rolle) …" value={query} onChange={e => setQuery(e.target.value)} />
                    <select value={room} onChange={e => setRoom(e.target.value)}>
                        <option value="">Alle Räume</option>
                        {rooms.map(r => (
                            <option key={r}>{r}</option>
                        ))}
                    </select>
                    <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                        <option value="">Alle Rollen</option>
                        <option value="switch">Schalter (switch.*)</option>
                        <option value="level">Stellwerte (level.*)</option>
                        <option value="value.temperature">Temperatur</option>
                        <option value="value.humidity">Luftfeuchte</option>
                        <option value="sensor">Sensoren (sensor.*)</option>
                        <option value="value">Messwerte (value.*)</option>
                        <option value="indicator">Indikatoren</option>
                    </select>
                </div>
                <div className="picker-list">
                    {error && <div className="error">{error}</div>}
                    {!all && !error && <div className="loading">Lade Datenpunkte …</div>}
                    {all && (
                        <table>
                            <tbody>
                                {shown.map(d => (
                                    <PickerRow key={d.id} d={d} selected={d.id === props.initial} onSelect={() => props.onSelect(d.id)} />
                                ))}
                            </tbody>
                        </table>
                    )}
                    {all && filtered.length > MAX_ROWS && (
                        <div className="muted more">
                            {filtered.length - MAX_ROWS} weitere – Suche verfeinern
                        </div>
                    )}
                    {all && !filtered.length && <div className="muted more">Keine Treffer</div>}
                </div>
            </div>
        </div>
    );
}

function PickerRow({ d, selected, onSelect }: { d: DatapointInfo; selected: boolean; onSelect: () => void }) {
    const val = useStateValue(d.id);
    return (
        <tr className={selected ? 'selected' : ''} onClick={onSelect}>
            <td>
                <div className="dp-name">{d.name}</div>
                <div className="dp-id">{d.id}</div>
            </td>
            <td className="dp-meta">
                {d.role && <span className="tag">{d.role}</span>}
                {d.rooms.map(r => (
                    <span key={r} className="tag room">
                        {r}
                    </span>
                ))}
            </td>
            <td className="dp-val">{val !== undefined ? formatValue(val, 2, d.unit) : ''}</td>
        </tr>
    );
}

/** Small button to try a datapoint from the editor (e.g. toggle a light). */
export function TestToggle({ id }: { id: string }) {
    const val = useStateValue(id);
    if (!id) return null;
    return (
        <button
            className="small"
            title="Wert umschalten (Test)"
            onClick={() => setStateValue(id, typeof val === 'number' ? (val > 0 ? 0 : 100) : !(val === true || val === 'true'))}
        >
            Testen
        </button>
    );
}
