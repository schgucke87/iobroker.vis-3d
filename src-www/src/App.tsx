import { useEffect, useState } from 'react';
import { redo, undo, useEditor, type Tool, type ViewMode, emptyProject } from './model/store';
import { PlanEditor } from './editor2d/PlanEditor';
import { Scene3D } from './view3d/Scene3D';
import { FloorPanel, PropertiesPanel } from './ui/Panels';
import { LibraryPanel } from './ui/Library';
import { exportProject, importProjectFile } from './storage/local';
import { demoProject } from './model/demo';
import { useConnection } from './iobroker/connect';
import { useSaveStatus } from './storage/saveStatus';
import { storageLabel } from './storage/local';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
    { id: 'select', label: 'Auswählen', key: 'V', icon: '↖' },
    { id: 'wall', label: 'Wand', key: 'W', icon: '▭' },
    { id: 'door', label: 'Tür', key: 'D', icon: '🚪' },
    { id: 'window', label: 'Fenster', key: 'F', icon: '🪟' },
];

const VIEWS: { id: ViewMode; label: string }[] = [
    { id: '2d', label: '2D' },
    { id: 'split', label: '2D | 3D' },
    { id: '3d', label: '3D' },
];

export function App({ edit }: { edit: boolean }) {
    return edit ? <EditorApp /> : <ViewerApp />;
}

function EditorApp() {
    const tool = useEditor(s => s.tool);
    const view = useEditor(s => s.view);
    const explode = useEditor(s => s.explode);
    const s = useEditor.getState;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (mod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
                s().deleteSelection();
            } else if (mod && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                const sel = s().selection;
                if (sel?.kind === 'object') s().duplicateObject(sel.id);
            } else if (!mod && e.key.toLowerCase() === 'r') {
                s().rotateSelection(e.shiftKey ? -90 : 90);
            } else if (e.key === 'Escape' && s().tool === 'place') {
                s().setTool('select');
            } else if (!mod && !e.altKey) {
                const t = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
                if (t) s().setTool(t.id);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [s]);

    return (
        <div className="app">
            <header className="toolbar">
                <div className="brand">vis-3d</div>
                <div className="group">
                    {TOOLS.map(t => (
                        <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => s().setTool(t.id)} title={`${t.label} (${t.key})`}>
                            <span className="icon">{t.icon}</span> {t.label}
                        </button>
                    ))}
                </div>
                <div className="group">
                    <button onClick={undo} title="Rückgängig (Strg+Z)">↶</button>
                    <button onClick={redo} title="Wiederholen (Strg+Y)">↷</button>
                </div>
                <div className="group">
                    {VIEWS.map(v => (
                        <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => s().setView(v.id)}>
                            {v.label}
                        </button>
                    ))}
                    <button className={explode ? 'active' : ''} onClick={() => s().setExplode(!explode)} title="Stockwerke auseinanderziehen (in der Gebäudeansicht)">
                        Explosion
                    </button>
                </div>
                <div className="spacer" />
                <StatusBadge />
                <div className="group">
                    <button onClick={() => confirm('Aktuelles Projekt durch das Beispielhaus ersetzen?') && s().setProject(demoProject({ bindings: useConnection.getState().backend?.kind === 'demo' }))}>Beispiel</button>
                    <button onClick={() => confirm('Neues, leeres Projekt beginnen?') && s().setProject(emptyProject())}>Neu</button>
                    <button onClick={() => importProjectFile().then(p => s().setProject(p)).catch(e => e && alert(String(e.message ?? e)))}>Öffnen</button>
                    <button onClick={() => void exportProject(s().project)}>Exportieren</button>
                    <a className="button" href={viewerHref()} target="_blank" rel="noreferrer">Ansicht ↗</a>
                </div>
            </header>
            <aside className="left">
                <LeftTabs />
            </aside>
            <main className={`main view-${view}`}>
                {view !== '3d' && (
                    <section className="pane">
                        <PlanEditor />
                    </section>
                )}
                {view !== '2d' && (
                    <section className="pane">
                        <Scene3D editable />
                        <FloorNav editable />
                    </section>
                )}
            </main>
            <aside className="right">
                <PropertiesPanel />
            </aside>
        </div>
    );
}

/** Viewer URL keeping connection parameters such as ?host= or ?demo. */
function viewerHref() {
    const p = new URLSearchParams(location.search);
    p.delete('edit');
    const q = p.toString();
    return q ? `?${q}` : '?';
}

function StatusBadge() {
    const backend = useConnection(s => s.backend);
    const reason = useConnection(s => s.fallbackReason);
    const save = useSaveStatus();
    const live = backend?.kind === 'iobroker';
    const saveText = save.status === 'saving' ? 'speichert …' : save.status === 'error' ? 'Speichern fehlgeschlagen' : 'gespeichert';
    return (
        <div
            className={`status-badge ${live ? 'live' : 'demo'} ${save.status === 'error' ? 'error' : ''}`}
            title={[backend?.label, reason && `Grund: ${reason}`, `Speicherort: ${storageLabel()}`, save.error].filter(Boolean).join('\n')}
        >
            <span className="dot" />
            {live ? 'ioBroker' : 'Demo-Daten'} · {saveText}
        </div>
    );
}

function LeftTabs() {
    const [tab, setTab] = useState<'floors' | 'library'>('floors');
    const tool = useEditor(s => s.tool);
    useEffect(() => {
        if (tool === 'place') setTab('library');
    }, [tool]);
    return (
        <>
            <div className="tabs">
                <button className={tab === 'floors' ? 'active' : ''} onClick={() => setTab('floors')}>
                    Stockwerke
                </button>
                <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
                    Bibliothek
                </button>
            </div>
            {tab === 'floors' ? <FloorPanel /> : <LibraryPanel />}
        </>
    );
}

/** Floor switcher overlay in the 3D view. */
function FloorNav({ editable = false }: { editable?: boolean }) {
    const floors = useEditor(s => s.project.floors);
    const focus = useEditor(s => s.focusFloorId);
    const explode = useEditor(s => s.explode);
    const heatmap = useEditor(s => s.heatmap);
    const s = useEditor.getState;
    return (
        <nav className="floor-nav">
            <button className={focus === null ? 'active' : ''} onClick={() => s().setFocusFloor(null)}>
                Gebäude
            </button>
            {floors
                .slice()
                .reverse()
                .map(f => (
                    <button
                        key={f.id}
                        className={focus === f.id ? 'active' : ''}
                        onClick={() => (editable ? s().setActiveFloor(f.id) : s().setFocusFloor(f.id))}
                    >
                        {f.name}
                    </button>
                ))}
            {focus === null && (
                <button className={explode ? 'active' : ''} onClick={() => s().setExplode(!explode)}>
                    ⇕ Explosion
                </button>
            )}
            <button className={heatmap ? 'active' : ''} onClick={() => s().setHeatmap(!heatmap)} title="Räume nach Temperatur einfärben">
                🌡 Heatmap
            </button>
        </nav>
    );
}

function ViewerApp() {
    return (
        <div className="viewer">
            <Scene3D editable={false} />
            <FloorNav />
            <a className="edit-link" href={`?edit=1${location.search.replace(/^\?/, '&')}`}>✎ Bearbeiten</a>
        </div>
    );
}
