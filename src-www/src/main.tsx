import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './model/store';
import { loadLocal, saveLocal } from './storage/local';
import { demoProject } from './model/demo';
import './styles.css';

const edit = new URLSearchParams(location.search).has('edit');

// Start with the saved project, or the demo house on first launch.
useEditor.getState().setProject(loadLocal() ?? demoProject());
useEditor.temporal.getState().clear();

let timer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveLocal(useEditor.getState().project), 400);
});

// keep viewer tabs in sync with the editor
window.addEventListener('storage', e => {
    if (e.key === 'vis3d.project' && !edit) {
        const p = loadLocal();
        if (p) useEditor.setState({ project: p });
    }
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App edit={edit} />
    </StrictMode>,
);
