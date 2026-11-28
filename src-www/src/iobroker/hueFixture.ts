// Test data only (not imported by the app).

/**
 * Objects exactly as the ioBroker Hue adapter (3.17) creates them: light channels with
 * on/bri/level/ct/hue/sat/xy/r/g/b/…, bri AND level both with role level.dimmer, no
 * enum.rooms at all, and a channel per Hue room (role "Room", native.lights).
 */
export function hueAdapterObjects(): Record<string, ioBroker.Object> {
    const objs: Record<string, unknown> = {};
    const state = (id: string, role: string, type: string, extra: Record<string, unknown> = {}) =>
        (objs[id] = { _id: id, type: 'state', common: { name: id.split('.').slice(2).join('.'), role, type, read: true, write: true, ...extra }, native: {} });
    const light = (name: string, lid: string, type: string) => {
        const base = `hue.0.${name.replace(/\s/g, '_')}`;
        const color = type === 'Extended color light' || type === 'Color light';
        const dimmable = !type.startsWith('On/Off');
        state(`${base}.on`, 'switch.light', 'boolean');
        state(`${base}.reachable`, 'indicator.reachable', 'boolean', { write: false });
        state(`${base}.alert`, 'text', 'string');
        if (dimmable) {
            state(`${base}.bri`, 'level.dimmer', 'number', { min: 0, max: 254 });
            state(`${base}.level`, 'level.dimmer', 'number', { min: 0, max: 100 });
            state(`${base}.command`, 'command', 'string');
            state(`${base}.transitiontime`, 'level', 'number', { min: 0, max: 64000, unit: 'ds' });
        }
        if (type !== 'Dimmable light' && dimmable) state(`${base}.ct`, 'level.color.temperature', 'number', { min: 2000, max: 6500, unit: '°K' });
        if (color) {
            state(`${base}.hue`, 'level.color.hue', 'number', { min: 0, max: 360, unit: '°' });
            state(`${base}.sat`, 'level.color.saturation', 'number', { min: 0, max: 254 });
            state(`${base}.xy`, 'level.color.xy', 'string');
            state(`${base}.r`, 'level.color.red', 'number', { min: 0, max: 255 });
            state(`${base}.g`, 'level.color.green', 'number', { min: 0, max: 255 });
            state(`${base}.b`, 'level.color.blue', 'number', { min: 0, max: 255 });
            state(`${base}.effect`, 'text', 'string');
            state(`${base}.colormode`, 'colormode', 'string', { write: false });
        }
        const role = type === 'Dimmable light' ? 'light.dimmer' : type.startsWith('On/Off') ? 'switch' : 'light.color';
        objs[base] = { _id: base, type: 'channel', common: { name, role }, native: { id: lid, type, name, modelid: 'LCT015' } };
        return base;
    };
    const group = (name: string, gid: string, type: string, lights: string[]) => {
        const base = `hue.0.${name.replace(/\s/g, '_')}`;
        state(`${base}.on`, 'switch.light', 'boolean');
        state(`${base}.bri`, 'level.dimmer', 'number', { min: 0, max: 254 });
        state(`${base}.level`, 'level.dimmer', 'number', { min: 0, max: 100 });
        state(`${base}.anyOn`, 'indicator.switch', 'boolean', { write: false });
        objs[base] = { _id: base, type: 'channel', common: { name, role: type }, native: { id: gid, type, name, lights } };
    };
    light('Wohnzimmer Stehlampe', '3', 'Extended color light');
    light('Spot links', '4', 'Color temperature light');
    light('Flurlicht', '5', 'Dimmable light');
    light('Gartenlaterne', '6', 'Extended color light');
    group('Wohnzimmer', '1', 'Room', ['3', '4']);
    group('Unterhaltung', '2', 'Entertainment', ['3']);
    // colour functions enum, the only enum the adapter writes
    objs['enum.functions.color'] = { _id: 'enum.functions.color', type: 'enum', common: { name: 'Color', members: ['hue.0.Wohnzimmer_Stehlampe.sat'] }, native: {} };
    return objs as unknown as Record<string, ioBroker.Object>;
}

