import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Floor, Opening, Project, RoomMeta, Vec2, Wall } from './types';
import * as ops from './ops';
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'calibrate' | 'background';
export type ViewMode = 'split' | '2d' | '3d';

export type Selection =
    | { kind: 'wall'; id: string }
    | { kind: 'node'; id: string }
    | { kind: 'opening'; wallId: string; id: string }
    | { kind: 'room'; anchor: Vec2 }
    | { kind: 'background' };

export interface Settings {
    grid: number;
    snap: boolean;
    wallThickness: number;
}

export interface EditorState {
    project: Project;
    activeFloorId: string;
    tool: Tool;
    selection: Selection | null;
    view: ViewMode;
    /** 3D navigation: null shows the whole building. */
    focusFloorId: string | null;
    explode: boolean;
    settings: Settings;

    setProject(p: Project): void;
    setTool(t: Tool): void;
    setView(v: ViewMode): void;
    select(s: Selection | null): void;
    setFocusFloor(id: string | null): void;
    setExplode(v: boolean): void;
    updateSettings(patch: Partial<Settings>): void;

    setActiveFloor(id: string): void;
    addFloor(): void;
    removeFloor(id: string): void;
    moveFloor(id: string, dir: -1 | 1): void;
    updateFloor(id: string, patch: Partial<Pick<Floor, 'name' | 'height' | 'slab' | 'background'>>): void;

    /** Runs a mutation on a copy of the active floor and commits it. */
    editFloor<T>(fn: (floor: Floor) => T): T;
    addWall(from: ops.AttachTarget, to: ops.AttachTarget): string;
    updateWall(id: string, patch: Partial<Pick<Wall, 'thickness' | 'height'>>): void;
    deleteSelection(): void;
    addOpening(wallId: string, type: Opening['type'], offset: number): void;
    updateOpening(wallId: string, id: string, patch: Partial<Opening>): void;
    updateRoom(anchor: Vec2, patch: Partial<Omit<RoomMeta, 'id' | 'anchor'>>): void;

    /** Groups many changes (e.g. a drag) into a single undo step. */
    beginGesture(): void;
    endGesture(): void;
}

export function activeFloor(s: Pick<EditorState, 'project' | 'activeFloorId'>): Floor {
    return s.project.floors.find(f => f.id === s.activeFloorId) ?? s.project.floors[0];
}

export function newFloor(name: string): Floor {
    return { id: ops.uid('f'), name, height: 2.5, slab: 0.2, nodes: {}, walls: {}, rooms: {} };
}

export function emptyProject(): Project {
    return { version: 1, name: 'Mein Haus', floors: [newFloor('Erdgeschoss')] };
}

let gestureSnapshot: Project | null = null;

