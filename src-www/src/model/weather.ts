/**
 * Weather for the 3D scene: interpreted from the ioBroker "daswetter"
 * adapter (Meteored) or set manually.
 *
 * daswetter creates per location and hour (…ForecastHourly.Hour_1…24 and,
 * optionally, …ForecastHourly.Current): symbol_description, clouds (%),
 * rain (mm), temperature (°C), wind_speed (km/h), wind_direction (text),
 * night (boolean).
 */
import type { StateValue } from '../iobroker/backend';

export type WeatherPreset = 'sunny' | 'cloudy' | 'overcast' | 'rain' | 'heavyrain' | 'storm' | 'snow' | 'fog';
export type WeatherMode = 'off' | 'live' | WeatherPreset;

export const WEATHER_MODES: Record<WeatherMode, string> = {
    off: 'Aus',
    live: 'Live (daswetter)',
    sunny: 'Sonnig',
    cloudy: 'Wolkig',
    overcast: 'Bedeckt',
    rain: 'Regen',
    heavyrain: 'Starkregen',
    storm: 'Gewitter',
    snow: 'Schnee',
    fog: 'Nebel',
};

export interface Weather {
    /** Cloud cover 0…1. */
    clouds: number;
    /** Rain intensity 0…1. */
    rain: number;
    /** Snowfall intensity 0…1. */
    snow: number;
    thunder: boolean;
    /** Fog density 0…1. */
    fog: number;
    /** Wind speed in km/h. */
    wind: number;
    /** Compass direction the wind comes FROM, radians clockwise from north (undefined: calm/unknown). */
    windFrom?: number;
    temperature?: number;
    description?: string;
    night?: boolean;
}

export const CLEAR: Weather = { clouds: 0, rain: 0, snow: 0, thunder: false, fog: 0, wind: 0 };

export const PRESETS: Record<WeatherPreset, Weather> = {
    sunny: { ...CLEAR, clouds: 0.1, wind: 5, description: 'Sonnig' },
    cloudy: { ...CLEAR, clouds: 0.5, wind: 12, windFrom: (250 * Math.PI) / 180, description: 'Teilweise bewölkt' },
    overcast: { ...CLEAR, clouds: 1, wind: 15, windFrom: (250 * Math.PI) / 180, description: 'Bedeckt' },
    rain: { ...CLEAR, clouds: 0.9, rain: 0.5, wind: 18, windFrom: (240 * Math.PI) / 180, description: 'Mäßiger Regen' },
    heavyrain: { ...CLEAR, clouds: 1, rain: 1, wind: 35, windFrom: (240 * Math.PI) / 180, description: 'Starker Regen' },
    storm: { ...CLEAR, clouds: 1, rain: 0.8, thunder: true, wind: 45, windFrom: (260 * Math.PI) / 180, description: 'Gewitter' },
    snow: { ...CLEAR, clouds: 0.9, snow: 0.6, wind: 8, windFrom: (30 * Math.PI) / 180, temperature: -2, description: 'Schnee' },
    fog: { ...CLEAR, clouds: 0.8, fog: 0.8, wind: 2, description: 'Nebel' },
};

/** The datapoints of a daswetter hour channel that vis-3d reads. */
export const WEATHER_STATES = ['symbol_description', 'clouds', 'rain', 'temperature', 'wind_speed', 'wind_direction', 'night'] as const;
export type WeatherValues = Partial<Record<(typeof WEATHER_STATES)[number], StateValue | undefined>>;

export const weatherIds = (channel: string) => WEATHER_STATES.map(s => `${channel}.${s}`);

const num = (v: StateValue | undefined): number | undefined => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'));
    return undefined;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "N", "NO"/"NE", "SW", "WSW", "Nord-Ost", "West" … → radians clockwise from north. */
export function parseWindDirection(v: StateValue | undefined): number | undefined {
    if (typeof v === 'number') return (v * Math.PI) / 180;
    if (typeof v !== 'string') return undefined;
    const s = v.trim().toUpperCase();
    if (!s) return undefined;
    const deg = Number(s.replace('°', ''));
    if (Number.isFinite(deg)) return (deg * Math.PI) / 180;
    // spelled-out names first, then letter codes (German O = east)
    const words: [RegExp, string][] = [
        [/NORD/g, 'N'],
        [/SÜD|SUED|SOUTH/g, 'S'],
        [/OST|EAST/g, 'E'],
        [/WEST/g, 'W'],
        [/NORTH/g, 'N'],
    ];
    let code = s;
    for (const [re, c] of words) code = code.replace(re, c);
    code = code.replace(/O/g, 'E').replace(/[^NESW]/g, '');
    const dirs: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
    const d = dirs[code];
    return d === undefined ? undefined : (d * Math.PI) / 180;
}

