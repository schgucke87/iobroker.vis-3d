/**
 * Position of the sun (after the formulas used by SunCalc / Astronomy
 * Answers), and the lighting that goes with it.
 */
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (date: Date) => date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = RAD * 102.9372; // perihelion of the Earth
    return M + C + P + Math.PI;
}
const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l: number) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

export interface SunPosition {
    /** Height above the horizon in radians (negative at night). */
    altitude: number;
    /** Compass direction in radians, clockwise from north (0 = N, π/2 = E). */
    azimuth: number;
}

export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
    const lw = RAD * -longitude;
    const phi = RAD * latitude;
    const d = toDays(date);
    const L = eclipticLongitude(meanAnomaly(d));
    const dec = declination(L);
    const H = siderealTime(d, lw) - rightAscension(L);
    const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    // SunCalc's azimuth is measured from south, turn it into a compass bearing from north
    const fromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    const azimuth = (fromSouth + Math.PI + 2 * Math.PI) % (2 * Math.PI);
    return { altitude, azimuth };
}

/**
 * Direction towards the sun in scene coordinates. `northAngle` is where north
 * points in the floor plan, in degrees clockwise from the plan's "up" (−Z):
 * 0 = north is up, 90 = north is to the right.
 */
export function sunDirection(sun: SunPosition, northAngle = 0): [number, number, number] {
    // compass bearing → bearing in the plan, clockwise from the plan's "up"
    const az = sun.azimuth + northAngle * RAD;
    const c = Math.cos(sun.altitude);
    return [Math.sin(az) * c, Math.sin(sun.altitude), -Math.cos(az) * c];
}

export interface DaylightSetup {
    hemiSky: string;
    hemiGround: string;
    hemi: number;
    sunColor: string;
    sun: number;
    /** 0 = night sky, 1 = full daylight sky. */
    day: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mixHex(a: string, b: string, t: number): string {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('');
}

/**
 * Lighting for a sun altitude: night below −6° (civil twilight), warm low sun
 * up to ~10°, full daylight above.
 */
export function daylight(altitude: number): DaylightSetup {
    const deg = altitude / RAD;
    const night = { hemiSky: '#2a3656', hemiGround: '#151820', hemi: 0.35, sunColor: '#9fb3ff', sun: 0.0 };
    const dusk = { hemiSky: '#ffd7b0', hemiGround: '#6d5a58', hemi: 0.8, sunColor: '#ff9a5a', sun: 1.3 };
    const day = { hemiSky: '#dbe9ff', hemiGround: '#b8b0a0', hemi: 1.3, sunColor: '#fff6e8', sun: 1.9 };
    const mix = (a: typeof night, b: typeof night, t: number) => ({
        hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
        hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
        hemi: lerp(a.hemi, b.hemi, t),
        sunColor: mixHex(a.sunColor, b.sunColor, t),
        sun: lerp(a.sun, b.sun, t),
    });
    if (deg <= -6) return { ...night, day: 0 };
    if (deg <= 2) return { ...mix(night, dusk, clamp01((deg + 6) / 8)), day: clamp01((deg + 6) / 8) };
    if (deg <= 12) return { ...mix(dusk, day, clamp01((deg - 2) / 10)), day: 1 };
    return { ...day, day: 1 };
}

/** Somewhere in the middle of Germany, if ioBroker has no location configured. */
export const DEFAULT_LOCATION = { latitude: 51.0, longitude: 10.0 };
