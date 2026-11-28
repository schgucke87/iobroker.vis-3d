import { useEffect, useMemo, useRef, useState } from 'react';
import { Sky, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useWeather, WeatherEffects, type Shelter } from './Weather3D';
import type { Weather } from '../model/weather';
import type { ProjectStyle } from '../model/types';
import { applySnowOpacity, snowMaterial, surfaceMaterial } from './textures';
import { daylight, DEFAULT_LOCATION, sunDirection, sunPosition, type SunPosition } from '../model/sun';
import { useConnection } from '../iobroker/connect';

interface LightSetup {
    hemiSky: string;
    hemiGround: string;
    hemi: number;
    sunColor: string;
    sun: number;
    sunPos: [number, number, number];
}

/** Fixed daylight, evening and night lighting; at night the house lamps are the main light. */
const LIGHTS: Record<Exclude<ProjectStyle['sky'], 'auto'>, LightSetup> = {
    color: { hemiSky: '#ffffff', hemiGround: '#b8b0a0', hemi: 1.4, sunColor: '#ffffff', sun: 1.6, sunPos: [15, 25, 10] },
    day: { hemiSky: '#dbe9ff', hemiGround: '#b8b0a0', hemi: 1.3, sunColor: '#fff6e8', sun: 1.9, sunPos: [15, 25, 10] },
    sunset: { hemiSky: '#ffd7b0', hemiGround: '#6d5a58', hemi: 0.8, sunColor: '#ff9a5a', sun: 1.6, sunPos: [30, 6, 8] },
    night: { hemiSky: '#2a3656', hemiGround: '#151820', hemi: 0.35, sunColor: '#9fb3ff', sun: 0.25, sunPos: [-10, 25, -15] },
};

/** Location from ioBroker's system settings (or a default), and the sun position, updated every minute. */
export function useLiveSun(enabled: boolean): { sun: SunPosition; location: { latitude: number; longitude: number }; fromIoBroker: boolean; now: Date } {
    const backend = useConnection(s => s.backend);
    const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!enabled || !backend) return;
        let alive = true;
        void backend.getLocation().then(l => alive && setLocation(l));
        return () => {
            alive = false;
        };
    }, [enabled, backend]);
    useEffect(() => {
        if (!enabled) return;
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, [enabled]);
    const loc = location ?? DEFAULT_LOCATION;
    return { sun: sunPosition(now, loc.latitude, loc.longitude), location: loc, fromIoBroker: !!location, now };
}

