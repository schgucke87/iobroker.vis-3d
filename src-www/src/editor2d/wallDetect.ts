/**
 * Detects walls in a floor plan image (scan or export), entirely in the
 * browser.
 *
 * Plans draw walls as two parallel outlines that are hatched, filled or (for
 * windows) crossed by thin parallel lines in between. The detector works on
 * horizontal and vertical walls:
 *
 * 1. dark pixels (Otsu threshold),
 * 2. long straight lines (dark runs of at least ~30 cm along a row/column);
 *    hatching, text, door arcs and furniture details do not form such runs,
 * 3. pairs of parallel lines at a wall-thickness distance, classified along
 *    their length by what lies between them: hatching or fill → wall,
 *    a continuous line inside → window, nothing → no wall,
 * 4. wall pieces of the same band are joined; small gaps (crossing walls)
 *    are bridged, gaps the size of a door become doors,
 * 5. wall ends are moved onto the centre line of the wall they meet.
 *
 * Everything is in image pixels; `mpp` (metres per pixel) sets the sizes.
 */

export interface GrayImage {
    width: number;
    height: number;
    /** Brightness 0…255, row by row. */
    data: Uint8Array;
}

export interface DetectedOpening {
    type: 'door' | 'window';
    /** Start and end along the wall, measured from `a`, in pixels. */
    from: number;
    to: number;
}

export interface DetectedWall {
    a: [number, number];
    b: [number, number];
    /** Wall thickness in pixels. */
    thickness: number;
    openings: DetectedOpening[];
}

export interface DetectOptions {
    /** Metres per pixel (the calibrated scale of the template). */
    mpp: number;
    /** Only look inside this pixel rectangle (e.g. around the building). */
    region?: { x0: number; y0: number; x1: number; y1: number };
}

type Kind = 'wall' | 'window' | 'empty' | 'other';

interface Line {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

interface Piece {
    x0: number;
    x1: number;
    /** Outer edges of the band. */
    y0: number;
    y1: number;
}

/** A horizontal wall during detection (vertical ones are detected on the transposed image). */
interface Band {
    x0: number;
    x1: number;
    yc: number;
    t: number;
    openings: { type: 'door' | 'window'; x0: number; x1: number }[];
    /** Number of other walls it connects to (set by connect). */
    joins?: number;
    /** Which ends meet another wall. */
    j0?: boolean;
    j1?: boolean;
}

export function otsuThreshold(img: GrayImage): number {
    const hist = new Array<number>(256).fill(0);
    for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
    const total = img.data.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let thr = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) {
            best = between;
            thr = t;
        }
    }
    return thr;
}

/** 1 = dark (ink), 0 = paper; outside the region everything counts as paper. */
function darkMask(img: GrayImage, region?: DetectOptions['region']): Uint8Array {
    const thr = Math.min(otsuThreshold(img), 200);
    const m = new Uint8Array(img.width * img.height);
    const x0 = Math.max(0, Math.floor(region?.x0 ?? 0));
    const y0 = Math.max(0, Math.floor(region?.y0 ?? 0));
    const x1 = Math.min(img.width, Math.ceil(region?.x1 ?? img.width));
    const y1 = Math.min(img.height, Math.ceil(region?.y1 ?? img.height));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * img.width + x] = img.data[y * img.width + x] <= thr ? 1 : 0;
    return m;
}

function transpose(m: Uint8Array, w: number, h: number): Uint8Array {
    const t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = m[y * w + x];
    return t;
}

