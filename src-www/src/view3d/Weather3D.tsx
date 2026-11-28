import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProjectStyle } from '../model/types';
import { interpretWeather, PRESETS, weatherIds, WEATHER_STATES, type Weather, type WeatherValues } from '../model/weather';
import { useConnection } from '../iobroker/connect';

/** The weather the scene shows: a preset, the live daswetter values, or none. */
export function useWeather(style: Pick<ProjectStyle, 'weather' | 'weatherChannel'>): Weather | null {
    const channel = style.weather === 'live' ? style.weatherChannel : undefined;
    const key = useConnection(s => (channel ? weatherIds(channel).map(id => JSON.stringify(s.values[id]?.val ?? null)).join('|') : ''));
    return useMemo(() => {
        if (style.weather === 'off') return null;
        if (style.weather !== 'live') return PRESETS[style.weather];
        if (!channel || !key) return null;
        const parts = key.split('|').map(v => JSON.parse(v));
        if (parts.every(v => v === null)) return null;
        const values: WeatherValues = {};
        WEATHER_STATES.forEach((s, i) => (values[s] = parts[i] ?? undefined));
        return interpretWeather(values);
    }, [style.weather, channel, key]);
}

/** Horizontal wind velocity in scene units (m/s), blowing away from where it comes from. */
export function windVector(w: Weather, northAngleDeg: number): [number, number] {
    if (w.windFrom === undefined || w.wind < 1) return [0, 0];
    const a = w.windFrom + (northAngleDeg * Math.PI) / 180;
    const speed = Math.min(w.wind / 3.6, 20);
    // the direction it comes from is (sin a, -cos a) in scene x/z (north = -z when northAngle = 0)
    return [-Math.sin(a) * speed, Math.cos(a) * speed];
}

/** Plan box of the house (x/z) and its top: rain and snow stop there. */
export interface Shelter {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
}

const sheltered = (b: Shelter | undefined, x: number, y: number, z: number) => !!b && y < b.top && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

const AREA = 70; // side of the precipitation box around the house
const TOP = 32;

