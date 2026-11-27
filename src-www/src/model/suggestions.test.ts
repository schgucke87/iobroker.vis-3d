import { describe, expect, it } from 'vitest';
import { demoProject } from './demo';
import { DemoBackend } from '../iobroker/demoBackend';
import { applySuggestions, buildSuggestions, NEW_LAMP, projectRooms } from './suggestions';
import { projectStateIds } from '../iobroker/connect';

describe('suggestions from detected devices', async () => {
    const detection = await new DemoBackend().detectDevices();

    it('suggests everything for an unwired house', () => {
        const project = demoProject({ bindings: false });
        const r = buildSuggestions(project, detection);
        const byKind = (k: string) => r.suggestions.filter(s => s.kind === k);
        // all rooms of the demo house match the ioBroker rooms by name
        expect(r.unmatched).toEqual([]);
        // 9 room temperatures + humidity in the bathroom
        expect(byKind('climate').length).toBe(10);
        expect(byKind('light').map(s => s.device.name).sort()).toContain('Esstischlampe');
        expect(byKind('contact').every(s => s.defaultTarget && !s.disabledReason)).toBe(true);
        expect(byKind('blind').length).toBe(2);
        // two window contacts in different rooms never default to the same window
        const targets = byKind('contact').map(s => s.defaultTarget);
        expect(new Set(targets).size).toBe(targets.length);
        // motion detector and TV are not supported (yet)
        expect(r.unsupported.some(d => d.type === 'motion')).toBe(true);
        // switch + level of the living-room light are one dimmer
        const living = byKind('light').filter(s => s.room.name === 'Wohnzimmer');
        expect(living.map(s => s.device.type).sort()).toEqual(['dimmer', 'light']);
    });

    it('matches lights to lamps by name', () => {
        const project = demoProject({ bindings: false });
        const r = buildSuggestions(project, detection);
        const label = (name: string) => {
            const s = r.suggestions.find(x => x.device.name === name)!;
            return s.targets.find(t => t.id === s.defaultTarget)!.label;
        };
        expect(label('Wohnzimmer Deckenlicht')).toBe('vorhandene Deckenleuchte');
        expect(label('Stehlampe')).toBe('vorhandene Stehlampe');
    });

    it('binds existing lamps before placing new ones', () => {
        const project = demoProject({ bindings: false });
        const r = buildSuggestions(project, detection);
        const kitchen = r.suggestions.filter(s => s.kind === 'light' && s.room.name === 'Küche');
        // the kitchen has one ceiling lamp and two lights in ioBroker:
        // the first uses the existing lamp, the second gets a new one
        expect(kitchen.map(s => s.device.name)).toEqual(['Küche Deckenlicht', 'Esstischlampe']);
        expect(kitchen[0].defaultTarget).not.toBe(NEW_LAMP);
        expect(kitchen[1].defaultTarget).toBe(NEW_LAMP);
    });

    it('applies the suggestions and does not suggest them again', () => {
        const project = demoProject({ bindings: false });
        const r = buildSuggestions(project, detection);
        const applied = applySuggestions(project, r.suggestions.filter(s => !s.disabledReason).map(s => ({ suggestion: s })));
        const ids = projectStateIds(applied);
        expect(ids.has('demo.0.temperatur.wohnzimmer')).toBe(true);
        expect(ids.has('demo.0.rollladen.wohnzimmer')).toBe(true);
        expect(ids.has('demo.0.licht.flur')).toBe(true);
        const living = projectRooms(applied).find(x => x.name === 'Wohnzimmer')!;
        expect(living.room.meta?.temperatureId).toBe('demo.0.temperatur.wohnzimmer');
        // the hallway had no lamp: a new ceiling lamp with light + action
        const flur = applied.floors[0];
        const lamp = Object.values(flur.objects).find(o => o.behaviors?.some(b => b.stateId === 'demo.0.licht.flur'))!;
        expect(lamp.assetId).toBe('builtin:ceilingLamp');
        expect(lamp.behaviors!.map(b => b.type)).toEqual(['light', 'action']);
        // the original project is untouched
        expect(projectStateIds(project).size).toBe(0);

        const again = buildSuggestions(applied, detection);
        expect(again.suggestions.length).toBe(0);
        expect(again.alreadyBound).toBeGreaterThan(0);
    });

    it('lets unmatched ioBroker rooms be assigned to a 3D room', () => {
        const project = demoProject({ bindings: false });
        // rename the bathroom so the name no longer matches
        const og = project.floors[1];
        const bad = Object.values(og.rooms).find(m => m.name === 'Bad')!;
        bad.name = 'Badezimmer';
        bad.enumId = undefined;
        const r = buildSuggestions(project, detection);
        expect(r.unmatched.map(u => u.name)).toContain('Bad');
        const key = projectRooms(project).find(x => x.name === 'Badezimmer')!.key;
        const r2 = buildSuggestions(project, detection, { 'enum.rooms.bad': key });
        expect(r2.unmatched.map(u => u.name)).not.toContain('Bad');
        const applied = applySuggestions(project, r2.suggestions.map(s => ({ suggestion: s })), { 'enum.rooms.bad': key });
        const room = projectRooms(applied).find(x => x.name === 'Badezimmer')!;
        expect(room.room.meta?.enumId).toBe('enum.rooms.bad');
        expect(room.room.meta?.humidityId).toBe('demo.0.luftfeuchte.bad');
    });
});
