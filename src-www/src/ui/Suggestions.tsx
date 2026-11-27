import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../model/store';
import { getBackend, useConnection } from '../iobroker/connect';
import type { DetectionResult } from '../iobroker/devices';
import { applySuggestions, buildSuggestions, NEW_LAMP, projectRooms, type Suggestion } from '../model/suggestions';

const ICON: Record<Suggestion['kind'], string> = { climate: '🌡', contact: '🪟', blind: '▤', light: '💡' };

const UNSUPPORTED_LABELS: Record<string, string> = {
    motion: 'Bewegungsmelder',
    socket: 'Steckdosen',
    media: 'Medienplayer',
    tv: 'Fernseher',
    lock: 'Schlösser',
    gate: 'Tore',
    button: 'Taster',
    vacuumCleaner: 'Saugroboter',
    rgbSingle: 'RGB-Lichter',
    rgb: 'RGB-Lichter',
    ct: 'Farbtemperatur-Lichter',
    hue: 'Farb-Lichter',
    airCondition: 'Klimageräte',
};

export function SuggestionsDialog({ onClose }: { onClose: () => void }) {
    const project = useEditor(s => s.project);
    const backendLabel = useConnection(s => s.backend?.label ?? '');
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** ioBroker room enum → 3D room key, chosen by the user. */
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
    const [targets, setTargets] = useState<Record<string, string>>({});

    useEffect(() => {
        getBackend()
            ?.detectDevices()
            .then(setDetection)
            .catch(e => setError(String(e?.message ?? e)));
    }, []);

    const rooms = useMemo(() => projectRooms(project), [project]);
    const result = useMemo(() => (detection ? buildSuggestions(project, detection, overrides) : null), [project, detection, overrides]);
    const enabled = (s: Suggestion) => !s.disabledReason && !unchecked.has(s.key);
    const selected = result?.suggestions.filter(enabled) ?? [];

    const groups = useMemo(() => {
        const map = new Map<string, Suggestion[]>();
        for (const s of result?.suggestions ?? []) map.set(s.room.key, [...(map.get(s.room.key) ?? []), s]);
        return [...map.values()];
    }, [result]);

    const unsupportedSummary = useMemo(() => {
        const counts = new Map<string, number>();
        for (const d of result?.unsupported ?? []) {
            const label = UNSUPPORTED_LABELS[d.type] ?? d.type;
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        return [...counts].map(([l, n]) => `${n}× ${l}`).join(', ');
    }, [result]);

    const apply = () => {
        if (!result || !detection) return;
        const assignments = Object.fromEntries(Object.entries(overrides).filter(([, key]) => key));
        const enumNames = Object.fromEntries(detection.rooms.map(r => [r.id, r.name]));
        const next = applySuggestions(
            project,
            selected.map(s => ({ suggestion: s, target: targets[s.key] })),
            assignments,
            enumNames,
        );
        useEditor.getState().replaceProject(next);
        onClose();
    };

    const toggle = (key: string) =>
        setUnchecked(prev => {
            const n = new Set(prev);
            if (n.has(key)) n.delete(key);
            else n.add(key);
            return n;
        });

    return (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="modal suggestions">
                <header>
                    <h2>Vorschläge aus ioBroker</h2>
                    <span className="muted">{backendLabel}</span>
                    <button onClick={onClose}>×</button>
                </header>
                <div className="suggestions-body">
                    {error && <div className="error">{error}</div>}
                    {!result && !error && <div className="loading">Erkenne Geräte in den ioBroker-Räumen …</div>}

                    {result && result.unmatched.length > 0 && (
                        <section className="unmatched">
                            <h3>ioBroker-Räume ohne passenden 3D-Raum</h3>
                            <p className="muted">Ordne sie einem gezeichneten Raum zu, dann erscheinen ihre Geräte unten.</p>
                            {result.unmatched.map(u => (
                                <label key={u.id} className="field">
                                    <span>
                                        {u.name} <em className="muted">({u.devices} Geräte)</em>
                                    </span>
                                    <select value={overrides[u.id] ?? ''} onChange={e => setOverrides(o => ({ ...o, [u.id]: e.target.value }))}>
                                        <option value="">– nicht zuordnen –</option>
                                        {rooms.map(r => (
                                            <option key={r.key} value={r.key}>
                                                {r.name} ({r.floorName}, {r.room.area.toFixed(0)} m²)
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </section>
                    )}

                    {result && groups.length === 0 && (
                        <div className="empty">
                            {result.alreadyBound > 0
                                ? 'Alle erkannten Geräte sind bereits verknüpft. 👍'
                                : 'Keine passenden Geräte gefunden. Tipp: Geräte in ioBroker Räumen (enum.rooms) zuordnen.'}
                        </div>
                    )}

                    {groups.map(list => {
                        const ref = list[0].room;
                        return (
                            <section key={ref.key} className="room-group">
                                <h3>
                                    {ref.name} <span className="muted">· {ref.floorName}</span>
                                </h3>
                                {list.map(s => (
                                    <div key={s.key} className={`suggestion ${s.disabledReason ? 'disabled' : ''}`}>
                                        <input type="checkbox" checked={enabled(s)} disabled={!!s.disabledReason} onChange={() => toggle(s.key)} />
                                        <span className="icon">{s.kind === 'contact' && s.device.type === 'door' ? '🚪' : ICON[s.kind]}</span>
                                        <div className="what">
                                            <div className="name">{s.title}</div>
                                            <div className="id">{mainId(s)}</div>
                                        </div>
                                        <div className="how">
                                            {s.disabledReason ? (
                                                <span className="muted">{s.disabledReason}</span>
                                            ) : s.targets.length > 1 ? (
                                                <select value={targets[s.key] ?? s.defaultTarget} onChange={e => setTargets(t => ({ ...t, [s.key]: e.target.value }))}>
                                                    {s.targets.map(t => (
                                                        <option key={t.id} value={t.id}>
                                                            {targetLabel(s, t.id, t.label)}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span>{s.description}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </section>
                        );
                    })}
                </div>
                <footer>
                    <span className="muted">
                        {result && result.alreadyBound > 0 && `${result.alreadyBound} bereits verknüpft. `}
                        {unsupportedSummary && `Noch nicht unterstützt: ${unsupportedSummary}.`}
                    </span>
                    <button onClick={onClose}>Abbrechen</button>
                    <button className="primary" disabled={!selected.length} onClick={apply}>
                        {selected.length} übernehmen
                    </button>
                </footer>
            </div>
        </div>
    );
}

/** The datapoint the suggestion actually uses (the measured value for climate, the switch/level otherwise). */
function mainId(s: Suggestion) {
    const st = s.device.states;
    return (s.kind === 'climate' ? st.ACTUAL : (st.SET ?? st.ACTUAL)) ?? Object.values(st)[0];
}

function targetLabel(s: Suggestion, id: string, label: string) {
    if (s.kind === 'light') return id === NEW_LAMP ? 'Neue Deckenleuchte platzieren' : `Mit ${label.replace('vorhandene ', '')} verbinden`;
    if (s.kind === 'blind') return `Rollladen an ${label}`;
    return `Kontakt an ${label}`;
}
