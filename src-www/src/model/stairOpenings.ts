import type { Project, Vec2 } from './types';
import { isStairId, parseStairId, stairMeta } from '../geometry/stairs';
import { objectFootprint } from '../geometry/placement';

/**
 * Openings in the floor slabs: every stair cuts its footprint out of the
 * storey it leads up to (the one whose floor lies at the top of the stair).
 * Returns the convex opening polygons per floor index.
 */
export function stairOpenings(project: Project, elevations: number[]): Vec2[][][] {
    const holes: Vec2[][][] = project.floors.map(() => []);
    project.floors.forEach((f, j) => {
        for (const o of Object.values(f.objects)) {
            if (!isStairId(o.assetId)) continue;
            const p = parseStairId(o.assetId);
            const meta = stairMeta(o.assetId);
            if (!p || !meta) continue;
            const top = elevations[j] + o.elevation + p.height;
            const i = project.floors.findIndex((g, k) => k !== j && g.kind !== 'outdoor' && Math.abs(elevations[k] - top) < 0.35);
            if (i >= 0) holes[i].push(objectFootprint(o, meta));
        }
    });
    return holes;
}
