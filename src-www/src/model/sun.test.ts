import { describe, expect, it } from 'vitest';
import { daylight, sunDirection, sunPosition } from './sun';

const deg = (r: number) => (r * 180) / Math.PI;
const BERLIN = [52.52, 13.405] as const;

describe('sun position', () => {
    it('is high in the south at noon in summer', () => {
        // solar noon in Berlin ≈ 13:07 CEST = 11:07 UTC
        const s = sunPosition(new Date('2026-06-21T11:07:00Z'), ...BERLIN);
        expect(deg(s.altitude)).toBeGreaterThan(58);
        expect(deg(s.altitude)).toBeLessThan(62);
        expect(deg(s.azimuth)).toBeGreaterThan(170);
        expect(deg(s.azimuth)).toBeLessThan(190);
    });

    it('is low in the south in winter and below the horizon at night', () => {
        const winter = sunPosition(new Date('2026-12-21T11:00:00Z'), ...BERLIN);
        expect(deg(winter.altitude)).toBeGreaterThan(12);
        expect(deg(winter.altitude)).toBeLessThan(16);
        const night = sunPosition(new Date('2026-06-21T23:00:00Z'), ...BERLIN);
        expect(deg(night.altitude)).toBeLessThan(0);
    });

    it('rises in the east at the equinox', () => {
        // around sunrise on 20 March (≈ 05:10 UTC in Berlin)
        const s = sunPosition(new Date('2026-03-20T05:15:00Z'), ...BERLIN);
        expect(Math.abs(deg(s.altitude))).toBeLessThan(3);
        expect(deg(s.azimuth)).toBeGreaterThan(80);
        expect(deg(s.azimuth)).toBeLessThan(100);
    });

    it('turns compass directions into scene directions (north = −Z, east = +X)', () => {
        const east = sunDirection({ altitude: 0, azimuth: Math.PI / 2 });
        expect(east[0]).toBeCloseTo(1);
        expect(east[2]).toBeCloseTo(0);
        const south = sunDirection({ altitude: 0, azimuth: Math.PI });
        expect(south[2]).toBeCloseTo(1);
        // the house turned by 90°: north points to the plan's right, so the morning sun comes from below
        const turned = sunDirection({ altitude: 0, azimuth: Math.PI / 2 }, 90);
        expect(turned[2]).toBeCloseTo(1);
    });

    it('maps the altitude to night, dusk and day', () => {
        expect(daylight(-0.3).day).toBe(0);
        expect(daylight(-0.3).sun).toBe(0);
        expect(daylight(0).sun).toBeGreaterThan(0);
        expect(daylight(0.6).hemi).toBeCloseTo(1.3);
    });
});
