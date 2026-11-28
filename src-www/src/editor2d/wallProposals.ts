import { create } from 'zustand';
import type { BackgroundImage, Floor, Opening, Vec2 } from '../model/types';
import * as ops from '../model/ops';
import { activeFloor, useEditor } from '../model/store';
import { detectWalls, roundThickness, type GrayImage } from './wallDetect';

/** A wall found in the template, in plan metres, waiting to be accepted. */
export interface WallProposal {
    id: string;
    a: Vec2;
    b: Vec2;
    thickness: number;
    openings: { type: 'door' | 'window'; from: number; to: number }[];
    enabled: boolean;
}

interface ProposalState {
    floorId: string | null;
    proposals: WallProposal[];
    busy: boolean;
    error: string | null;
}

export const useWallProposals = create<ProposalState>(() => ({ floorId: null, proposals: [], busy: false, error: null }));

export const toggleProposal = (id: string) =>
    useWallProposals.setState(s => ({ proposals: s.proposals.map(p => (p.id === id ? { ...p, enabled: !p.enabled } : p)) }));

export const discardProposals = () => useWallProposals.setState({ floorId: null, proposals: [], error: null });

/** Largest image (in pixels) the detection works on; bigger scans are scaled down. */
const MAX_PIXELS = 6_000_000;

async function loadGray(src: string, maxPixels = MAX_PIXELS): Promise<GrayImage> {
    const el = new Image();
    el.src = src;
    await el.decode();
    const factor = Math.min(1, Math.sqrt(maxPixels / (el.naturalWidth * el.naturalHeight)));
    const width = Math.max(1, Math.round(el.naturalWidth * factor));
    const height = Math.max(1, Math.round(el.naturalHeight * factor));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    // transparent areas count as paper
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(el, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    return { width, height, data };
}

/** Runs the detection on the active floor's template and shows the result as proposals. */
export async function detectFromTemplate(): Promise<void> {
    const floor = activeFloor(useEditor.getState());
    const bg = floor.background;
    if (!bg) return;
    useWallProposals.setState({ busy: true, error: null, proposals: [], floorId: floor.id });
    // let the "detecting …" state render before the work starts
    await new Promise(r => setTimeout(r, 30));
    try {
        const img = await loadGray(bg.src);
        // metres per pixel of the analysed image (it may be scaled down from the stored size)
        const mpp = (bg.scale * bg.pxWidth) / img.width;
        const walls = detectWalls(img, { mpp });
        useWallProposals.setState({ proposals: walls.map((w, i) => toProposal(w, bg, mpp, i)), busy: false });
        if (!walls.length) useWallProposals.setState({ error: 'Keine Wände erkannt.' });
    } catch (e) {
        useWallProposals.setState({ busy: false, error: String((e as Error)?.message ?? e) });
    }
}

function toProposal(w: ReturnType<typeof detectWalls>[number], bg: BackgroundImage, mpp: number, i: number): WallProposal {
    // the image is drawn at bg.x/bg.y with bg.scale metres per stored pixel
    const P = (p: [number, number]): Vec2 => [bg.x + p[0] * mpp, bg.y + p[1] * mpp];
    return {
        id: `p${i}`,
        a: P(w.a),
        b: P(w.b),
        thickness: roundThickness(w.thickness * mpp),
        openings: w.openings.map(o => ({ type: o.type, from: o.from * mpp, to: o.to * mpp })),
        enabled: true,
    };
}

/** Adds the enabled proposals to the floor as walls with doors and windows (one undo step). */
export function applyProposals() {
    const { proposals, floorId } = useWallProposals.getState();
    const st = useEditor.getState();
    if (!floorId || activeFloor(st).id !== floorId) return discardProposals();
    const chosen = proposals.filter(p => p.enabled);
    st.editFloor(f => addProposedWalls(f, chosen));
    discardProposals();
}

const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function addProposedWalls(f: Floor, proposals: Omit<WallProposal, 'id' | 'enabled'>[]) {
    // long walls first: shorter ones then attach to them (T-junctions)
    const sorted = [...proposals].sort((p, q) => len(q.a, q.b) - len(p.a, p.b));
    for (const p of sorted) {
        const before = new Set(Object.keys(f.walls));
        ops.addWall(f, { kind: 'point', point: p.a }, { kind: 'point', point: p.b }, { thickness: p.thickness, height: f.height });
        // the new wall may have been split where it crosses others; give every piece the openings it contains
        const dir: Vec2 = [(p.b[0] - p.a[0]) / len(p.a, p.b), (p.b[1] - p.a[1]) / len(p.a, p.b)];
        const pieces = Object.values(f.walls).filter(w => !before.has(w.id));
        for (const o of p.openings) {
            const mid = (o.from + o.to) / 2;
            const c: Vec2 = [p.a[0] + dir[0] * mid, p.a[1] + dir[1] * mid];
            for (const w of pieces) {
                const A = f.nodes[w.a];
                const B = f.nodes[w.b];
                const L = len([A.x, A.y], [B.x, B.y]);
                const u = ((c[0] - A.x) * (B.x - A.x) + (c[1] - A.y) * (B.y - A.y)) / L;
                if (u <= 0 || u >= L) continue;
                const def = ops.OPENING_PRESETS[o.type];
                const opening: Opening = { ...def, id: ops.uid('o'), width: Math.min(o.to - o.from, L - 0.1), offset: u };
                w.openings.push(opening);
                break;
            }
        }
    }
}
