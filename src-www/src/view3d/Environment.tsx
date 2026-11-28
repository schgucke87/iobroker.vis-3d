import { useEffect, useMemo, useState } from 'react';
import { Sky, Stars } from '@react-three/drei';
import type { ProjectStyle } from '../model/types';
import { surfaceMaterial } from './textures';
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
export function Environment({ style }: { style: ProjectStyle }) {
    const live = useLiveSun(style.sky === 'auto');
    const ground = useMemo(
        // the ground disc has UVs 0…1 over its 160 m diameter
        () => surfaceMaterial(style.groundMaterial, style.groundColor, 160, { roughness: 1 }),
        [style.groundMaterial, style.groundColor],
    );
    useEffect(() => () => ground.dispose(), [ground]);

    let l: LightSetup;
    let skySun: [number, number, number] | null = null;
    let night = false;
    if (style.sky === 'auto') {
        const d = daylight(live.sun.altitude);
        const dir = sunDirection(live.sun, style.northAngle);
        // below the horizon the directional light is moonlight from above
        const lightDir: [number, number, number] = live.sun.altitude > 0.02 ? dir : [-0.3, 1, -0.5];
        l = { ...d, sunPos: [lightDir[0] * 40, lightDir[1] * 40, lightDir[2] * 40] };
        if (d.day > 0.05) skySun = [dir[0] * 100, Math.max(dir[1], -0.05) * 100, dir[2] * 100];
        night = d.day < 0.5;
    } else {
        l = LIGHTS[style.sky];
        if (style.sky === 'day') skySun = [15, 25, 10];
        if (style.sky === 'sunset') skySun = [30, 2, 8];
        night = style.sky === 'night';
    }

    return (
        <>
            {style.sky === 'color' && <color attach="background" args={[style.skyColor]} />}
            {night && !skySun && <color attach="background" args={['#0b1020']} />}
            {skySun && (
                <Sky
                    distance={400}
                    sunPosition={skySun}
                    turbidity={skySun[1] < 15 ? 9 : 6}
                    rayleigh={skySun[1] < 15 ? 3 : 1.2}
                    mieCoefficient={0.005}
                    mieDirectionalG={0.85}
                />
            )}
            {night && <Stars radius={250} depth={60} count={3000} factor={6} fade speed={0.3} />}
            {night && !skySun && <fog attach="fog" args={['#0b1020', 60, 220]} />}

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
        </>
    );
}
