import { useEffect, useMemo } from 'react';
import { Sky, Stars } from '@react-three/drei';
import type { ProjectStyle } from '../model/types';
import { surfaceMaterial } from './textures';

interface LightSetup {
    hemiSky: string;
    hemiGround: string;
    hemi: number;
    sunColor: string;
    sun: number;
    sunPos: [number, number, number];
}

/** Daylight, evening and night lighting; at night the house lamps are the main light. */
const LIGHTS: Record<ProjectStyle['sky'], LightSetup> = {
    color: { hemiSky: '#ffffff', hemiGround: '#b8b0a0', hemi: 1.4, sunColor: '#ffffff', sun: 1.6, sunPos: [15, 25, 10] },
    day: { hemiSky: '#dbe9ff', hemiGround: '#b8b0a0', hemi: 1.3, sunColor: '#fff6e8', sun: 1.9, sunPos: [15, 25, 10] },
    sunset: { hemiSky: '#ffd7b0', hemiGround: '#6d5a58', hemi: 0.8, sunColor: '#ff9a5a', sun: 1.6, sunPos: [30, 6, 8] },
    night: { hemiSky: '#2a3656', hemiGround: '#151820', hemi: 0.35, sunColor: '#9fb3ff', sun: 0.25, sunPos: [-10, 25, -15] },
};

/** Sky, ground and the global lights, following the project style. */
export function Environment({ style }: { style: ProjectStyle }) {
    const l = LIGHTS[style.sky];
    const ground = useMemo(
        // the ground disc has UVs 0…1 over its 160 m diameter
        () => surfaceMaterial(style.groundMaterial, style.groundColor, 160, { roughness: 1 }),
        [style.groundMaterial, style.groundColor],
    );
    useEffect(() => () => ground.dispose(), [ground]);

    return (
        <>
            {style.sky === 'color' && <color attach="background" args={[style.skyColor]} />}
            {style.sky === 'night' && <color attach="background" args={['#0b1020']} />}
            {style.sky === 'day' && <Sky distance={400} sunPosition={[15, 25, 10]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />}
            {style.sky === 'sunset' && <Sky distance={400} sunPosition={[30, 2, 8]} turbidity={9} rayleigh={3} mieCoefficient={0.008} mieDirectionalG={0.9} />}
            {style.sky === 'night' && <Stars radius={250} depth={60} count={3000} factor={6} fade speed={0.3} />}
            {style.sky === 'night' && <fog attach="fog" args={['#0b1020', 60, 220]} />}

            <hemisphereLight args={[l.hemiSky, l.hemiGround, l.hemi]} />
            <directionalLight
                position={l.sunPos}
                color={l.sunColor}
                intensity={l.sun}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-25}
                shadow-camera-right={25}
                shadow-camera-top={25}
                shadow-camera-bottom={-25}
                shadow-bias={-0.0005}
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow material={ground}>
                <circleGeometry args={[80, 64]} />
            </mesh>
        </>
    );
}
