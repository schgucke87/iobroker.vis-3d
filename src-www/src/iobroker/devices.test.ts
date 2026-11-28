import { describe, expect, it } from 'vitest';
import { detectDevicesInObjects } from './devices';
import { hueAdapterObjects } from './hueFixture';

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

describe('Hue lamps (structure of the ioBroker Hue adapter)', () => {
    const hue = (base: string, name: string, color: boolean): O =>
        ({
            ...ch(base, name, color ? 'light.color' : 'light.color.temperature'),
            ...st(`${base}.on`, 'An', 'switch.light', 'boolean'),
            ...st(`${base}.bri`, 'bri', 'level.brightness', 'number', { min: 0, max: 254 }),
            ...st(`${base}.level`, 'Helligkeit', 'level.dimmer', 'number', { min: 0, max: 100 }),
            ...st(`${base}.ct`, 'Farbtemperatur', 'level.color.temperature', 'number', { min: 2200, max: 6500 }),
            ...(color
                ? {
                      ...st(`${base}.hue`, 'Farbton', 'level.color.hue', 'number', { min: 0, max: 360 }),
                      ...st(`${base}.sat`, 'Sättigung', 'level.color.saturation', 'number', { min: 0, max: 100 }),
                      ...st(`${base}.xy`, 'xy', 'level.color.xy', 'string'),
                      ...st(`${base}.r`, 'r', 'level.color.red', 'number', { min: 0, max: 255 }),
                      ...st(`${base}.g`, 'g', 'level.color.green', 'number', { min: 0, max: 255 }),
                      ...st(`${base}.b`, 'b', 'level.color.blue', 'number', { min: 0, max: 255 }),
                  }
                : {}),
        }) as unknown as O;

    it('detects one light per lamp, with on/off, brightness and colour', () => {
        const objects = {
            ...hue('hue.0.Wohnzimmer_Spot', 'Wohnzimmer Spot', true),
            ...hue('hue.0.Flur_Ambiance', 'Flur Ambiance', false),
            ...en('enum.rooms.wz', 'Wohnzimmer', ['hue.0.Wohnzimmer_Spot', 'hue.0.Flur_Ambiance']),
        } as unknown as O;
        const { devices } = detectDevicesInObjects(objects);
        // the colour lamp matches "rgb" and "hue" in the type-detector: it must still be one light
        expect(devices.map(d => d.id).sort()).toEqual(['hue.0.Flur_Ambiance', 'hue.0.Wohnzimmer_Spot']);
        const spot = devices.find(d => d.id === 'hue.0.Wohnzimmer_Spot')!;
        expect(spot.type).toBe('hue');
        expect(spot.states.ON).toBe('hue.0.Wohnzimmer_Spot.on');
        expect(spot.states.DIMMER).toBe('hue.0.Wohnzimmer_Spot.level');
        expect(spot.states.SATURATION).toBe('hue.0.Wohnzimmer_Spot.sat');
        expect(spot.maxOf.HUE).toBe(360);
        expect(devices.find(d => d.id === 'hue.0.Flur_Ambiance')!.type).toBe('ct');
    });
});

describe('ioBroker Hue adapter (no ioBroker rooms)', () => {
    it('finds the lamps, takes the room from the Hue room and skips the groups', () => {
        const { devices } = detectDevicesInObjects(hueAdapterObjects());
        const byId = Object.fromEntries(devices.map(d => [d.id, d]));
        // the Hue room and entertainment area are no lamps
        expect(byId['hue.0.Wohnzimmer']).toBeUndefined();
        expect(byId['hue.0.Unterhaltung']).toBeUndefined();
        const lamp = byId['hue.0.Wohnzimmer_Stehlampe'];
        expect(lamp.type).toBe('hue');
        expect(lamp.roomId).toBe('');
        expect(lamp.roomHint).toBe('Wohnzimmer');
        expect(lamp.states.ON).toBe('hue.0.Wohnzimmer_Stehlampe.on');
        expect(lamp.states.SATURATION).toBe('hue.0.Wohnzimmer_Stehlampe.sat');
        expect(lamp.maxOf.SATURATION).toBe(254);
        expect(byId['hue.0.Spot_links'].type).toBe('ct');
        expect(byId['hue.0.Spot_links'].roomHint).toBe('Wohnzimmer');
        expect(byId['hue.0.Flurlicht'].type).toBe('dimmer');
        expect(byId['hue.0.Flurlicht'].roomHint).toBeUndefined();
        expect(devices.length).toBe(4);
    });
});