function rand(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** Falling rain streaks; the density follows the intensity, the slant the wind. */
function Rain({ intensity, wind, shelter }: { intensity: number; wind: [number, number]; shelter?: Shelter }) {
    const MAX = 9000;
    const { geometry, drops } = useMemo(() => {
        const r = rand(7);
        const drops = new Float32Array(MAX * 3);
        for (let i = 0; i < MAX; i++) {
            drops[i * 3] = (r() - 0.5) * AREA;
            drops[i * 3 + 1] = r() * TOP;
            drops[i * 3 + 2] = (r() - 0.5) * AREA;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3));
        return { geometry: g, drops };
    }, []);
    useEffect(() => () => geometry.dispose(), [geometry]);
    const material = useMemo(() => new THREE.LineBasicMaterial({ color: '#aebfd2', transparent: true, opacity: 0.55, depthWrite: false }), []);
    useEffect(() => () => material.dispose(), [material]);

    useFrame((_, dtRaw) => {
        const dt = Math.min(dtRaw, 0.1);
        const count = Math.round(MAX * Math.min(1, Math.max(0.08, intensity)));
        const fall = 11 + intensity * 4;
        const [vx, vz] = wind;
        // a streak shows the way of a drop during ~1/25 s
        const sx = vx * 0.045;
        const sy = fall * 0.045;
        const sz = vz * 0.045;
        const pos = geometry.attributes.position.array as Float32Array;
        const half = AREA / 2;
        for (let i = 0; i < count; i++) {
            let x = drops[i * 3] + vx * dt;
            let y = drops[i * 3 + 1] - fall * dt;
            let z = drops[i * 3 + 2] + vz * dt;
            if (y < -0.2 || sheltered(shelter, x, y, z)) y += TOP;
            if (x > half) x -= AREA;
            else if (x < -half) x += AREA;
            if (z > half) z -= AREA;
            else if (z < -half) z += AREA;
            drops[i * 3] = x;
            drops[i * 3 + 1] = y;
            drops[i * 3 + 2] = z;
            const o = i * 6;
            pos[o] = x;
            pos[o + 1] = y;
            pos[o + 2] = z;
            pos[o + 3] = x - sx;
            pos[o + 4] = y + sy;
            pos[o + 5] = z - sz;
        }
        geometry.setDrawRange(0, count * 2);
        geometry.attributes.position.needsUpdate = true;
        material.opacity = 0.3 + intensity * 0.35;
    });
    return <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

function flakeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** Slowly drifting snowflakes. */
function Snow({ intensity, wind, shelter }: { intensity: number; wind: [number, number]; shelter?: Shelter }) {
    const MAX = 7000;
    const { geometry, phase } = useMemo(() => {
        const r = rand(11);
        const pos = new Float32Array(MAX * 3);
        const phase = new Float32Array(MAX);
        for (let i = 0; i < MAX; i++) {
            pos[i * 3] = (r() - 0.5) * AREA;
            pos[i * 3 + 1] = r() * TOP;
            pos[i * 3 + 2] = (r() - 0.5) * AREA;
            phase[i] = r() * Math.PI * 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return { geometry: g, phase };
    }, []);
    const texture = useMemo(() => flakeTexture(), []);
    const material = useMemo(
        () => new THREE.PointsMaterial({ size: 0.18, map: texture, transparent: true, depthWrite: false, color: '#ffffff', sizeAttenuation: true }),
        [texture],
    );
    useEffect(
        () => () => {
            geometry.dispose();
            material.dispose();
            texture.dispose();
        },
        [geometry, material, texture],
    );
    const time = useRef(0);
    useFrame((_, dtRaw) => {
        const dt = Math.min(dtRaw, 0.1);
        time.current += dt;
        const count = Math.round(MAX * Math.min(1, Math.max(0.1, intensity)));
        const pos = geometry.attributes.position.array as Float32Array;
        const half = AREA / 2;
        const [vx, vz] = wind;
        for (let i = 0; i < count; i++) {
            const sway = Math.sin(time.current * 1.3 + phase[i]) * 0.4;
            let x = pos[i * 3] + (vx * 0.6 + sway) * dt;
            let y = pos[i * 3 + 1] - (0.9 + (phase[i] % 1) * 0.5) * dt;
            let z = pos[i * 3 + 2] + (vz * 0.6 + Math.cos(time.current + phase[i]) * 0.3) * dt;
            if (y < -0.2 || sheltered(shelter, x, y, z)) y += TOP;
            if (x > half) x -= AREA;
            else if (x < -half) x += AREA;
            if (z > half) z -= AREA;
            else if (z < -half) z += AREA;
            pos[i * 3] = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = z;
        }
        geometry.setDrawRange(0, count);
        geometry.attributes.position.needsUpdate = true;
    });
    return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

function cloudTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const r = rand(3);
    // a few overlapping soft blobs make one puffy cloud
    for (let i = 0; i < 14; i++) {
        const x = 30 + r() * 68;
        const y = 44 + r() * 40;
        const rad = 18 + r() * 22;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** A layer of cloud sprites high above the house, drifting with the wind. */
function Clouds({ cover, dark, wind }: { cover: number; dark: number; wind: [number, number] }) {
    const MAX = 46;
    const RANGE = 240;
    const texture = useMemo(() => cloudTexture(), []);
    const material = useMemo(() => new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }), [texture]);
    useEffect(
        () => () => {
            material.dispose();
            texture.dispose();
        },
        [material, texture],
    );
    const clouds = useMemo(() => {
        const r = rand(5);
        return Array.from({ length: MAX }, () => ({
            x: (r() - 0.5) * RANGE,
            z: (r() - 0.5) * RANGE,
            y: 45 + r() * 25,
            s: 35 + r() * 45,
        }));
    }, []);
    const refs = useRef<(THREE.Sprite | null)[]>([]);
    useFrame((_, dtRaw) => {
        const dt = Math.min(dtRaw, 0.1);
        const [vx, vz] = wind;
        const half = RANGE / 2;
        clouds.forEach((c, i) => {
            c.x += vx * 0.4 * dt;
            c.z += vz * 0.4 * dt;
            if (c.x > half) c.x -= RANGE;
            else if (c.x < -half) c.x += RANGE;
            if (c.z > half) c.z -= RANGE;
            else if (c.z < -half) c.z += RANGE;
            const s = refs.current[i];
            if (s) s.position.set(c.x, c.y, c.z);
        });
    });
    const count = Math.round(MAX * Math.min(1, cover));
    const shade = 1 - dark * 0.55;
    material.color.setRGB(shade, shade, shade * 1.02);
    material.opacity = 0.75 + cover * 0.25;
    return (
        <>
            {clouds.slice(0, count).map((c, i) => (
                <sprite key={i} ref={el => void (refs.current[i] = el)} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.5, 1]} material={material} />
            ))}
        </>
    );
}

/** Occasional lightning: a bright flash of light (and sky) every few seconds. */
function Lightning({ onFlash }: { onFlash: (v: number) => void }) {
    const light = useRef<THREE.DirectionalLight>(null);
    const state = useRef({ next: 2 + Math.random() * 4, t: 0, flash: 0 });
    useFrame((_, dt) => {
        const s = state.current;
        s.t += dt;
        if (s.t > s.next) {
            s.t = 0;
            s.next = 3 + Math.random() * 9;
            s.flash = 1;
        }
        // a double flicker that fades quickly
        const v = s.flash > 0 ? s.flash * (0.6 + 0.4 * Math.sin(s.flash * 40)) : 0;
        s.flash = Math.max(0, s.flash - dt * 3.5);
        if (light.current) light.current.intensity = v * 6;
        onFlash(v);
    });
    return <directionalLight ref={light} position={[-20, 40, 10]} color="#dfe6ff" intensity={0} />;
}

/** Rain, snow, clouds and lightning for the given weather. */
export function WeatherEffects({
    weather,
    northAngle,
    shelter,
    onFlash,
}: {
    weather: Weather;
    northAngle: number;
    shelter?: Shelter;
    onFlash: (v: number) => void;
}) {
    const wind = useMemo(() => windVector(weather, northAngle), [weather, northAngle]);
    const dark = Math.min(1, weather.rain + weather.snow * 0.5 + (weather.thunder ? 0.5 : 0));
    return (
        <>
            {weather.clouds > 0.05 && <Clouds cover={weather.clouds} dark={dark} wind={wind} />}
            {weather.rain > 0 && <Rain intensity={weather.rain} wind={wind} shelter={shelter} />}
            {weather.snow > 0 && <Snow intensity={weather.snow} wind={wind} shelter={shelter} />}
            {weather.thunder && <Lightning onFlash={onFlash} />}
        </>
    );
}
