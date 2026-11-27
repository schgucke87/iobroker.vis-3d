import type { Vec2 } from '../model/types';

export const EPS = 1e-9;

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function normalize(a: Vec2): Vec2 {
    const l = len(a);
    return l < EPS ? [0, 0] : [a[0] / l, a[1] / l];
}

/** Rotate 90° counter-clockwise (math orientation): the "left" normal. */
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];

/** Intersection of the lines p + t*d and q + s*e. Returns null for parallel lines. */
export function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
    const den = cross(d, e);
    if (Math.abs(den) < 1e-9) return null;
    const t = cross(sub(q, p), e) / den;
    return add(p, scale(d, t));
}

/**
 * Proper intersection of segments ab and cd (excluding the end regions within `eps`
 * of each segment's parameter range). Returns parameters along both segments.
 */
export function segmentIntersection(
    a: Vec2,
    b: Vec2,
    c: Vec2,
    d: Vec2,
    eps = 1e-6,
): { t: number; s: number; point: Vec2 } | null {
    const r = sub(b, a);
    const q = sub(d, c);
    const den = cross(r, q);
    if (Math.abs(den) < 1e-12) return null;
    const ac = sub(c, a);
    const t = cross(ac, q) / den;
    const s = cross(ac, r) / den;
    if (t <= eps || t >= 1 - eps || s <= eps || s >= 1 - eps) return null;
    return { t, s, point: add(a, scale(r, t)) };
}

/** Projection of p onto segment ab: clamped parameter, point and distance. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; distance: number } {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
    t = Math.max(0, Math.min(1, t));
    const point = add(a, scale(ab, t));
    return { t, point, distance: dist(p, point) };
}

/** Signed area by the shoelace formula; positive for counter-clockwise (math orientation). */
export function signedArea(poly: Vec2[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        s += p[0] * q[1] - q[0] * p[1];
    }
    return s / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
    const a = signedArea(poly);
    if (Math.abs(a) < EPS) {
        const n = poly.length || 1;
        return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const f = p[0] * q[1] - q[0] * p[1];
        cx += (p[0] + q[0]) * f;
        cy += (p[1] + q[1]) * f;
    }
    return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * A point guaranteed to lie inside the polygon (for labels and anchors):
 * the centroid if it is inside, otherwise the midpoint of the widest
 * horizontal span through the polygon's vertical middle.
 */
export function interiorPoint(poly: Vec2[]): Vec2 {
    const c = polygonCentroid(poly);
    if (pointInPolygon(c, poly)) return c;
    const ys = poly.map(p => p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    let best: Vec2 = c;
    let bestWidth = -1;
    for (let k = 1; k <= 9; k++) {
        const y = minY + ((maxY - minY) * k) / 10;
        const xs: number[] = [];
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i];
            const [xj, yj] = poly[j];
            if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const w = xs[i + 1] - xs[i];
            if (w > bestWidth) {
                bestWidth = w;
                best = [(xs[i] + xs[i + 1]) / 2, y];
            }
        }
    }
    return best;
}

export const angleOf = (v: Vec2): number => Math.atan2(v[1], v[0]);
