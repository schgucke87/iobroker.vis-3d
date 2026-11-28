import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedRoom, Floor, Vec2 } from '../model/types';
import { activeFloor, findAsset, useEditor } from '../model/store';
import { computePlacement, objectAxes, objectFootprint } from '../geometry/placement';
import { roofCreases, roofFrame, roofOutline } from '../geometry/roof';
import { featureFootprint } from '../geometry/roofFeatures';
import * as ops from '../model/ops';
import { computeWallGeometry, clampOpening, openingRange, pointOnWall, type WallFrame } from '../geometry/walls';
import { detectRooms } from '../geometry/rooms';
import { add, dist, dot, pointInPolygon, projectOnSegment, scale, sub } from '../geometry/vec';
import { snapPoint, type SnapResult } from './snapping';

interface View {
    /** Plan coordinate at the top-left corner of the viewport. */
    x: number;
    y: number;
    /** Pixels per metre. */
    s: number;
}

type Drag =
    | { kind: 'pan'; start: Vec2; view: View; moved: boolean }
    | { kind: 'node'; id: string }
    | { kind: 'wall'; id: string; start: Vec2; origin: Record<string, Vec2> }
    | { kind: 'opening'; wallId: string; id: string }
    | { kind: 'background'; start: Vec2; origin: Vec2 }
    | { kind: 'object'; id: string; start: Vec2; origin: Vec2 }
    | { kind: 'roofFeature'; id: string; start: Vec2; origin: Vec2 };

const MOUNT_ORDER = { floor: 0, wall: 1, ceiling: 2 } as const;
const fmt = (m: number) => `${m.toFixed(2).replace('.', ',')} m`;
const ptsAttr = (poly: Vec2[]) => poly.map(p => `${p[0]},${p[1]}`).join(' ');

