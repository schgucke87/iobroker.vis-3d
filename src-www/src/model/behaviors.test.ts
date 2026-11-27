import { describe, expect, it } from 'vitest';
import { actionValue, contactLevel, kelvinToHex, lightColor, lightLevel, newBehavior, parseConfiguredValue, temperatureColor } from './behaviors';
import { normalizeValue } from '../iobroker/backend';
import type { Behavior } from './types';

type Action = Extract<Behavior, { type: 'action' }>;

describe('value normalisation', () => {
    it('maps booleans, on/off strings and numbers to 0…1', () => {
        expect(normalizeValue(true)).toBe(1);
        expect(normalizeValue('off')).toBe(0);
        expect(normalizeValue('AN')).toBe(1);
        expect(normalizeValue(21, 18, 24)).toBeCloseTo(0.5);
        expect(normalizeValue(99, 0, 10)).toBe(1);
        expect(normalizeValue(undefined)).toBe(0);
        expect(normalizeValue('22,5', 20, 25)).toBeCloseTo(0.5);
    });

    it('treats dimmer levels relative to their maximum', () => {
        expect(lightLevel(true, 100)).toBe(1);
        expect(lightLevel(50, 100)).toBeCloseTo(0.5);
        expect(lightLevel(0, 100)).toBe(0);
    });
});

describe('actions', () => {
    const action = (mode: Action['mode'], value = ''): Action => ({ ...(newBehavior('action', 'x') as Action), mode, value });

    it('toggles booleans and dimmers', () => {
        expect(actionValue(action('toggle'), true)).toBe(false);
        expect(actionValue(action('toggle'), false)).toBe(true);
        expect(actionValue(action('toggle'), undefined)).toBe(true);
        expect(actionValue(action('toggle'), 40)).toBe(0);
        expect(actionValue(action('toggle'), 0)).toBe(100);
    });

    it('sets typed values and increments', () => {
        expect(actionValue(action('set', 'true'), false)).toBe(true);
        expect(actionValue(action('set', '21,5'), 0)).toBe(21.5);
        expect(actionValue(action('set', 'Szene 1'), '')).toBe('Szene 1');
        expect(actionValue(action('increment', '0.5'), 20)).toBe(20.5);
        expect(parseConfiguredValue(' 42 ')).toBe(42);
    });
});

describe('contacts', () => {
    it('understands boolean and rotary handle contacts', () => {
        expect(contactLevel(true)).toBe(1);
        expect(contactLevel(false)).toBe(0);
        expect(contactLevel(true, true)).toBe(0);
        expect(contactLevel(0)).toBe(0);
        expect(contactLevel(1)).toBe(0.5);
        expect(contactLevel(2)).toBe(1);
        expect(contactLevel(undefined)).toBe(0);
    });
});

describe('heat map', () => {
    it('runs from blue (cold) to red (warm)', () => {
        const [r1, , b1] = temperatureColor(15).match(/\d+/g)!.map(Number);
        const [r2, , b2] = temperatureColor(27).match(/\d+/g)!.map(Number);
        expect(b1).toBeGreaterThan(r1);
        expect(r2).toBeGreaterThan(b2);
    });
});

describe('light colours', () => {
    it('reads RGB strings', () => {
        expect(lightColor('rgb', ['#FF8800'])).toBe('#ff8800');
        expect(lightColor('rgb', ['ff8800cc'])).toBe('#ff8800');
        expect(lightColor('rgb', ['255,0,0'])).toBe('#ff0000');
        expect(lightColor('rgb', [undefined])).toBeNull();
    });

    it('converts hue/saturation, with the colour temperature for white mode', () => {
        expect(lightColor('hue', [0, 100], [360, 100])).toBe('#ff0000');
        expect(lightColor('hue', [120, 100], [360, 100])).toBe('#00ff00');
        // raw 0…65535 hue values via max
        expect(lightColor('hue', [65535 / 3, 254], [65535, 254])).toBe('#00ff00');
        // unsaturated + colour temperature known: warm white instead of plain white
        const warm = lightColor('hue', [0, 0, 2700], [360, 100]);
        expect(warm).not.toBe('#ffffff');
    });

    it('converts colour temperatures in Kelvin and mired', () => {
        const k2700 = kelvinToHex(2700);
        expect(kelvinToHex(370)).toBe(kelvinToHex(1e6 / 370)); // values below 1000 are mired
        const [r, , b] = [1, 3, 5].map(i => parseInt(k2700.slice(i, i + 2), 16));
        expect(r).toBeGreaterThan(b); // warm
        const [r2, , b2] = [1, 3, 5].map(i => parseInt(kelvinToHex(6500).slice(i, i + 2), 16));
        expect(b2).toBeGreaterThan(200);
        expect(r2).toBeGreaterThan(200);
    });

    it('converts CIE xy and separate RGB values', () => {
        // the red corner of the Hue gamut is red
        const red = lightColor('cie', ['[0.675,0.322]'])!;
        expect(parseInt(red.slice(1, 3), 16)).toBe(255);
        expect(parseInt(red.slice(5, 7), 16)).toBeLessThan(80);
        expect(lightColor('rgbParts', [255, 128, 0], [255, 255, 255])).toBe('#ff8000');
    });
});