/** Horizontal walls in a dark mask of size w×h. */
function horizontalBands(dark: Uint8Array, w: number, h: number, mpp: number): { bands: Band[]; lines: Line[] } {
    const px = (m: number) => m / mpp;
    const minRun = px(0.3);
    const gap = Math.max(1, Math.round(px(0.012)));

    // 1. long horizontal runs
    const runMask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let start = -1;
        let lastDark = -1;
        for (let x = 0; x <= w; x++) {
            const d = x < w && dark[row + x] === 1;
            if (d) {
                if (start < 0) start = x;
                lastDark = x;
            } else if (start >= 0 && x - lastDark > gap) {
                if (lastDark - start + 1 >= minRun) for (let i = start; i <= lastDark; i++) runMask[row + i] = 1;
                start = -1;
            }
        }
    }

    // 2. lines = connected strokes of the run mask
    const lines: Line[] = [];
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let i = 0; i < w * h; i++) {
        if (!runMask[i] || seen[i]) continue;
        let x0 = w;
        let x1 = -1;
        let y0 = h;
        let y1 = -1;
        stack.push(i);
        seen[i] = 1;
        while (stack.length) {
            const p = stack.pop()!;
            const x = p % w;
            const y = (p - x) / w;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            for (const q of nb) {
                if (q >= 0 && runMask[q] && !seen[q]) {
                    seen[q] = 1;
                    stack.push(q);
                }
            }
        }
        lines.push({ x0, x1, y0, y1 });
    }
    lines.sort((a, b) => a.y0 - b.y0);

    // prefix sums of the dark mask per row, for fast window averages
    const pre = new Uint32Array((w + 1) * h);
    for (let y = 0; y < h; y++) {
        let s = 0;
        for (let x = 0; x < w; x++) {
            s += dark[y * w + x];
            pre[y * (w + 1) + x + 1] = s;
        }
    }
    const frac = (y: number, xa: number, xb: number) => (pre[y * (w + 1) + xb] - pre[y * (w + 1) + xa]) / Math.max(1, xb - xa);

    const tMin = px(0.07);
    const tMax = px(0.55);
    // outlines in low-resolution scans are several pixels (several cm) thick
    const thinLine = Math.max(3, px(0.14));
    /** a stroke at least this thick may be a filled (black) wall by itself */
    const solidMin = Math.max(4, px(0.09));
    const step = Math.max(1, Math.round(px(0.03)));
    const half = Math.max(2, Math.round(px(0.08)));

    /**
     * True when the strokes inside the band run straight across it (stair treads, grids, dashed or not):
     * thin strips at five heights of the band are dark in the same columns. Diagonal hatching moves
     * sideways from strip to strip (by up to half the band, so a periodic hatch cannot line up everywhere).
     */
    const acrossLines = (top: number, bottom: number, xa: number, xb: number) => {
        const n = bottom - top + 1;
        const strip = Math.max(1, Math.min(3, Math.floor(n / 6)));
        const starts = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(top + f * (n - strip)));
        const darkAt = (y0: number, x: number) => {
            for (let y = y0; y < y0 + strip; y++) if (dark[y * w + x]) return true;
            return false;
        };
        for (let k = 0; k + 1 < starts.length; k++) {
            let both = 0;
            let either = 0;
            for (let x = xa; x < xb; x++) {
                const p = darkAt(starts[k], x);
                const q = darkAt(starts[k + 1], x);
                if (p || q) either++;
                if (p && q) both++;
            }
            if (!either || both < 0.6 * either) return false;
        }
        return true;
    };

    /** What lies between the outlines around column x. */
    const classify = (top: number, bottom: number, x: number): Kind => {
        const xa = Math.max(0, x - half);
        const xb = Math.min(w, x + half);
        const rows: number[] = [];
        for (let y = top; y <= bottom; y++) rows.push(frac(y, xa, xb));
        if (rows.length < 2) return 'other';
        const mean = rows.reduce((s, v) => s + v, 0) / rows.length;
        const max = Math.max(...rows);
        if (mean > 0.6) return 'wall';
        const third = Math.max(1, Math.floor(rows.length / 3));
        const parts = [rows.slice(0, third), rows.slice(third, rows.length - third), rows.slice(rows.length - third)].map(
            p => (p.length ? p.reduce((s, v) => s + v, 0) / p.length : 0),
        );
        // hatching crosses every row a little; a window is one or more rows of continuous line
        if (max < 0.7 && mean >= 0.07 && parts.every(p => p >= 0.03)) {
            // hatching runs diagonally; lines straight across a wide band (stair treads, grids) are no wall
            if (bottom - top + 1 >= px(0.18) && acrossLines(top, bottom, xa, xb)) return 'other';
            return 'wall';
        }
        if (max >= 0.75 && mean < 0.6) return 'window';
        if (mean < 0.04) return 'empty';
        return 'other';
    };

    interface Run {
        kind: Kind;
        x0: number;
        x1: number;
    }
    const pieces: (Piece & { score: number })[] = [];
    const windows: Piece[] = [];
    const addRuns = (top: number, bottom: number, y0: number, y1: number, ox0: number, ox1: number) => {
        const runs: Run[] = [];
        for (let x = ox0; x <= ox1; x += step) {
            const kind = classify(top, bottom, x);
            const last = runs[runs.length - 1];
            if (last && last.kind === kind) last.x1 = Math.min(ox1, x + step);
            else runs.push({ kind, x0: x, x1: Math.min(ox1, x + step) });
        }
        // single misfits between two equal runs are noise
        for (let i = 1; i + 1 < runs.length; i++) {
            if (runs[i].x1 - runs[i].x0 <= 2 * step && runs[i - 1].kind === runs[i + 1].kind) {
                runs[i - 1].x1 = runs[i + 1].x1;
                runs.splice(i, 2);
                i--;
            }
        }
        for (const r of runs) {
            const len = r.x1 - r.x0;
            if (r.kind === 'wall' && len >= px(0.1)) pieces.push({ x0: r.x0, x1: r.x1, y0, y1, score: y1 - y0 });
            if (r.kind === 'window' && len >= px(0.3)) windows.push({ x0: r.x0, x1: r.x1, y0, y1 });
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const a = lines[i];
        const aThick = a.y1 - a.y0 + 1;
        // a thick stroke is a filled wall by itself
        if (aThick >= solidMin && aThick <= tMax) addRuns(a.y0, a.y1, a.y0, a.y1, a.x0, a.x1);
        if (aThick > thinLine) continue;
        for (let j = i + 1; j < lines.length; j++) {
            const b = lines[j];
            if (b.y0 - a.y0 > tMax) break;
            if (b.y1 - b.y0 + 1 > thinLine) continue;
            const t = b.y1 - a.y0 + 1;
            if (t < tMin || t > tMax || b.y0 <= a.y1 + 1) continue;
            const ox0 = Math.max(a.x0, b.x0);
            const ox1 = Math.min(a.x1, b.x1);
            if (ox1 - ox0 < px(0.15)) continue;
            // the wall faces are the middles of the drawn lines
            addRuns(a.y1 + 1, b.y0 - 1, (a.y0 + a.y1) / 2, (b.y0 + b.y1) / 2, ox0, ox1);
        }
    }

    // 3. the widest band wins where bands overlap (outer outlines, not a window line inside)
    pieces.sort((p, q) => q.score - p.score || q.x1 - q.x0 - (p.x1 - p.x0));
    const accepted: Piece[] = [];
    for (const p of pieces) {
        const len = p.x1 - p.x0;
        let covered = 0;
        for (const q of accepted) {
            if (q.y1 < p.y0 || q.y0 > p.y1) continue;
            covered += Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0));
        }
        if (covered < 0.5 * len) accepted.push(p);
    }

    // 4. join pieces of the same band
    const groups: Piece[][] = [];
    for (const p of accepted.sort((a, b) => a.x0 - b.x0)) {
        const yc = (p.y0 + p.y1) / 2;
        const t = p.y1 - p.y0;
        const g = groups.find(gr => {
            const q = gr[gr.length - 1];
            const qc = (q.y0 + q.y1) / 2;
            const qt = q.y1 - q.y0;
            return Math.abs(qc - yc) <= Math.max(2, Math.min(t, qt) / 3) && Math.abs(qt - t) <= Math.max(3, 0.35 * Math.max(t, qt)) && p.x0 - q.x1 < px(2.8);
        });
        if (g) g.push(p);
        else groups.push([p]);
    }

    /** A gap in a wall band with lines along the wall inside is a window (a door gap is empty). */
    const gapHasLines = (y0: number, y1: number, xa: number, xb: number) => {
        if (xb - xa < px(0.3)) return false;
        let lineRows = 0;
        for (let y = Math.max(0, y0 + 1); y <= Math.min(h - 1, y1 - 1); y++) if (frac(y, xa, xb) >= 0.75) lineRows++;
        return lineRows >= 1;
    };

    const bands: Band[] = [];
    for (const g of groups) {
        // thickness and centre: the most common among the pieces, weighted by length
        const total = g.reduce((s, p) => s + (p.x1 - p.x0), 0);
        const yc = g.reduce((s, p) => s + ((p.y0 + p.y1) / 2) * (p.x1 - p.x0), 0) / total;
        const t = g.reduce((s, p) => s + (p.y1 - p.y0) * (p.x1 - p.x0), 0) / total;
        let cur: Band = { x0: g[0].x0, x1: g[0].x1, yc, t, openings: [] };
        const flush = () => {
            if (cur.x1 - cur.x0 >= px(0.2)) bands.push(cur);
        };
        // windows sit in outer walls, which are thick; in thin walls lines across are dimensions or furniture
        const canHaveWindows = t >= px(0.21);
        for (let k = 1; k < g.length; k++) {
            const p = g[k];
            const gapLen = p.x0 - cur.x1;
            const win =
                canHaveWindows &&
                gapLen > 0 &&
                (windows.some(wi => Math.abs((wi.y0 + wi.y1) / 2 - yc) <= t / 2 && Math.min(wi.x1, p.x0) - Math.max(wi.x0, cur.x1) >= 0.6 * gapLen) ||
                    gapHasLines(Math.round(yc - t / 2), Math.round(yc + t / 2), Math.round(cur.x1), Math.round(p.x0)));
            if (gapLen <= px(0.5) && !win) {
                cur.x1 = Math.max(cur.x1, p.x1);
            } else if (win) {
                cur.openings.push({ type: 'window', x0: cur.x1, x1: p.x0 });
                cur.x1 = Math.max(cur.x1, p.x1);
            } else if (gapLen <= px(2.6)) {
                cur.openings.push({ type: 'door', x0: cur.x1, x1: p.x0 });
                cur.x1 = Math.max(cur.x1, p.x1);
            } else {
                flush();
                cur = { x0: p.x0, x1: p.x1, yc, t, openings: [] };
            }
        }
        flush();
    }
    // a thin band glued to a thicker one is a doubled outline (dimension line, plaster line), not a second wall
    const kept = bands.filter(
        b =>
            !bands.some(q => {
                if (q === b || q.t <= b.t) return false;
                const ov = Math.min(b.x1, q.x1) - Math.max(b.x0, q.x0);
                const edgeGap = Math.abs(b.yc - q.yc) - (b.t + q.t) / 2;
                // right against it, or a much thinner strip just beside it (window sill lines, plaster lines)
                return ov >= 0.6 * (b.x1 - b.x0) && (edgeGap <= px(0.05) || (b.t < 0.6 * q.t && edgeGap <= px(0.12)));
            }),
    );
    return { bands: kept, lines };
}

