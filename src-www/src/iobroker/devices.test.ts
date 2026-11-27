import { describe, expect, it } from 'vitest';
import { detectDevicesInObjects } from './devices';

type O = Record<string, ioBroker.Object>;

const st = (id: string, name: string, role: string, type: string, extra: Record<string, unknown> = {}) => ({
    [id]: { _id: id, type: 'state', common: { name, role, type, read: true, write: role.startsWith('switch') || role.startsWith('level'), ...extra }, native: {} },
});
const ch = (id: string, name: string, role = '') => ({ [id]: { _id: id, type: 'channel', common: { name, role }, native: {} } });
const en = (id: string, name: string, members: string[]) => ({ [id]: { _id: id, type: 'enum', common: { name, members }, native: {} } });

export function fixture(): O {
    return {
        ...ch('hm.0.licht', 'Deckenlicht Wohnzimmer', 'light'),
        ...st('hm.0.licht.STATE', 'Deckenlicht', 'switch.light', 'boolean'),
        ...ch('hue.0.esstisch', 'Esstischlampe', 'light.dimmer'),
        ...st('hue.0.esstisch.level', 'Helligkeit', 'level.dimmer', 'number', { min: 0, max: 100, unit: '%' }),
        ...st('hue.0.esstisch.on', 'An', 'switch.light', 'boolean'),
        ...ch('hm.0.thermostat', 'Thermostat Wohnzimmer', 'thermostat'),
        ...st('hm.0.thermostat.SET_POINT_TEMPERATURE', 'Soll', 'level.temperature', 'number', { unit: '°C' }),
        ...st('hm.0.thermostat.ACTUAL_TEMPERATURE', 'Ist', 'value.temperature', 'number', { unit: '°C' }),
        ...st('hm.0.thermostat.HUMIDITY', 'Luftfeuchte', 'value.humidity', 'number', { unit: '%' }),
        ...ch('hm.0.fenster', 'Fenster Wohnzimmer', 'window'),
        ...st('hm.0.fenster.STATE', 'Fenster', 'sensor.window', 'boolean'),
        ...ch('hm.0.griff', 'Drehgriff Küche', 'window'),
        ...st('hm.0.griff.STATE', 'Griff', 'value.window', 'number', { states: { 0: 'CLOSED', 1: 'TILTED', 2: 'OPEN' } }),
        ...ch('hm.0.rollladen', 'Rollladen Wohnzimmer', 'blind'),
        ...st('hm.0.rollladen.LEVEL', 'Position', 'level.blind', 'number', { min: 0, max: 100, unit: '%' }),
        ...ch('hm.0.bewegung', 'Bewegungsmelder Flur', 'motion'),
        ...st('hm.0.bewegung.MOTION', 'Bewegung', 'sensor.motion', 'boolean'),
        ...en('enum.rooms.wohnzimmer', { de: 'Wohnzimmer', en: 'Living room' } as unknown as string, [
            'hm.0.licht', 'hue.0.esstisch', 'hm.0.thermostat', 'hm.0.fenster', 'hm.0.rollladen',
        ]),
        ...en('enum.rooms.kueche', 'Küche', ['hm.0.griff']),
        ...en('enum.rooms.flur', 'Flur', ['hm.0.bewegung']),
        ...en('enum.functions.light', 'Licht', ['hm.0.licht', 'hue.0.esstisch']),
    } as unknown as O;
}

describe('device detection (type-detector)', () => {
    it('finds the devices per room', () => {
        const { devices, rooms } = detectDevicesInObjects(fixture());
        expect(rooms.map(r => r.name).sort()).toEqual(['Flur', 'Küche', 'Wohnzimmer']);
        const byId = Object.fromEntries(devices.map(d => [d.id, d]));
        // print what was detected, handy when the type-detector changes
        console.log(devices.map(d => `${d.roomName}: ${d.id} → ${d.type} ${JSON.stringify(d.states)}`).join('\n'));
        expect(byId['hm.0.licht'].type).toBe('light');
        expect(byId['hm.0.licht'].states.SET).toBe('hm.0.licht.STATE');
        expect(byId['hue.0.esstisch'].type).toBe('dimmer');
        expect(byId['hue.0.esstisch'].states.SET).toBe('hue.0.esstisch.level');
        expect(byId['hm.0.fenster'].type).toBe('window');
        expect(byId['hm.0.griff'].type).toBe('windowTilt');
        expect(byId['hm.0.rollladen'].type).toBe('blind');
        expect(byId['hm.0.rollladen'].max).toBe(100);
        expect(['thermostat', 'temperature']).toContain(byId['hm.0.thermostat'].type);
        expect(byId['hm.0.bewegung'].type).toBe('motion');
        expect(byId['hm.0.licht'].roomName).toBe('Wohnzimmer');
    });
});
