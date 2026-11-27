import type { Behavior, BehaviorType } from '../model/types';
import { BEHAVIOR_HINTS, BEHAVIOR_LABELS, COLOR_ID_LABELS, COLOR_MODE_LABELS, newBehavior } from '../model/behaviors';
import type { LightColorMode } from '../model/types';
import { StateIdField, TestToggle } from './Datapoints';

type Patch = Partial<Behavior>;

const ROLE_HINT: Partial<Record<BehaviorType, string>> = {
    light: 'switch',
    action: 'switch',
    label: 'value',
};

/** Editor for the list of behaviours of one object. */
export function BehaviorList({ behaviors, onChange }: { behaviors: Behavior[]; onChange: (b: Behavior[]) => void }) {
    const update = (id: string, patch: Patch) => onChange(behaviors.map(b => (b.id === id ? ({ ...b, ...patch } as Behavior) : b)));
    const remove = (id: string) => onChange(behaviors.filter(b => b.id !== id));

    return (
        <div className="behaviors">
            {behaviors.map(b => (
                <div key={b.id} className="behavior-card">
                    <div className="behavior-head">
                        <strong>{BEHAVIOR_LABELS[b.type]}</strong>
                        <button className="small danger" onClick={() => remove(b.id)} title="Entfernen">
                            ×
                        </button>
                    </div>
                    <StateIdField label="Datenpunkt" value={b.stateId} roleHint={ROLE_HINT[b.type]} onChange={stateId => update(b.id, { stateId })} />
                    <BehaviorFields b={b} update={patch => update(b.id, patch)} />
                </div>
            ))}
            <select
                className="add-behavior"
                value=""
                onChange={e => {
                    const type = e.target.value as BehaviorType;
                    if (!type) return;
                    // the first behaviour's datapoint is a good default for the next one (e.g. light + action)
                    onChange([...behaviors, newBehavior(type, behaviors[0]?.stateId ?? '')]);
                }}
            >
                <option value="">+ Verhalten hinzufügen …</option>
                {(Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).map(t => (
                    <option key={t} value={t} title={BEHAVIOR_HINTS[t]}>
                        {BEHAVIOR_LABELS[t]}
                    </option>
                ))}
            </select>
        </div>
    );
}

function Num(props: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
    return (
        <label className="field compact">
            <span>{props.label}</span>
            <input
                type="number"
                step={props.step ?? 1}
                value={props.value}
                onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) props.onChange(v);
                }}
            />
        </label>
    );
}

function Color(props: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="field compact">
            <span>{props.label}</span>
            <input type="color" value={props.value} onChange={e => props.onChange(e.target.value)} />
        </label>
    );
}