export function PlanEditor() {
    const floor = useEditor(activeFloor);
    const tool = useEditor(s => s.tool);
    const selection = useEditor(s => s.selection);
    const settings = useEditor(s => s.settings);
    const floors = useEditor(s => s.project.floors);
    const project = useEditor(s => s.project);
    const placeAssetId = useEditor(s => s.placeAssetId);
    const placeRotation = useEditor(s => s.placeRotation);
    const [placePoint, setPlacePoint] = useState<Vec2 | null>(null);
    const api = useEditor.getState;

    const svgRef = useRef<SVGSVGElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [view, setView] = useState<View>({ x: -2, y: -2, s: 50 });
    const [cursor, setCursor] = useState<SnapResult | null>(null);
    const [drawFrom, setDrawFrom] = useState<{ target: ops.AttachTarget; point: Vec2 } | null>(null);
    const [typed, setTyped] = useState('');
    const [calib, setCalib] = useState<Vec2[]>([]);
    const [calibLen, setCalibLen] = useState('');
    const drag = useRef<Drag | null>(null);
    const fitted = useRef<string | null>(null);

    const geometry = useMemo(() => computeWallGeometry(floor), [floor]);
    const roof = useMemo(() => roofFrame(floor), [floor]);
    const roofFeatures = useMemo(
        () => (roof ? (floor.roof?.features ?? []).map(f => ({ f, poly: featureFootprint(roof, f) })) : []),
        [roof, floor.roof?.features],
    );
    const rooms = useMemo(() => detectRooms(floor), [floor]);
    const mpp = 1 / view.s;

    // floor below, drawn faintly as a reference
    /** Reference shown faintly: the floor below; for the garden and a basement the ground floor. */
    const below = useMemo(() => {
        const i = floors.findIndex(f => f.id === floor.id);
        const storeys = floors.filter(f => f.kind !== 'outdoor');
        const ground = storeys.find(f => f.kind !== 'basement');
        let ref: Floor | undefined;
        if (floor.kind === 'outdoor' || floor.kind === 'basement') ref = ground && ground.id !== floor.id ? ground : undefined;
        else ref = [...floors.slice(0, i)].reverse().find(f => f.kind !== 'outdoor');
        return ref ? computeWallGeometry(ref) : null;
    }, [floors, floor.id, floor.kind]);
    /** The wall tool draws walls, the area tool invisible area boundaries (garden). */
    const drawing = tool === 'wall' || tool === 'area';
    const boundaries = useMemo(() => Object.values(floor.walls).filter(w => w.boundary), [floor.walls]);

    // viewport size
    useEffect(() => {
        const el = svgRef.current!;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    const fitView = useCallback(
        (f: Floor) => {
            const nodes = Object.values(f.nodes);
            const xs = nodes.map(n => n.x);
            const ys = nodes.map(n => n.y);
            if (f.background) {
                xs.push(f.background.x, f.background.x + f.background.pxWidth * f.background.scale);
                ys.push(f.background.y, f.background.y + f.background.pxHeight * f.background.scale);
            }
            if (!xs.length) {
                setView({ x: -2, y: -2, s: 50 });
                return;
            }
            const minX = Math.min(...xs) - 1.5;
            const maxX = Math.max(...xs) + 1.5;
            const minY = Math.min(...ys) - 1.5;
            const maxY = Math.max(...ys) + 1.5;
            const s = Math.min(size.w / (maxX - minX), size.h / (maxY - minY));
            setView({ x: (minX + maxX) / 2 - size.w / s / 2, y: (minY + maxY) / 2 - size.h / s / 2, s });
        },
        [size],
    );

    // fit once per floor (and once the viewport has a real size)
    useEffect(() => {
        if (size.w < 50) return;
        if (fitted.current !== floor.id) {
            fitted.current = floor.id;
            fitView(floor);
        }
    }, [floor, size, fitView]);

    // cancel drawing when switching tools or floors
    useEffect(() => {
        setDrawFrom(null);
        setTyped('');
        setCalib([]);
    }, [tool, floor.id]);

    const toPlan = (e: { clientX: number; clientY: number }): Vec2 => {
        const r = svgRef.current!.getBoundingClientRect();
        return [view.x + (e.clientX - r.left) / view.s, view.y + (e.clientY - r.top) / view.s];
    };

    const snap = (p: Vec2, e: { shiftKey: boolean }, extra: Partial<Parameters<typeof snapPoint>[2]> = {}) =>
        snapPoint(floor, p, { mpp, grid: settings.grid, enabled: settings.snap && !e.shiftKey, ...extra });

    // ---------- hit testing ----------
    const hitNode = (p: Vec2): string | null => {
        let best: string | null = null;
        let bd = 9 * mpp;
        for (const n of Object.values(floor.nodes)) {
            const d = dist(p, [n.x, n.y]);
            if (d < bd) {
                bd = d;
                best = n.id;
            }
        }
        return best;
    };
    const hitOpening = (p: Vec2): { wallId: string; id: string } | null => {
        for (const fr of Object.values(geometry.frames)) {
            for (const raw of fr.wall.openings) {
                const o = clampOpening(raw, fr);
                const rel = sub(p, fr.start);
                const u = dot(rel, fr.dir);
                const v = dot(rel, fr.normal);
                if (Math.abs(u - o.offset) <= o.width / 2 && Math.abs(v) <= fr.wall.thickness / 2 + 4 * mpp) {
                    return { wallId: fr.wall.id, id: o.id };
                }
            }
        }
        return null;
    };
    const hitBoundary = (p: Vec2): string | null => {
        let best: string | null = null;
        let bd = 6 * mpp;
        for (const w of boundaries) {
            const a = floor.nodes[w.a];
            const b = floor.nodes[w.b];
            const d = projectOnSegment(p, [a.x, a.y], [b.x, b.y]).distance;
            if (d < bd) {
                bd = d;
                best = w.id;
            }
        }
        return best;
    };
    const hitWall = (p: Vec2, tolPx = 3): WallFrame | null => {
        let best: WallFrame | null = null;
        let bd = Infinity;
        for (const fr of Object.values(geometry.frames)) {
            const rel = sub(p, fr.start);
            const u = dot(rel, fr.dir);
            const v = Math.abs(dot(rel, fr.normal));
            if (u >= -0.01 && u <= fr.length + 0.01 && v <= fr.wall.thickness / 2 + tolPx * mpp && v < bd) {
                bd = v;
                best = fr;
            }
        }
        return best;
    };
    const objectsDrawn = useMemo(
        () =>
            Object.values(floor.objects)
                .map(o => ({ o, asset: findAsset(project, o.assetId) }))
                .filter((x): x is { o: typeof x.o; asset: NonNullable<typeof x.asset> } => !!x.asset)
                // draw floor objects first, then wall- and ceiling-mounted ones above them
                .sort((a, b) => MOUNT_ORDER[a.asset.mount] - MOUNT_ORDER[b.asset.mount]),
        [floor.objects, project],
    );
    const hitObject = (p: Vec2): string | null => {
        // topmost first (wall- and ceiling-mounted objects are drawn above floor objects)
        for (let i = objectsDrawn.length - 1; i >= 0; i--) {
            const { o, asset } = objectsDrawn[i];
            if (pointInPolygon(p, objectFootprint(o, asset))) return o.id;
        }
        return null;
    };
    const placeAsset = tool === 'place' && placeAssetId ? findAsset(project, placeAssetId) : undefined;
    const placement = (p: Vec2, e: { shiftKey: boolean }) =>
        placeAsset
            ? computePlacement({
                  floor,
                  asset: placeAsset,
                  point: p,
                  rotation: placeRotation,
                  scale: [1, 1, 1],
                  grid: settings.grid,
                  snap: settings.snap && !e.shiftKey,
              })
            : null;

    const hitRoom = (p: Vec2): DetectedRoom | null => {
        const inside = rooms.filter(r => pointInPolygon(p, r.polygon));
        return inside.sort((a, b) => a.area - b.area)[0] ?? null;
    };

    /** Preview of a door/window placed under the cursor. */
    const openingPreview = (p: Vec2) => {
        const fr = hitWall(p, 14);
        if (!fr) return null;
        const preset = ops.OPENING_PRESETS[tool === 'door' ? 'door' : 'window'];
        const [lo, hi] = openingRange(fr);
        const u0 = dot(sub(p, fr.start), fr.dir);
        const u = Math.min(Math.max(Math.round(u0 / settings.grid) * settings.grid, lo + preset.width / 2), hi - preset.width / 2);
        return { frame: fr, u, width: Math.min(preset.width, hi - lo) };
    };
    const [hoverPreview, setHoverPreview] = useState<ReturnType<typeof openingPreview>>(null);

    // ---------- pointer handling ----------
    const onPointerDown = (e: React.PointerEvent) => {
        const p = toPlan(e);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        svgRef.current!.setPointerCapture(e.pointerId);

        if (e.button === 1 || e.button === 2) {
            drag.current = { kind: 'pan', start: [e.clientX, e.clientY], view, moved: false };
            return;
        }
        if (e.button !== 0) return;

        if (drawing) {
            const s = snap(p, e, { from: drawFrom?.point });
            if (!drawFrom) {
                setDrawFrom({ target: s.target, point: s.point });
            } else {
                const endId = api().addWall(drawFrom.target, s.target, tool === 'area');
                setDrawFrom({ target: { kind: 'node', nodeId: endId }, point: s.point });
            }
            setTyped('');
            return;
        }
        if (tool === 'door' || tool === 'window') {
            const prev = openingPreview(p);
            if (prev) api().addOpening(prev.frame.wall.id, tool, prev.u);
            return;
        }
        if (tool === 'place') {
            const pl = placement(p, e);
            if (pl && placeAsset) {
                const { againstWall: _w, ...pos } = pl;
                void _w;
                api().addObject({ assetId: placeAsset.id, name: placeAsset.name, scale: [1, 1, 1], ...pos });
            }
            return;
        }
        if (tool === 'calibrate') {
            setCalib(c => (c.length >= 2 ? [p] : [...c, p]));
            return;
        }
        if (tool === 'background') {
            if (floor.background) {
                api().beginGesture();
                drag.current = { kind: 'background', start: p, origin: [floor.background.x, floor.background.y] };
                api().select({ kind: 'background' });
            }
            return;
        }

        // select tool
        const node = hitNode(p);
        if (node) {
            api().select({ kind: 'node', id: node });
            api().beginGesture();
            drag.current = { kind: 'node', id: node };
            return;
        }
        const obj = hitObject(p);
        if (obj) {
            api().select({ kind: 'object', id: obj });
            api().beginGesture();
            drag.current = { kind: 'object', id: obj, start: p, origin: [floor.objects[obj].x, floor.objects[obj].y] };
            return;
        }
        const rf = roofFeatures.find(x => pointInPolygon(p, x.poly));
        if (rf) {
            api().select({ kind: 'roofFeature', id: rf.f.id });
            api().beginGesture();
            drag.current = { kind: 'roofFeature', id: rf.f.id, start: p, origin: [rf.f.x, rf.f.y] };
            return;
        }
        const op = hitOpening(p);
        if (op) {
            api().select({ kind: 'opening', ...op });
            api().beginGesture();
            drag.current = { kind: 'opening', ...op };
            return;
        }
        const wallId = hitWall(p)?.wall.id ?? hitBoundary(p);
        if (wallId) {
            const w = floor.walls[wallId];
            api().select({ kind: 'wall', id: wallId });
            api().beginGesture();
            const origin: Record<string, Vec2> = {};
            for (const id of [w.a, w.b]) origin[id] = [floor.nodes[id].x, floor.nodes[id].y];
            drag.current = { kind: 'wall', id: wallId, start: p, origin };
            return;
        }
        drag.current = { kind: 'pan', start: [e.clientX, e.clientY], view, moved: false };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const p = toPlan(e);
        const d = drag.current;
        if (d?.kind === 'pan') {
            const dx = e.clientX - d.start[0];
            const dy = e.clientY - d.start[1];
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            setView({ ...d.view, x: d.view.x - dx / d.view.s, y: d.view.y - dy / d.view.s });
            return;
        }
        if (d?.kind === 'node') {
            const s = snap(p, e, { excludeNodes: new Set([d.id]) });
            setCursor(s);
            api().editFloor(f => ops.moveNode(f, d.id, s.point));
            return;
        }
        if (d?.kind === 'wall') {
            const w = floor.walls[d.id];
            const delta = sub(p, d.start);
            const g = settings.snap && !e.shiftKey ? settings.grid : 0;
            const snapped: Vec2 = g ? [Math.round(delta[0] / g) * g, Math.round(delta[1] / g) * g] : delta;
            if (w) api().editFloor(f => ops.translateWall(f, d.id, snapped, d.origin));
            return;
        }
        if (d?.kind === 'opening') {
            const fr = geometry.frames[d.wallId];
            if (!fr) return;
            const o = fr.wall.openings.find(x => x.id === d.id);
            if (!o) return;
            let u = dot(sub(p, fr.start), fr.dir);
            if (settings.snap && !e.shiftKey) u = Math.round(u / settings.grid) * settings.grid;
            const clamped = clampOpening({ ...o, offset: u }, fr);
            api().updateOpening(d.wallId, d.id, { offset: clamped.offset });
            return;
        }
        if (d?.kind === 'object') {
            const o = floor.objects[d.id];
            const asset = o && findAsset(project, o.assetId);
            if (!o || !asset) return;
            const target = add(d.origin, sub(p, d.start));
            const pl = computePlacement({
                floor,
                asset,
                point: target,
                rotation: o.rotation,
                scale: o.scale,
                elevation: o.elevation,
                grid: settings.grid,
                snap: settings.snap && !e.shiftKey,
            });
            api().updateObject(d.id, { x: pl.x, y: pl.y, rotation: pl.rotation, elevation: pl.elevation });
            return;
        }
        if (d?.kind === 'roofFeature') {
            const g = settings.snap && !e.shiftKey ? settings.grid : 0;
            const r = (v: number) => (g ? Math.round(v / g) * g : v);
            const t = add(d.origin, sub(p, d.start));
            api().updateRoofFeature(d.id, { x: r(t[0]), y: r(t[1]) });
            return;
        }
        if (d?.kind === 'background' && floor.background) {
            const delta = sub(p, d.start);
            api().updateFloor(floor.id, { background: { ...floor.background, x: d.origin[0] + delta[0], y: d.origin[1] + delta[1] } });
            return;
        }

        if (drawing) setCursor(snap(p, e, { from: drawFrom?.point }));
        else if (tool === 'door' || tool === 'window') setHoverPreview(openingPreview(p));
        else if (tool === 'place') setPlacePoint(p);
        else if (tool === 'calibrate') setCursor({ point: p, target: { kind: 'point', point: p }, kind: 'free', guides: [] });
        else setCursor(null);
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.kind === 'pan') {
            if (!d.moved && e.button === 0 && tool === 'select') {
                const room = hitRoom(toPlan(e));
                api().select(room ? { kind: 'room', anchor: room.meta?.anchor ?? room.centroid } : null);
            }
            if (!d.moved && e.button === 2 && drawing) {
                setDrawFrom(null);
                setTyped('');
            }
            return;
        }
        if (d.kind === 'node') {
            const s = snap(toPlan(e), e, { excludeNodes: new Set([d.id]) });
            api().editFloor(f => {
                if (s.target.kind === 'wall' && f.walls[s.target.wallId]) {
                    const nid = ops.splitWall(f, s.target.wallId, s.point);
                    if (nid !== d.id) ops.mergeNodes(f, d.id, nid);
                } else {
                    const keep = ops.moveNode(f, d.id, s.point, true);
                    if (keep !== d.id) api().select({ kind: 'node', id: keep });
                }
            });
            setCursor(null);
        }
        if (d.kind === 'wall') {
            api().editFloor(f => {
                const w = f.walls[d.id];
                if (!w) return;
                for (const id of [w.a, w.b]) {
                    const n = f.nodes[id];
                    if (n) ops.moveNode(f, id, [n.x, n.y], true);
                }
            });
        }
        api().endGesture();
    };

    const onWheel = (e: React.WheelEvent) => {
        const p = toPlan(e);
        const factor = Math.exp(-e.deltaY * 0.0015);
        const s = Math.min(800, Math.max(5, view.s * factor));
        const r = svgRef.current!.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        setView({ x: p[0] - sx / s, y: p[1] - sy / s, s });
    };

    // ---------- keyboard: finish drawing, typed lengths ----------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
            if (e.key === 'Escape') {
                setDrawFrom(null);
                setTyped('');
                setCalib([]);
                return;
            }
            if (!drawing || !drawFrom) return;
            if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !typed.includes(','))) {
                setTyped(t => t + (e.key === '.' ? ',' : e.key));
                e.preventDefault();
            } else if (e.key === 'Backspace' && typed) {
                setTyped(t => t.slice(0, -1));
                e.preventDefault();
                e.stopPropagation();
            } else if (e.key === 'Enter' && typed && cursor) {
                const length = parseFloat(typed.replace(',', '.'));
                const v = sub(cursor.point, drawFrom.point);
                const l = Math.hypot(v[0], v[1]);
                if (length > 0 && l > 1e-6) {
                    const end = add(drawFrom.point, scale(v, length / l));
                    const endId = api().addWall(drawFrom.target, { kind: 'point', point: end }, tool === 'area');
                    setDrawFrom({ target: { kind: 'node', nodeId: endId }, point: end });
                }
                setTyped('');
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [tool, drawFrom, typed, cursor, api]);

    // ---------- rendering ----------
    const vb = `${view.x} ${view.y} ${size.w / view.s} ${size.h / view.s}`;
    const px = (n: number) => n * mpp;
    const gridMinor = view.s > 120 ? 0.1 : view.s > 30 ? 0.5 : 1;
    const gridMajor = view.s > 30 ? 1 : 5;

    const sel = selection;
    const selectedRoom = sel?.kind === 'room' ? rooms.find(r => pointInPolygon(sel.anchor, r.polygon)) : undefined;
    const selectedWall = sel?.kind === 'wall' ? geometry.frames[sel.id] : undefined;

    const preview =
        drawing && drawFrom && cursor
            ? (() => {
                  let end = cursor.point;
                  const typedLen = parseFloat(typed.replace(',', '.'));
                  const v = sub(end, drawFrom.point);
                  const l = Math.hypot(v[0], v[1]);
                  if (typed && typedLen > 0 && l > 1e-6) end = add(drawFrom.point, scale(v, typedLen / l));
                  return { a: drawFrom.point, b: end, length: dist(drawFrom.point, end) };
              })()
            : null;

    const bg = floor.background;
    const calibMeasured = calib.length === 2 ? dist(calib[0], calib[1]) : 0;

    return (
        <div className="plan-editor">
            <svg
                ref={svgRef}
                className={`plan-svg tool-${tool}`}
                viewBox={vb}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => !drag.current && (setCursor(null), setHoverPreview(null), setPlacePoint(null))}
                onWheel={onWheel}
                onDoubleClick={() => drawing && (setDrawFrom(null), setTyped(''))}
                onContextMenu={e => e.preventDefault()}
            >
                <defs>
                    <pattern id="grid-minor" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse">
                        <path d={`M ${gridMinor} 0 L 0 0 0 ${gridMinor}`} className="grid-minor" />
                    </pattern>
                    <pattern id="grid-major" width={gridMajor} height={gridMajor} patternUnits="userSpaceOnUse">
                        <rect width={gridMajor} height={gridMajor} fill="url(#grid-minor)" />
                        <path d={`M ${gridMajor} 0 L 0 0 0 ${gridMajor}`} className="grid-major" />
                    </pattern>
                </defs>
                <rect x={view.x} y={view.y} width={size.w / view.s} height={size.h / view.s} fill="url(#grid-major)" />

                {bg?.visible && (
                    <image
                        href={bg.src}
                        x={bg.x}
                        y={bg.y}
                        width={bg.pxWidth * bg.scale}
                        height={bg.pxHeight * bg.scale}
                        opacity={bg.opacity}
                        preserveAspectRatio="none"
                        className={sel?.kind === 'background' ? 'bg-selected' : undefined}
                    />
                )}

                {below &&
                    Object.values(below.frames).map(fr => (
                        <polygon key={fr.wall.id} points={ptsAttr(fr.footprint)} className="wall-below" />
                    ))}

                {rooms.map((r, i) => (
                    <polygon
                        key={i}
                        points={ptsAttr(r.polygon)}
                        className={`room ${r === selectedRoom ? 'selected' : ''}`}
                        style={r.meta?.floorColor ? { fill: r.meta.floorColor } : undefined}
                    />
                ))}

                {boundaries.map(w => {
                    const a = floor.nodes[w.a];
                    const b = floor.nodes[w.b];
                    return (
                        <line
                            key={w.id}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            className={`boundary ${sel?.kind === 'wall' && sel.id === w.id ? 'selected' : ''}`}
                        />
                    );
                })}
                {Object.values(geometry.frames).map(fr => (
                    <polygon
                        key={fr.wall.id}
                        points={ptsAttr(fr.footprint)}
                        className={`wall ${fr === selectedWall ? 'selected' : ''}`}
                    />
                ))}
                {geometry.hubs.map(h => (
                    <polygon key={h.nodeId} points={ptsAttr(h.polygon)} className="wall hub" />
                ))}

                {Object.values(geometry.frames).flatMap(fr =>
                    fr.wall.openings.map(raw => {
                        const o = clampOpening(raw, fr);
                        const selected = sel?.kind === 'opening' && sel.id === o.id;
                        return <OpeningSymbol key={o.id} frame={fr} u={o.offset} width={o.width} type={o.type} selected={selected} mpp={mpp} />;
                    }),
                )}

                {roof && (
                    <g className="roof-plan">
                        <polygon points={ptsAttr(roofOutline(roof))} />
                        {roofCreases(roof).map(([a, b], i) => (
                            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                        ))}
                    </g>
                )}
                {roofFeatures.map(({ f, poly }) => (
                    <g key={f.id} className={`roof-feature ${f.type} ${sel?.kind === 'roofFeature' && sel.id === f.id ? 'selected' : ''}`}>
                        <polygon points={ptsAttr(poly)} />
                        <text x={f.x} y={f.y} fontSize={10 * mpp} textAnchor="middle" dominantBaseline="central">
                            {f.type === 'window' ? 'Dachfenster' : 'Gaube'}
                        </text>
                    </g>
                ))}

                {objectsDrawn.map(({ o, asset }) => (
                    <ObjectSymbol
                        key={o.id}
                        poly={objectFootprint(o, asset)}
                        rotation={o.rotation}
                        center={[o.x, o.y]}
                        depth={asset.size[2] * o.scale[2]}
                        label={o.name ?? asset.name}
                        mount={asset.mount}
                        selected={sel?.kind === 'object' && sel.id === o.id}
                        mpp={mpp}
                    />
                ))}
                {placeAsset &&
                    placePoint &&
                    (() => {
                        const pl = placement(placePoint, { shiftKey: false });
                        if (!pl) return null;
                        const ghost = { ...pl, scale: [1, 1, 1] as [number, number, number] };
                        return (
                            <ObjectSymbol
                                poly={objectFootprint(ghost, placeAsset)}
                                rotation={pl.rotation}
                                center={[pl.x, pl.y]}
                                depth={placeAsset.size[2]}
                                label={placeAsset.name}
                                mount={placeAsset.mount}
                                selected
                                preview
                                mpp={mpp}
                            />
                        );
                    })()}

                {hoverPreview && (
                    <OpeningSymbol
                        frame={hoverPreview.frame}
                        u={hoverPreview.u}
                        width={hoverPreview.width}
                        type={tool === 'door' ? 'door' : 'window'}
                        selected
                        preview
                        mpp={mpp}
                    />
                )}

                {rooms.map((r, i) => (
                    <g key={i} transform={`translate(${r.centroid[0]} ${r.centroid[1]})`} className="room-label">
                        <text y={-px(4)} fontSize={px(13)} textAnchor="middle">
                            {r.meta?.name ?? 'Raum'}
                        </text>
                        <text y={px(12)} fontSize={px(11)} textAnchor="middle" className="room-area">
                            {r.area.toFixed(2).replace('.', ',')} m²
                        </text>
                    </g>
                ))}

                {selectedWall && <Dimension a={selectedWall.start} b={selectedWall.end} mpp={mpp} offset={selectedWall.wall.thickness / 2 + px(14)} />}

                {(tool === 'select' || drawing) &&
                    Object.values(floor.nodes).map(n => (
                        <circle
                            key={n.id}
                            cx={n.x}
                            cy={n.y}
                            r={px(sel?.kind === 'node' && sel.id === n.id ? 6 : 4)}
                            className={`node ${sel?.kind === 'node' && sel.id === n.id ? 'selected' : ''}`}
                        />
                    ))}

                {preview && (
                    <>
                        <line
                            x1={preview.a[0]}
                            y1={preview.a[1]}
                            x2={preview.b[0]}
                            y2={preview.b[1]}
                            className={tool === 'area' ? 'boundary preview' : 'wall-preview'}
                            strokeWidth={tool === 'area' ? undefined : settings.wallThickness}
                        />
                        <Dimension a={preview.a} b={preview.b} mpp={mpp} offset={settings.wallThickness / 2 + px(14)} label={typed ? `${typed} m` : undefined} />
                    </>
                )}

                {cursor?.guides.map((g, i) => (
                    <line key={i} x1={g[0][0]} y1={g[0][1]} x2={g[1][0]} y2={g[1][1]} className="guide" />
                ))}
                {cursor && tool !== 'calibrate' && (
                    <circle cx={cursor.point[0]} cy={cursor.point[1]} r={px(cursor.kind === 'node' ? 7 : 5)} className={`snap snap-${cursor.kind}`} />
                )}

                {tool === 'calibrate' && calib.length > 0 && (
                    <>
                        <line
                            x1={calib[0][0]}
                            y1={calib[0][1]}
                            x2={(calib[1] ?? cursor?.point ?? calib[0])[0]}
                            y2={(calib[1] ?? cursor?.point ?? calib[0])[1]}
                            className="calib-line"
                        />
                        {calib.map((c, i) => (
                            <circle key={i} cx={c[0]} cy={c[1]} r={px(5)} className="calib-point" />
                        ))}
                    </>
                )}
            </svg>

            <div className="plan-hud">
                <button onClick={() => fitView(floor)} title="Ansicht einpassen">⤢ Einpassen</button>
                <span>{floor.name}</span>
                <span className="north" title={`Norden (${project.style?.northAngle ?? 0}°) – einstellbar unter Gestaltung`}>
                    <svg viewBox="-12 -12 24 24" width="22" height="22" style={{ transform: `rotate(${project.style?.northAngle ?? 0}deg)` }}>
                        <path d="M0 -10 L5 6 L0 3 L-5 6 Z" fill="#c43d3d" />
                        <text y="-1" fontSize="7" textAnchor="middle" fill="#fff" fontWeight="700">N</text>
                    </svg>
                </span>
            </div>
            <div className="plan-hint">
                {drawing && (
                    <span className="hint">
                        {drawFrom
                            ? typed
                                ? `Länge: ${typed} m – Enter übernimmt`
                                : 'Klicken: nächster Punkt · Länge tippen + Enter · Doppelklick/Esc/Rechtsklick: beenden · Shift: frei'
                            : tool === 'area'
                              ? 'Bereich: Umriss klicken (z. B. eine Terrasse) – geschlossene Flächen werden zu Bereichen wie Räume'
                              : 'Klicken, um eine Wand zu beginnen'}
                    </span>
                )}
                {(tool === 'door' || tool === 'window') && <span className="hint">Auf eine Wand klicken, um {tool === 'door' ? 'eine Tür' : 'ein Fenster'} einzusetzen</span>}
                {tool === 'select' && <span className="hint">Klicken: auswählen · Ziehen: verschieben · Leere Fläche ziehen: Ansicht bewegen · Mausrad: Zoom</span>}
                {tool === 'place' && (
                    <span className="hint">
                        {placeAsset ? `${placeAsset.name} platzieren: klicken · R: drehen · nahe einer Wand rastet es an · Esc/V: fertig` : 'Objekt in der Bibliothek wählen'}
                    </span>
                )}
                {tool === 'background' && <span className="hint">{bg ? 'Ziehen, um den Grundriss zu verschieben' : 'Zuerst rechts ein Bild laden'}</span>}
                {tool === 'calibrate' && calib.length < 2 && <span className="hint">Zwei Punkte mit bekanntem Abstand im Bild anklicken</span>}
            </div>

            {tool === 'calibrate' && calib.length === 2 && (
                <form
                    className="calib-dialog"
                    onSubmit={e => {
                        e.preventDefault();
                        const real = parseFloat(calibLen.replace(',', '.'));
                        if (!bg || !(real > 0) || calibMeasured <= 0) return;
                        const k = real / calibMeasured;
                        // scale the image around the first calibration point
                        const nx = calib[0][0] - (calib[0][0] - bg.x) * k;
                        const ny = calib[0][1] - (calib[0][1] - bg.y) * k;
                        api().updateFloor(floor.id, { background: { ...bg, scale: bg.scale * k, x: nx, y: ny } });
                        setCalib([]);
                        setCalibLen('');
                        api().setTool('select');
                    }}
                >
                    <div>Gemessen im Bild: {fmt(calibMeasured)}</div>
                    <label>
                        Tatsächliche Länge (m)
                        <input autoFocus value={calibLen} onChange={e => setCalibLen(e.target.value)} placeholder="z. B. 4,20" />
                    </label>
                    <div className="row">
                        <button type="submit" disabled={!bg}>
                            Übernehmen
                        </button>
                        <button type="button" onClick={() => setCalib([])}>
                            Abbrechen
                        </button>
                    </div>
                    {!bg && <div className="warn">Kein Hintergrundbild geladen.</div>}
                </form>
            )}
        </div>
    );
}

