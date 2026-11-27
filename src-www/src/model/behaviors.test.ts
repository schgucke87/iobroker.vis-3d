import { describe, expect, it } from 'vitest';
import { actionValue, contactLevel, lightLevel, newBehavior, parseConfiguredValue, temperatureColor } from './behaviors';
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