function BehaviorFields({ b, update }: { b: Behavior; update: (p: Patch) => void }) {
    switch (b.type) {
        case 'light':
            return (
                <>
                    <Color label="Lichtfarbe" value={b.color} onChange={color => update({ color })} />
                    <Num label="Helligkeit" value={b.intensity} step={0.5} onChange={intensity => update({ intensity })} />
                    <Num label="Reichweite (m)" value={b.range} step={0.5} onChange={range => update({ range })} />
                    <Num label="Dimmer: Wert für 100 %" value={b.max} onChange={max => update({ max })} />
                    <StateIdField label="Ein/Aus (optional)" value={b.onId} roleHint="switch" onChange={onId => update({ onId: onId || undefined })} />
                    <label className="field compact">
                        <span>Farbe aus Datenpunkt</span>
                        <select
                            value={b.colorMode ?? ''}
                            onChange={e => {
                                const colorMode = (e.target.value || undefined) as LightColorMode | undefined;
                                update({ colorMode, colorIds: colorMode ? (b.colorIds ?? []).slice(0, COLOR_ID_LABELS[colorMode].length) : undefined, colorMax: undefined });
                            }}
                        >
                            <option value="">– feste Farbe –</option>
                            {(Object.keys(COLOR_MODE_LABELS) as LightColorMode[]).map(m => (
                                <option key={m} value={m}>
                                    {COLOR_MODE_LABELS[m]}
                                </option>
                            ))}
                        </select>
                    </label>
                    {b.colorMode &&
                        COLOR_ID_LABELS[b.colorMode].map((label, i) => (
                            <StateIdField
                                key={`${b.colorMode}-${i}`}
                                label={label}
                                value={b.colorIds?.[i]}
                                roleHint="level.color"
                                onChange={id => {
                                    const colorIds = [...(b.colorIds ?? [])];
                                    colorIds[i] = id;
                                    update({ colorIds });
                                }}
                            />
                        ))}
                    <TestToggle id={b.onId ?? b.stateId} />
                </>
            );
        case 'color':
            return (
                <>
                    <Num label="Wert min" value={b.min} step={0.5} onChange={min => update({ min })} />
                    <Color label="Farbe bei min" value={b.colorMin} onChange={colorMin => update({ colorMin })} />
                    <Num label="Wert max" value={b.max} step={0.5} onChange={max => update({ max })} />
                    <Color label="Farbe bei max" value={b.colorMax} onChange={colorMax => update({ colorMax })} />
                </>
            );
        case 'visibility':
            return (
                <label className="field check">
                    <input type="checkbox" checked={b.invert} onChange={e => update({ invert: e.target.checked })} />
                    <span>Umkehren (sichtbar, wenn falsch)</span>
                </label>
            );
        case 'transform':
            return (
                <>
                    <label className="field compact">
                        <span>Art</span>
                        <select value={b.mode} onChange={e => update({ mode: e.target.value as 'rotate' | 'move' })}>
                            <option value="move">Verschieben (m)</option>
                            <option value="rotate">Drehen (°)</option>
                        </select>
                    </label>
                    <label className="field compact">
                        <span>Achse</span>
                        <select value={b.axis} onChange={e => update({ axis: e.target.value as 'x' | 'y' | 'z' })}>
                            <option value="x">X (Breite)</option>
                            <option value="y">Y (Höhe)</option>
                            <option value="z">Z (Tiefe)</option>
                        </select>
                    </label>
                    <Num label="Wert von" value={b.min} onChange={min => update({ min })} />
                    <Num label="Wert bis" value={b.max} onChange={max => update({ max })} />
                    <Num label={b.mode === 'rotate' ? 'Winkel von' : 'Weg von'} value={b.from} step={b.mode === 'rotate' ? 5 : 0.05} onChange={from => update({ from })} />
                    <Num label={b.mode === 'rotate' ? 'Winkel bis' : 'Weg bis'} value={b.to} step={b.mode === 'rotate' ? 5 : 0.05} onChange={to => update({ to })} />
                </>
            );
        case 'label':
            return (
                <>
                    <label className="field compact">
                        <span>Präfix</span>
                        <input value={b.prefix} onChange={e => update({ prefix: e.target.value })} />
                    </label>
                    <label className="field compact">
                        <span>Einheit</span>
                        <input value={b.unit} onChange={e => update({ unit: e.target.value })} />
                    </label>
                    <Num label="Nachkommastellen" value={b.decimals} onChange={decimals => update({ decimals: Math.max(0, Math.round(decimals)) })} />
                </>
            );
        case 'action':
            return (
                <>
                    <label className="field compact">
                        <span>Aktion</span>
                        <select value={b.mode} onChange={e => update({ mode: e.target.value as 'toggle' | 'set' | 'increment' })}>
                            <option value="toggle">Umschalten</option>
                            <option value="set">Wert setzen</option>
                            <option value="increment">Wert erhöhen um</option>
                        </select>
                    </label>
                    {b.mode !== 'toggle' && (
                        <label className="field compact">
                            <span>Wert</span>
                            <input value={b.value} placeholder={b.mode === 'set' ? 'true, 42, …' : '1'} onChange={e => update({ value: e.target.value })} />
                        </label>
                    )}
                    <div className="hint-small">Wird in der Ansicht beim Antippen ausgeführt; im Editor wählt ein Klick das Objekt aus.</div>
                </>
            );
    }
}
