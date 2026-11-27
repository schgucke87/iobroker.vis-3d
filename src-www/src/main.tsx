import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './model/store';
import { loadLocal, loadProject, saveProject, useFileStore } from './storage/local';
import { demoProject } from './model/demo';
import { initBackend, projectStateIds, syncSubscriptions } from './iobroker/connect';
import { useSaveStatus } from './storage/saveStatus';
import './styles.css';

const params = new URLSearchParams(location.search);
const edit = params.has('edit');

// ?debug exposes the stores for troubleshooting in the browser console (and for UI tests)
if (params.has('debug')) {
    void Promise.all([import('three'), import('./iobroker/connect')]).then(([THREE, conn]) => {
        Object.assign(window, { __vis3d: { ...(window as { __vis3d?: object }).__vis3d, THREE, useEditor, useConnection: conn.useConnection } });
    });
}

async function start() {
    const root = createRoot(document.getElementById('root')!);
    root.render(<div className="boot">Verbinde …</div>);

    const backend = await initBackend();
    useFileStore(backend.files);

    let project = null;
    try {
        project = await loadProject();
    } catch (e) {
        console.error('Projekt konnte nicht geladen werden', e);
    }
    // first start: the demo house, wired to the simulated datapoints when there is no ioBroker
    useEditor.getState().setProject(project ?? demoProject({ bindings: backend.kind === 'demo' }));
    useEditor.temporal.getState().clear();

    // live datapoints follow the project
    syncSubscriptions(projectStateIds(useEditor.getState().project));
    useEditor.subscribe((s, prev) => {
        if (s.project !== prev.project) syncSubscriptions(projectStateIds(s.project));
    });

    if (edit) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        useEditor.subscribe((s, prev) => {
            if (s.project === prev.project) return;
            clearTimeout(timer);
            useSaveStatus.setState({ status: 'saving' });
            timer = setTimeout(async () => {
                try {
                    await saveProject(useEditor.getState().project);
                    useSaveStatus.setState({ status: 'saved', error: undefined });
                } catch (e) {
                    useSaveStatus.setState({ status: 'error', error: String((e as Error)?.message ?? e) });
                }
            }, backend.files ? 1000 : 400);
        });
    } else if (!backend.files) {
        // standalone: keep viewer tabs in sync with the editor tab
        window.addEventListener('storage', e => {
            if (e.key === 'vis3d.project') {
                const p = loadLocal();
                if (p) useEditor.setState({ project: p });
            }
        });
    }

    root.render(
        <StrictMode>
            <App edit={edit} />
        </StrictMode>,
    );
}

void start();