function OpeningSymbol(props: { frame: WallFrame; u: number; width: number; type: 'door' | 'window'; selected?: boolean; preview?: boolean; mpp: number }) {
    const { frame: fr, u, width, type } = props;
    const t = fr.wall.thickness;
    const c = pointOnWall(fr, u);
    const angle = (Math.atan2(fr.dir[1], fr.dir[0]) * 180) / Math.PI;
    const cls = `opening ${props.selected ? 'selected' : ''} ${props.preview ? 'preview' : ''}`;
    return (
        <g transform={`translate(${c[0]} ${c[1]}) rotate(${angle})`} className={cls}>
            <rect x={-width / 2} y={-t / 2} width={width} height={t} className="opening-gap" />
            {type === 'window' ? (
                <>
                    <line x1={-width / 2} y1={-t / 6} x2={width / 2} y2={-t / 6} className="opening-line" />
                    <line x1={-width / 2} y1={t / 6} x2={width / 2} y2={t / 6} className="opening-line" />
                </>
            ) : (
                <>
                    {/* leaf hinged at the start side, opening towards the wall's left side (+y local) */}
                    <line x1={-width / 2} y1={t / 2} x2={-width / 2} y2={t / 2 + width} className="opening-line" />
                    <path d={`M ${-width / 2} ${t / 2 + width} A ${width} ${width} 0 0 0 ${width / 2} ${t / 2}`} className="opening-arc" />
                </>
            )}
        </g>
    );
}