export const useEditor = create<EditorState>()(
    temporal(
        (set, get) => {
            const replaceFloor = (floor: Floor) =>
                set(s => ({ project: { ...s.project, floors: s.project.floors.map(f => (f.id === floor.id ? floor : f)) } }));

            return {
                project: emptyProject(),
                activeFloorId: '',
                tool: 'select',
                selection: null,
                view: 'split',
                focusFloorId: null,
                explode: false,
                settings: { grid: 0.05, snap: true, wallThickness: 0.24 },

                setProject: p =>
                    set({ project: p, activeFloorId: p.floors[0]?.id ?? '', selection: null, focusFloorId: null }),
                setTool: tool => set({ tool, selection: tool === 'select' ? get().selection : null }),
                setView: view => set({ view }),
                select: selection => set({ selection }),
                setFocusFloor: focusFloorId => set({ focusFloorId }),
                setExplode: explode => set({ explode }),
                updateSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),

                setActiveFloor: id => set({ activeFloorId: id, selection: null, focusFloorId: id }),
                addFloor: () => {
                    const s = get();
                    const names = ['Erdgeschoss', 'Obergeschoss', 'Dachgeschoss'];
                    const f = newFloor(names[s.project.floors.length] ?? `Etage ${s.project.floors.length}`);
                    const below = s.project.floors[s.project.floors.length - 1];
                    if (below) {
                        // start with a copy of the floor below's walls so outer walls line up
                        f.height = below.height;
                        f.nodes = structuredClone(below.nodes);
                        f.walls = structuredClone(below.walls);
                        for (const w of Object.values(f.walls)) w.openings = [];
                    }
                    set({ project: { ...s.project, floors: [...s.project.floors, f] }, activeFloorId: f.id, focusFloorId: f.id, selection: null });
                },
                removeFloor: id => {
                    const s = get();
                    if (s.project.floors.length <= 1) return;
                    const floors = s.project.floors.filter(f => f.id !== id);
                    set({
                        project: { ...s.project, floors },
                        activeFloorId: s.activeFloorId === id ? floors[0].id : s.activeFloorId,
                        focusFloorId: s.focusFloorId === id ? null : s.focusFloorId,
                        selection: null,
                    });
                },
                moveFloor: (id, dir) => {
                    const floors = get().project.floors.slice();
                    const i = floors.findIndex(f => f.id === id);
                    const j = i + dir;
                    if (i < 0 || j < 0 || j >= floors.length) return;
                    [floors[i], floors[j]] = [floors[j], floors[i]];
                    set(s => ({ project: { ...s.project, floors } }));
                },
                updateFloor: (id, patch) =>
                    set(s => ({
                        project: { ...s.project, floors: s.project.floors.map(f => (f.id === id ? { ...f, ...patch } : f)) },
                    })),

                editFloor: fn => {
                    const floor = structuredClone(activeFloor(get()));
                    const result = fn(floor);
                    replaceFloor(floor);
                    return result;
                },
                addWall: (from, to) => {
                    const s = get();
                    const floor = activeFloor(s);
                    return s.editFloor(f =>
                        ops.addWall(f, from, to, { thickness: s.settings.wallThickness, height: floor.height }),
                    );
                },
                updateWall: (id, patch) =>
                    get().editFloor(f => {
                        if (f.walls[id]) Object.assign(f.walls[id], patch);
                    }),
                deleteSelection: () => {
                    const sel = get().selection;
                    if (!sel) return;
                    if (sel.kind === 'background') {
                        get().updateFloor(get().activeFloorId, { background: undefined });
                    } else {
                        get().editFloor(f => {
                            if (sel.kind === 'wall') ops.deleteWall(f, sel.id);
                            else if (sel.kind === 'node') ops.deleteNode(f, sel.id);
                            else if (sel.kind === 'opening') {
                                const w = f.walls[sel.wallId];
                                if (w) w.openings = w.openings.filter(o => o.id !== sel.id);
                            } else if (sel.kind === 'room') {
                                for (const m of Object.values(f.rooms)) {
                                    if (pointInRoomOf(f, m.anchor, sel.anchor)) delete f.rooms[m.id];
                                }
                            }
                        });
                    }
                    set({ selection: null });
                },
                addOpening: (wallId, type, offset) => {
                    const id = get().editFloor(f => ops.addOpening(f, wallId, { ...ops.OPENING_PRESETS[type], offset }));
                    if (id) set({ selection: { kind: 'opening', wallId, id } });
                },
                updateOpening: (wallId, id, patch) =>
                    get().editFloor(f => {
                        const o = f.walls[wallId]?.openings.find(x => x.id === id);
                        if (o) Object.assign(o, patch);
                    }),
                updateRoom: (anchor, patch) =>
                    get().editFloor(f => {
                        const room = detectRooms(f).find(r => pointInPolygon(anchor, r.polygon));
                        if (!room) return;
                        if (room.meta) {
                            Object.assign(f.rooms[room.meta.id], patch);
                        } else {
                            const id = ops.uid('r');
                            f.rooms[id] = { id, name: 'Raum', anchor: room.centroid, ...patch };
                        }
                    }),

                beginGesture: () => {
                    gestureSnapshot = get().project;
                    useEditor.temporal.getState().pause();
                },
                endGesture: () => {
                    const t = useEditor.temporal.getState();
                    t.resume();
                    const before = gestureSnapshot;
                    gestureSnapshot = null;
                    if (before && before !== get().project) {
                        useEditor.temporal.setState({
                            pastStates: [...t.pastStates, { project: before }].slice(-200),
                            futureStates: [],
                        });
                    }
                },
            };
        },
        {
            partialize: s => ({ project: s.project }),
            equality: (a, b) => a.project === b.project,
            limit: 200,
        },
    ),
);

function pointInRoomOf(f: Floor, anchor: Vec2, probe: Vec2): boolean {
    const room = detectRooms(f).find(r => pointInPolygon(probe, r.polygon));
    return !!room && pointInPolygon(anchor, room.polygon);
}

export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

/** Elevation (top of the floor slab) of each storey, bottom to top. */
export function floorElevations(project: Project): number[] {
    const result: number[] = [];
    let z = 0;
    project.floors.forEach((f, i) => {
        if (i > 0) z += project.floors[i - 1].height + f.slab;
        result.push(z);
    });
    return result;
}