/** Turns the adapter's values into what the scene shows. */
export function interpretWeather(v: WeatherValues): Weather {
    const desc = typeof v.symbol_description === 'string' ? v.symbol_description : '';
    const d = desc.toLowerCase();
    const temp = num(v.temperature);
    const mm = num(v.rain) ?? 0;
    const cloudsPct = num(v.clouds);

    let clouds = cloudsPct !== undefined ? clamp01(cloudsPct / 100) : 0;
    if (/bedeckt|overcast/.test(d)) clouds = Math.max(clouds, 0.95);
    else if (/bewölkt|cloud/.test(d)) clouds = Math.max(clouds, 0.5);

    // precipitation: the description names the kind and strength, the amount refines it
    const strength = /stark|heavy/.test(d) ? 1 : /mäßig|moderate/.test(d) ? 0.6 : /leicht|light|staub|dust|niesel|drizzle/.test(d) ? 0.3 : 0;
    const fromAmount = clamp01(mm / 4);
    const named = /regen|rain|schauer|shower|niesel|drizzle|hagel|hail|schnee|snow|gewitter mit|thunderstorm with hail/.test(d);
    let intensity = Math.max(strength && named ? strength : 0, fromAmount);
    if (named && intensity === 0) intensity = 0.4;
    if (mm < 0.05 && !named) intensity = 0;
    const snowy = /schnee|snow/.test(d);
    const rainy = /regen|rain|schauer|shower|niesel|drizzle|hagel|hail/.test(d);
    let snow = 0;
    let rain = 0;
    if (snowy && rainy) {
        snow = intensity * 0.5;
        rain = intensity * 0.6;
    } else if (snowy || (intensity > 0 && temp !== undefined && temp <= 0.5)) {
        snow = intensity;
    } else {
        rain = intensity;
    }
    const thunder = /gewitter|thunder/.test(d) && !/trocken|dry/.test(d) ? true : /gewitter|thunder/.test(d);
    const fog = /dichter nebel|^fog|\bfog\b/.test(d) ? 0.9 : /nebel|mist/.test(d) ? 0.6 : /dunst|haze/.test(d) ? 0.3 : 0;
    if (precipitationClouds(rain, snow, thunder)) clouds = Math.max(clouds, 0.85);

    return {
        clouds,
        rain,
        snow,
        thunder,
        fog,
        wind: num(v.wind_speed) ?? 0,
        windFrom: parseWindDirection(v.wind_direction),
        temperature: temp,
        description: desc || undefined,
        night: typeof v.night === 'boolean' ? v.night : undefined,
    };
}

const precipitationClouds = (rain: number, snow: number, thunder: boolean) => rain > 0 || snow > 0 || thunder;

/**
 * Finds daswetter hour channels among the datapoint ids: the "Current" hour
 * if the adapter copies it, otherwise the next hour (Hour_1), per location.
 */
export function findWeatherChannels(ids: string[]): string[] {
    const channels = new Set<string>();
    for (const id of ids) {
        const m = /^(daswetter\.\d+\.location_\d+\.ForecastHourly\.(Current|Hour_1))\.clouds$/.exec(id);
        if (m) channels.add(m[1]);
    }
    return [...channels].sort((a, b) => Number(b.endsWith('Current')) - Number(a.endsWith('Current')) || a.localeCompare(b));
}

/** Short summary with an icon, for the 3D view. */
export function weatherSummary(w: Weather): string {
    const icon = w.thunder ? '⛈' : w.snow > 0 ? '🌨' : w.rain > 0 ? '🌧' : w.fog > 0.3 ? '🌫' : w.clouds > 0.7 ? '☁' : w.clouds > 0.3 ? '⛅' : w.night ? '🌙' : '☀';
    const parts = [w.description ?? '', w.temperature !== undefined ? `${w.temperature.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C` : '', w.wind >= 1 ? `Wind ${Math.round(w.wind)} km/h` : ''].filter(Boolean);
    return `${icon} ${parts.join(' · ')}`.trim();
}