/** Sky, ground and the global lights, following the project style (or the real time of day). */
export function Environment({
    style,
    groundOpacity = 1,
    shelter,
    snowCover = 0,
}: {
    style: ProjectStyle;
    groundOpacity?: number;
    shelter?: Shelter;
    /** Opacity of the lying snow, 0 = none (see useSnowCover / snowOpacity). */
    snowCover?: number;
}) {
    const live = useLiveSun(style.sky === 'auto');
    const ground = useMemo(
        // the ground disc has UVs 0…1 over its 160 m diameter
        () => surfaceMaterial(style.groundMaterial, style.groundColor, 160, { roughness: 1 }),
        [style.groundMaterial, style.groundColor],
    );
    useEffect(() => () => ground.dispose(), [ground]);
    useEffect(() => {
        ground.transparent = groundOpacity < 1;
        ground.opacity = groundOpacity;
        ground.depthWrite = groundOpacity > 0.5;
        ground.needsUpdate = true;
    }, [ground, groundOpacity]);

    let l: LightSetup;
    let skySun: [number, number, number] | null = null;
    let night = false;
    let day = 1;
    if (style.sky === 'auto') {
        const d = daylight(live.sun.altitude);
        const dir = sunDirection(live.sun, style.northAngle);
        // below the horizon the directional light is moonlight from above
        const lightDir: [number, number, number] = live.sun.altitude > 0.02 ? dir : [-0.3, 1, -0.5];
        l = { ...d, sunPos: [lightDir[0] * 40, lightDir[1] * 40, lightDir[2] * 40] };
        if (d.day > 0.05) skySun = [dir[0] * 100, Math.max(dir[1], -0.05) * 100, dir[2] * 100];
        night = d.day < 0.5;
        day = d.day;
    } else {
        l = LIGHTS[style.sky];
        if (style.sky === 'day') skySun = [15, 25, 10];
        if (style.sky === 'sunset') skySun = [30, 2, 8];
        night = style.sky === 'night';
        day = style.sky === 'night' ? 0 : style.sky === 'sunset' ? 0.6 : 1;
    }

    // weather: clouds swallow the sun, an overcast sky turns grey, fog closes in
    const weather = useWeather(style);
    const flash = useRef(0);
    const clouds = weather?.clouds ?? 0;
    const gloom = weather ? Math.min(1, weather.rain * 0.6 + weather.snow * 0.3 + (weather.thunder ? 0.4 : 0)) : 0;
    if (weather) {
        l = {
            ...l,
            sun: l.sun * (1 - 0.85 * clouds),
            hemi: l.hemi * (1 - 0.25 * gloom),
            hemiSky: mix(l.hemiSky, '#c9cfd6', clouds * 0.7),
        };
    }
    const overcast = !!weather && style.sky !== 'color' && (clouds > 0.6 || gloom > 0.3);
    const skyColor = overcast ? overcastColor(clouds, gloom, day) : null;
    const fog = weather ? fogSetup(weather, skyColor ?? (style.sky === 'color' ? style.skyColor : '#c8ced6'), day) : null;
    const showStars = night && clouds < 0.5;

    return (
        <>
            {style.sky === 'color' && <color attach="background" args={[style.skyColor]} />}
            {skyColor && <FlashBackground color={skyColor} flash={flash} />}
            {!skyColor && night && !skySun && <color attach="background" args={['#0b1020']} />}
            {!skyColor && skySun && (
                <Sky
                    distance={400}
                    sunPosition={skySun}
                    turbidity={(skySun[1] < 15 ? 9 : 6) + clouds * 12}
                    rayleigh={(skySun[1] < 15 ? 3 : 1.2) * (1 - clouds * 0.6)}
                    mieCoefficient={0.005 + clouds * 0.01}
                    mieDirectionalG={0.85}
                />
            )}
            {showStars && <Stars radius={250} depth={60} count={3000} factor={6} fade speed={0.3} />}
            {fog ? (
                <fog attach="fog" args={[fog.color, fog.near, fog.far]} />
            ) : (
                night && !skySun && <fog attach="fog" args={['#0b1020', 60, 220]} />
            )}
            {weather && <WeatherEffects weather={weather} northAngle={style.northAngle} shelter={shelter} onFlash={v => (flash.current = v)} />}

            <hemisphereLight args={[l.hemiSky, l.hemiGround, l.hemi]} />
            <directionalLight
                position={l.sunPos}
                color={l.sunColor}
                intensity={l.sun}
                castShadow={l.sun > 0.05}
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-25}
                shadow-camera-right={25}
                shadow-camera-top={25}
                shadow-camera-bottom={-25}
                shadow-camera-far={120}
                shadow-bias={-0.0005}
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow material={ground}>
                <circleGeometry args={[80, 64]} />
            </mesh>
            {snowCover > 0 && groundOpacity >= 1 && <SnowCover opacity={snowCover} />}
        </>
    );
}

const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHexString();

/** Grey sky of an overcast day; darker in rain and at night. */
function overcastColor(clouds: number, gloom: number, day: number): string {
    const dayGrey = mix('#b7c3cf', '#7d858e', clouds * 0.4 + gloom * 0.6);
    return mix('#10141c', dayGrey, Math.min(1, day * 1.2));
}

/** Fog for fog weather, haze in rain and snow. */
function fogSetup(w: Weather, color: string, day: number): { color: string; near: number; far: number } | null {
    const density = Math.max(w.fog, w.rain * 0.45, w.snow * 0.6);
    if (density < 0.05) return null;
    const c = w.fog > 0.1 ? mix(mix('#0e1219', '#c9ced3', Math.min(1, day * 1.2)), color, 0.3) : color;
    return { color: c, near: 4 + (1 - density) * 30, far: 30 + (1 - density) * 170 };
}

/** Scene background that lights up with lightning. */
function FlashBackground({ color, flash }: { color: string; flash: { current: number } }) {
    const scene = useThree(s => s.scene);
    const base = useMemo(() => new THREE.Color(color), [color]);
    const bg = useMemo(() => new THREE.Color(color), []); // eslint-disable-line react-hooks/exhaustive-deps
    const white = useMemo(() => new THREE.Color('#e8ecff'), []);
    useEffect(() => {
        const prev = scene.background;
        scene.background = bg;
        return () => {
            scene.background = prev;
        };
    }, [scene, bg]);
    useFrame(() => bg.copy(base).lerp(white, flash.current * 0.6));
    return null;
}

/** Snow on the ground: a dusting lets the ground show through, deep snow covers it. */
function SnowCover({ opacity }: { opacity: number }) {
    const material = useMemo(() => snowMaterial(160), []);
    useEffect(() => () => material.dispose(), [material]);
    applySnowOpacity(material, opacity);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow material={material} renderOrder={-1}>
            <circleGeometry args={[80, 64]} />
        </mesh>
    );
}