function ObjectSymbol(props: {
    poly: Vec2[];
    center: Vec2;
    rotation: number;
    depth: number;
    label: string;
    mount: string;
    selected?: boolean;
    preview?: boolean;
    mpp: number;
}) {
    const { front } = objectAxes(props.rotation);
    const tip = add(props.center, scale(front, props.depth / 2));
    const cls = `object mount-${props.mount} ${props.selected ? 'selected' : ''} ${props.preview ? 'preview' : ''}`;
    // label only when it fits into the footprint (in screen pixels), or when selected
    const edge = (i: number) => Math.hypot(props.poly[i + 1][0] - props.poly[i][0], props.poly[i + 1][1] - props.poly[i][1]) / props.mpp;
    const fits = Math.max(edge(0), edge(1)) > props.label.length * 6 + 6 && Math.min(edge(0), edge(1)) > 14;
    const showLabel = props.selected || (fits && props.mount !== 'ceiling');
    return (
        <g className={cls}>
            <polygon points={ptsAttr(props.poly)} />
            {/* front edge marker */}
            <line x1={props.center[0]} y1={props.center[1]} x2={tip[0]} y2={tip[1]} className="object-front" />
            {showLabel && (
                <text x={props.center[0]} y={props.center[1]} fontSize={10 * props.mpp} textAnchor="middle" dominantBaseline="central">
                    {props.label}
                </text>
            )}
        </g>
    );
}

function Dimension({ a, b, mpp, offset, label }: { a: Vec2; b: Vec2; mpp: number; offset: number; label?: string }) {
    const l = dist(a, b);
    if (l < 1e-6) return null;
    const dir: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const n: Vec2 = [-dir[1], dir[0]];
    const pa = add(a, scale(n, offset));
    const pb = add(b, scale(n, offset));
    const mid = scale(add(pa, pb), 0.5);
    let angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    return (
        <g className="dimension">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
            <line x1={a[0]} y1={a[1]} x2={pa[0]} y2={pa[1]} />
            <line x1={b[0]} y1={b[1]} x2={pb[0]} y2={pb[1]} />
            <g transform={`translate(${mid[0]} ${mid[1]}) rotate(${angle})`}>
                <rect x={-34 * mpp} y={-9 * mpp} width={68 * mpp} height={18 * mpp} rx={3 * mpp} className="dim-bg" />
                <text fontSize={12 * mpp} textAnchor="middle" dominantBaseline="central">
                    {label ?? fmt(l)}
                </text>
            </g>
        </g>
    );
}