/**
 * Moves wall ends onto the centre line of the perpendicular wall they meet,
 * and lets that wall reach the junction, so corners and T-junctions connect.
 */
function connect(hs: Band[], vs: Band[], tol: number) {
    // a horizontal band: x0…x1 at y = yc; a vertical band (transposed): y range x0…x1 at x = yc
    for (const h of hs) {
        for (const end of ['x0', 'x1'] as const) {
            const x = h[end];
            let best: Band | null = null;
            let bestD = Infinity;
            for (const v of vs) {
                const d = Math.abs(v.yc - x);
                const reach = v.t / 2 + h.t / 2 + tol;
                if (d > v.t / 2 + tol + h.t / 2) continue;
                // the vertical wall must span (or nearly reach) the horizontal one
                if (h.yc < v.x0 - reach || h.yc > v.x1 + reach) continue;
                // only a wall the end points towards (or lies in)
                const outward = end === 'x1' ? v.yc - x : x - v.yc;
                if (outward < -(v.t / 2 + tol)) continue;
                if (d < bestD) {
                    bestD = d;
                    best = v;
                }
            }
            if (!best) continue;
            h[end] = best.yc;
            h.joins = (h.joins ?? 0) + 1;
            best.joins = (best.joins ?? 0) + 1;
            if (end === 'x0') h.j0 = true;
            else h.j1 = true;
            if (h.yc <= best.x0) {
                best.x0 = h.yc;
                best.j0 = true;
            }
            if (h.yc >= best.x1) {
                best.x1 = h.yc;
                best.j1 = true;
            }
        }
    }
}

