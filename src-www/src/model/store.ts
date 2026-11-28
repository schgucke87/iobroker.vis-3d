import { create } from 'zustand';
import { temporal } from 'zundo';
import type { AssetMeta, Floor, Opening, Project, ProjectStyle, RoofFeature, RoomMeta, SceneObject, Vec2, Wall } from './types';
import * as ops from './ops';
import { detectRooms, wallSideRooms } from '../geometry/rooms';
import { computeWallGeometry } from '../geometry/walls';
import { DEFAULT_ROOF, roofFrame } from '../geometry/roof';
import { newRoofFeature } from '../geometry/roofFeatures';
import { pointInPolygon } from '../geometry/vec';
import { builtinAssets } from '../assets/builtin';

export type Tool = 'select' | 'wall' | 'area' | 'door' | 'window' | 'calibrate' | 'background' | 'place';
export type ViewMode = 'split' | '2d' | '3d';

export type Selection =
    | { kind: 'wall'; id: string }
    | { kind: 'node'; id: string }
    | { kind: 'opening'; wallId: string; id: string }
    | { kind: 'room'; anchor: Vec2 }
    | { kind: 'object'; id: string }
    | { kind: 'roofFeature'; id: string }
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
    /** Colour rooms by temperature in 3D. */
    heatmap: boolean;
    setHeatmap(v: boolean): void;
    settings: Settings;
    /** Asset being placed with the 'place' tool. */
    placeAssetId: string | null;
    placeRotation: number;
    /** Mode of the 3D transform gizmo on the selected object. */
    gizmo: 'translate' | 'rotate';
    setGizmo(g: 'translate' | 'rotate'): void;

    setProject(p: Project): void;
    /** Replaces the project content (undoable), keeping view and active floor. */
    replaceProject(p: Project): void;
    setTool(t: Tool): void;
    setView(v: ViewMode): void;
    select(s: Selection | null): void;
    setFocusFloor(id: string | null): void;
    setExplode(v: boolean): void;
    updateSettings(patch: Partial<Settings>): void;

    setActiveFloor(id: string): void;
    addFloor(): void;
    /**
     * Adds an attic on top: knee walls (1 m) along the outer walls of the top
     * storey and a gable roof; a roof of the storey below moves up.
     */
    addAttic(): void;
    /** Adds a roof window or dormer to the active storey's roof and selects it. */
    addRoofFeature(type: RoofFeature['type']): void;
    updateRoofFeature(id: string, patch: Partial<RoofFeature>): void;
    /** Adds a basement below the lowest storey, with its outer walls. */
    addBasement(): void;
    /** Adds the garden (outdoor areas at ground level) or selects it if there is one. */
    addGarden(): void;
    removeFloor(id: string): void;
    moveFloor(id: string, dir: -1 | 1): void;
    updateFloor(id: string, patch: Partial<Pick<Floor, 'name' | 'height' | 'slab' | 'background' | 'roof'>>): void;

    /** Runs a mutation on a copy of the active floor and commits it. */
    editFloor<T>(fn: (floor: Floor) => T): T;
    addWall(from: ops.AttachTarget, to: ops.AttachTarget, boundary?: boolean): string;
    updateWall(id: string, patch: Partial<Pick<Wall, 'thickness' | 'height' | 'colorLeft' | 'colorRight'>>): void;
    /** Changes the project style; `undefined` values reset a field to its default. */
    updateStyle(patch: { [K in keyof ProjectStyle]?: ProjectStyle[K] | undefined }): void;
    deleteSelection(): void;
    addOpening(wallId: string, type: Opening['type'], offset: number): void;
    updateOpening(wallId: string, id: string, patch: Partial<Opening>): void;
    updateRoom(anchor: Vec2, patch: Partial<Omit<RoomMeta, 'id' | 'anchor'>>): void;

    startPlacing(assetId: string): void;
    addAsset(meta: AssetMeta): void;
    removeAsset(id: string): void;
    addObject(o: Omit<SceneObject, 'id'>): string;
    updateObject(id: string, patch: Partial<Omit<SceneObject, 'id'>>): void;
    duplicateObject(id: string): void;
    rotateSelection(degrees: number): void;

    /** Groups many changes (e.g. a drag) into a single undo step. */
    beginGesture(): void;
    endGesture(): void;
}

export function activeFloor(s: Pick<EditorState, 'project' | 'activeFloorId'>): Floor {
    return s.project.floors.find(f => f.id === s.activeFloorId) ?? s.project.floors[0];
}

export function newFloor(name: string): Floor {
    return { id: ops.uid('f'), name, height: 2.5, slab: 0.2, nodes: {}, walls: {}, rooms: {}, objects: {} };
}

export function emptyProject(): Project {
    return { version: 1, name: 'Mein Haus', floors: [newFloor('Erdgeschoss')], assets: {} };
}

