import { describe, expect, it } from 'vitest';
import { openMeteoSnowDepth, snowAmount, snowDepthFromState } from './snow';

describe('lying snow', () => {
    it('maps depth to cover', () => {
        expect(snowAmount(0)).toBe(0);
        expect(snowAmount(0.2)).toBe(0);
        expect(snowAmount(1)).toBeCloseTo(0.37);
        expect(snowAmount(10)).toBe(1);
        expect(snowAmount(40)).toBe(1);
    });

    it('reads datapoints as yes/no or cm', () => {
        expect(snowDepthFromState(true)).toBe(10);
        expect(snowDepthFromState(false)).toBe(0);
        expect(snowDepthFromState(4.5)).toBe(4.5);
        expect(snowDepthFromState('3,5')).toBe(3.5);
        expect(snowDepthFromState('true')).toBe(10);
        expect(snowDepthFromState('')).toBeUndefined();
        expect(snowDepthFromState(null)).toBeUndefined();
    });

    it('reads Open-Meteo answers (metres), current first, else the closest hour', () => {
        expect(openMeteoSnowDepth({ current: { time: '2026-11-28T07:00', snow_depth: 0.06 } })?.depthCm).toBeCloseTo(6);
        const r = openMeteoSnowDepth(
            { hourly: { time: ['2026-11-28T06:00', '2026-11-28T07:00', '2026-11-28T08:00'], snow_depth: [0.1, 0.12, null] } },
            new Date('2026-11-28T07:20:00Z'),
        );
        expect(r?.depthCm).toBeCloseTo(12);
        expect(r?.time.toISOString()).toBe('2026-11-28T07:00:00.000Z');
        expect(openMeteoSnowDepth({})).toBeNull();
    });
});