/**
 * Interior walls usually stop at a door: the wall ends a door's width before
 * the wall it belongs to. A free end that points at a crossing wall within
 * door distance is extended to it; the gap becomes a door (a small gap is
 * simply closed), so the rooms close.
 */
function extendToDoors(hs: Band[], vs: Band[], mpp: number) {
    const maxDoor = 1.2 / mpp;
    const minDoor = 0.55 / mpp;
    for (const h of hs) {
        if (h.t * mpp < 0.06 || (h.x1 - h.x0) * mpp < 0.4) continue;
        for (const end of ['x0', 'x1'] as const) {
            if (end === 'x0' ? h.j0 : h.j1) continue;
            const x = h[end];
            const dirn = end === 'x1' ? 1 : -1;
            let best: Band | null = null;
            let bestGap = Infinity;
            for (const v of vs) {
                if (v === (h as unknown)) continue;
                const face = v.yc - (dirn * v.t) / 2;
                const gap = (face - x) * dirn;
                if (gap < -v.t / 2 || gap > maxDoor) continue;
                // the crossing wall must be there at this height
                if (h.yc < v.x0 - h.t / 2 || h.yc > v.x1 + h.t / 2) continue;
                if (gap < bestGap) {
                    bestGap = gap;
                    best = v;
                }
            }
            if (!best) continue;
            if (bestGap >= minDoor) {
                const face = best.yc - (dirn * best.t) / 2;
                h.openings.push(dirn > 0 ? { type: 'door', x0: x, x1: face } : { type: 'door', x0: face, x1: x });
            }
            h[end] = best.yc;
            if (end === 'x0') h.j0 = true;
            else h.j1 = true;
            h.joins = (h.joins ?? 0) + 1;
            best.joins = (best.joins ?? 0) + 1;
        }
    }
}