/** Fills in fields that older project files do not have yet. */
export function normalizeProject(p: Project): Project {
    return {
        ...p,
        assets: p.assets ?? {},
        floors: p.floors.map(f => ({ ...f, objects: f.objects ?? {}, rooms: f.rooms ?? {} })),
    };
}

/** All assets usable in a project: built-in ones plus the project's imported ones. */
export function allAssets(p: Project): AssetMeta[] {
    return [...builtinAssets(), ...Object.values(p.assets)];
}

export function findAsset(p: Project, id: string): AssetMeta | undefined {
    return p.assets[id] ?? builtinAssets().find(a => a.id === id);
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
                heatmap: false,
                setHeatmap: heatmap => set({ heatmap }),
                settings: { grid: 0.05, snap: true, wallThickness: 0.24 },
                placeAssetId: null,
                placeRotation: 0,
                gizmo: 'translate',
                setGizmo: gizmo => set({ gizmo }),

                setProject: p => {
                    const project = normalizeProject(p);
                    set({ project, activeFloorId: project.floors[0]?.id ?? '', selection: null, focusFloorId: null });
                },
                replaceProject: p => set({ project: p, selection: null }),
                setTool: tool =>
                    set({
                        tool,
                        selection: tool === 'select' ? get().selection : null,
                        placeAssetId: tool === 'place' ? get().placeAssetId : null,
                    }),
                setView: view => set({ view }),
                select: selection => set({ selection }),
                setFocusFloor: focusFloorId => set({ focusFloorId }),
                setExplode: explode => set({ explode }),
                updateSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),

                setActiveFloor: id => set({ activeFloorId: id, selection: null, focusFloorId: id }),
                addFloor: () => {
                    const s = get();
                    const names = ['Erdgeschoss', 'Obergeschoss', 'Dachgeschoss'];
                    const storeys = s.project.floors.filter(f => (f.kind ?? 'normal') === 'normal').length;
                    const f = newFloor(names[storeys] ?? `Etage ${storeys}`);
                    const below = topStorey(s.project);
                    if (below) {
                        // start with a copy of the floor below's walls so outer walls line up
                        f.height = below.height;
                        f.nodes = structuredClone(below.nodes);
                        f.walls = structuredClone(below.walls);
                        for (const w of Object.values(f.walls)) w.openings = [];
                    }
                    f.objects = {};
                    f.roof = undefined;
                    set({ project: { ...s.project, floors: insertStorey(s.project.floors, f) }, activeFloorId: f.id, focusFloorId: f.id, selection: null });
                },
                addAttic: () => {
                    const s = get();
                    const below = topStorey(s.project);
                    const attic = newFloor('Dachboden');
                    attic.height = 1.0;
                    if (below) copyOuterWalls(below, attic, attic.height);
                    attic.roof = { ...(below?.roof ?? DEFAULT_ROOF) };
                    const floors = s.project.floors.map(f => (f === below && f.roof ? { ...f, roof: undefined } : f));
                    set({
                        project: { ...s.project, floors: insertStorey(floors, attic) },
                        activeFloorId: attic.id,
                        focusFloorId: attic.id,
                        selection: null,
                    });
                },
                addRoofFeature: type => {
                    const floor = activeFloor(get());
                    const frame = roofFrame(floor);
                    if (!frame || !floor.roof) return;
                    const feat = newRoofFeature(frame, floor.roof, type);
                    get().editFloor(f => {
                        if (f.roof) f.roof.features = [...(f.roof.features ?? []), feat];
                    });
                    set({ selection: { kind: 'roofFeature', id: feat.id } });
                },
                updateRoofFeature: (id, patch) =>
                    get().editFloor(f => {
                        const feat = f.roof?.features?.find(x => x.id === id);
                        if (feat) Object.assign(feat, patch);
                    }),
                addBasement: () => {
                    const s = get();
                    const above = s.project.floors.find(f => (f.kind ?? 'normal') !== 'outdoor');
                    const cellar = newFloor('Keller');
                    cellar.kind = 'basement';
                    cellar.height = 2.3;
                    if (above) copyOuterWalls(above, cellar, cellar.height);
                    set({
                        project: { ...s.project, floors: [cellar, ...s.project.floors] },
                        activeFloorId: cellar.id,
                        focusFloorId: cellar.id,
                        selection: null,
                    });
                },
                addGarden: () => {
                    const s = get();
                    const existing = s.project.floors.find(f => f.kind === 'outdoor');
                    if (existing) {
                        set({ activeFloorId: existing.id, focusFloorId: existing.id, selection: null });
                        return;
                    }
                    const garden = newFloor('Garten');
                    garden.kind = 'outdoor';
                    // areas are slabs from the ground up to the ground floor level
                    garden.slab = 0.25;
                    set({
                        project: { ...s.project, floors: [...s.project.floors, garden] },
                        activeFloorId: garden.id,
                        focusFloorId: garden.id,
                        selection: null,
                        tool: 'area',
                    });
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
                addWall: (from, to, boundary) => {
                    const s = get();
                    const floor = activeFloor(s);
                    return s.editFloor(f =>
                        ops.addWall(
                            f,
                            from,
                            to,
                            boundary ? { thickness: 0.05, height: 0, boundary: true } : { thickness: s.settings.wallThickness, height: floor.height },
                        ),
                    );
                },
                updateStyle: patch =>
                    set(s => {
                        const style: Record<string, unknown> = { ...s.project.style };
                        for (const [k, v] of Object.entries(patch)) {
                            if (v === undefined) delete style[k];
                            else style[k] = v;
                        }
                        return { project: { ...s.project, style: style as Partial<ProjectStyle> } };
                    }),
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
                            } else if (sel.kind === 'object') {
                                delete f.objects[sel.id];
                            } else if (sel.kind === 'roofFeature') {
                                if (f.roof?.features) f.roof.features = f.roof.features.filter(x => x.id !== sel.id);
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

                startPlacing: assetId =>
                    set(s => ({ tool: 'place', placeAssetId: assetId, selection: null, focusFloorId: activeFloor(s).id })),
                addAsset: meta => set(s => ({ project: { ...s.project, assets: { ...s.project.assets, [meta.id]: meta } } })),
                removeAsset: id =>
                    set(s => {
                        const assets = { ...s.project.assets };
                        delete assets[id];
                        const floors = s.project.floors.map(f => {
                            const objects = Object.fromEntries(Object.entries(f.objects).filter(([, o]) => o.assetId !== id));
                            return Object.keys(objects).length === Object.keys(f.objects).length ? f : { ...f, objects };
                        });
                        return {
                            project: { ...s.project, assets, floors },
                            placeAssetId: s.placeAssetId === id ? null : s.placeAssetId,
                            selection: null,
                        };
                    }),
                addObject: o => {
                    const id = ops.uid('o');
                    get().editFloor(f => void (f.objects[id] = { ...o, id }));
                    return id;
                },
                updateObject: (id, patch) =>
                    get().editFloor(f => {
                        if (f.objects[id]) Object.assign(f.objects[id], patch);
                    }),
                duplicateObject: id => {
                    const o = activeFloor(get()).objects[id];
                    if (!o) return;
                    const copy = { ...o, scale: [...o.scale] as SceneObject['scale'], x: o.x + 0.3, y: o.y + 0.3 };
                    const { id: _old, ...rest } = copy;
                    void _old;
                    const newId = get().addObject(rest);
                    set({ selection: { kind: 'object', id: newId } });
                },
                rotateSelection: degrees => {
                    if (get().tool === 'place') {
                        set(s => ({ placeRotation: normalizeAngle(s.placeRotation + (degrees * Math.PI) / 180) }));
                        return;
                    }
                    const sel = get().selection;
                    if (sel?.kind !== 'object') return;
                    const o = activeFloor(get()).objects[sel.id];
                    if (o) get().updateObject(sel.id, { rotation: normalizeAngle(o.rotation + (degrees * Math.PI) / 180) });
                },

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

export function normalizeAngle(a: number): number {
    const t = Math.PI * 2;
    return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

/**
 * Elevation (top of the floor slab) of each floor, in the order of
 * project.floors. The storeys are stacked; the ground floor (the first storey
 * that is no basement) is at 0, basements below it; outdoor floors (garden)
 * lie at ground floor level and do not take part in the stack.
 */
export function floorElevations(project: Project): number[] {
    const result: number[] = new Array(project.floors.length).fill(0);
    let z = 0;
    let prev: Floor | null = null;
    let ground = 0;
    let groundFound = false;
    project.floors.forEach((f, i) => {
        if (f.kind === 'outdoor') return;
        if (prev) z += prev.height + f.slab;
        result[i] = z;
        if (!groundFound && f.kind !== 'basement') {
            ground = z;
            groundFound = true;
        }
        prev = f;
    });
    return result.map((e, i) => (project.floors[i].kind === 'outdoor' ? 0 : e - ground));
}

/** The highest storey of the building (no garden). */
export function topStorey(p: Project): Floor | undefined {
    return [...p.floors].reverse().find(f => f.kind !== 'outdoor');
}

/** Inserts a storey above the others, below the garden entries. */
function insertStorey(floors: Floor[], f: Floor): Floor[] {
    const i = floors.findIndex(x => x.kind === 'outdoor');
    return i < 0 ? [...floors, f] : [...floors.slice(0, i), f, ...floors.slice(i)];
}

/** Copies the outer walls (outside on one side) of a storey into another, with the given height. */
function copyOuterWalls(from: Floor, to: Floor, height: number) {
    const frames = computeWallGeometry(from).frames;
    const sides = wallSideRooms(frames, detectRooms(from));
    for (const w of Object.values(from.walls)) {
        const side = sides[w.id];
        if (!side || (side.left && side.right)) continue;
        for (const id of [w.a, w.b]) to.nodes[id] = { ...from.nodes[id] };
        to.walls[w.id] = { ...w, height, openings: [], colorLeft: undefined, colorRight: undefined };
    }
}
