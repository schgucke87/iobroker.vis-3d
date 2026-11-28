import type { Vec2 } from '../model/types';

/** Area sign of a polygon (> 0: counter-clockwise in math orientation). */
export function signedArea(p: Vec2[]): number {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[(i + 1) % p.length];
        a += x0 * y1 - x1 * y0;
    }
    return a / 2;
}

/** Keeps the part of a polygon on the side of the line through `a` that `n` points to (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Vec2[], a: Vec2, n: Vec2): Vec2[] {
    const side = (p: Vec2) => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
    const out: Vec2[] = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const sp = side(p);
        const sq = side(q);
        if (sp >= 0) out.push(p);
        if ((sp >= 0) !== (sq >= 0)) {
            const t = sp / (sp - sq);
            out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
    }
    return out;
}

/**
 * A polygon minus a convex polygon (e.g. a stair opening in a floor), as a
 * list of pieces: for every edge of the convex shape, the part of the polygon
 * outside that edge but inside all previous edges. Pieces without area are dropped.
 */
export function subtractConvex(poly: Vec2[], convex: Vec2[]): Vec2[][] {
    const c = signedArea(convex) < 0 ? [...convex].reverse() : convex;
    const pieces: Vec2[][] = [];
    let rest = poly;
    for (let i = 0; i < c.length && rest.length >= 3; i++) {
        const a = c[i];
        const b = c[(i + 1) % c.length];
        // inward normal of a counter-clockwise edge
        const inward: Vec2 = [-(b[1] - a[1]), b[0] - a[0]];
        const outside = clipHalfPlane(rest, a, [-inward[0], -inward[1]]);
        if (outside.length >= 3 && Math.abs(signedArea(outside)) > 1e-6) pieces.push(outside);
        rest = clipHalfPlane(rest, a, inward);
    }
    return pieces;
}