export function detectWalls(img: GrayImage, opts: DetectOptions): DetectedWall[] {
    const { width: w, height: h } = img;
    const dark = darkMask(img, opts.region);
    const H = horizontalBands(dark, w, h, opts.mpp).bands;
    const V = horizontalBands(transpose(dark, w, h), h, w, opts.mpp).bands;
    const tol = 0.12 / opts.mpp;
    connect(H, V, tol);
    connect(V, H, tol);
    extendToDoors(H, V, opts.mpp);
    extendToDoors(V, H, opts.mpp);

    const out: DetectedWall[] = [];
    const openings = (b: Band) =>
        b.openings.map(o => ({ type: o.type, from: o.x0 - b.x0, to: o.x1 - b.x0 })).filter(o => o.to - o.from > 0 && o.from >= 0 && o.to <= b.x1 - b.x0);
    for (const b of H.filter(b => keepBand(b, opts.mpp))) out.push({ a: [b.x0, b.yc], b: [b.x1, b.yc], thickness: b.t, openings: openings(b) });
    for (const b of V.filter(b => keepBand(b, opts.mpp))) out.push({ a: [b.yc, b.x0], b: [b.yc, b.x1], thickness: b.t, openings: openings(b) });
    return out.filter(wl => Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]) > 0.25 / opts.mpp);
}

function keepBand(b: Band, mpp: number) {
    // short pieces that meet no other wall are mostly furniture or symbols
    return (b.joins ?? 0) > 0 || (b.x1 - b.x0) * mpp >= 0.8;
}

/** Usual wall thicknesses (m); a measured one close to these is rounded to it. */
const STANDARD = [0.115, 0.175, 0.24, 0.3, 0.365, 0.425, 0.49];
export function roundThickness(m: number): number {
    const near = STANDARD.reduce((best, s) => (Math.abs(s - m) < Math.abs(best - m) ? s : best), STANDARD[0]);
    return Math.abs(near - m) <= 0.035 ? near : Math.round(m * 200) / 200;
}
