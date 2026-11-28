import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Floor } from '../model/types';
import { roofFrame, roofPlanes, ROOF_THICKNESS } from '../geometry/roof';
import { buildRoofGeometry } from '../geometry/mesh';
import { snowMaterial, snowOpacity, surfaceMaterial } from './textures';
import { RoofFeatures3D, type FeatureMaterials } from './RoofFeatures3D';

/**
 * The roof of a storey. `state`: closed (on the house), open (lifted off and
 * faded out, so the storey under it can be seen) or hidden.
 */
export function Roof3D(props: {
    floor: Floor;
    elevation: number;
    offset: number;
    state: 'closed' | 'open' | 'hidden';
    /** Explosion view: the roof slopes move apart, outwards and down their slope. */
    spread?: boolean;
    /** Lying snow 0…1. */
    snow?: number;
    /** Colour of the dormer walls (the facade colour). */
    wallColor?: string;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
    const { floor } = props;
    const frame = useMemo(() => roofFrame(floor), [floor]);
    // one mesh per roof plane, so the slopes can fold apart in the explosion view
    const parts = useMemo(() => {
        if (!frame) return null;
        return roofPlanes(frame).map(plane => ({
            geometry: buildRoofGeometry([plane], ROOF_THICKNESS),
            dir: outward(plane.points),
            snow: snowLayer(plane.points),
        }));
    }, [frame]);
    useEffect(() => () => parts?.forEach(p => (p.geometry.dispose(), p.snow?.dispose())), [parts]);
    const snowMat = useMemo(() => snowMaterial(1), []);
    useEffect(() => () => snowMat.dispose(), [snowMat]);
    const snow = props.snow ?? 0;
    const planeRefs = useRef<(THREE.Mesh | null)[]>([]);
    const spread = useRef(props.spread ? 1 : 0);
    const color = floor.roof?.color ?? '#8e4636';
    const material = useMemo(() => surfaceMaterial(floor.roof?.type === 'flat' ? 'gravel' : 'rooftiles', color, 1, { roughness: 0.8, side: THREE.DoubleSide }), [color, floor.roof?.type]);
    useEffect(() => () => material.dispose(), [material]);
    const wallColor = props.wallColor ?? '#e4e0d8';
    const extra = useMemo<Omit<FeatureMaterials, 'roof'>>(
        () => ({
            wall: new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }),
            frame: new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.5 }),
            glass: new THREE.MeshPhysicalMaterial({ color: '#9cc7e6', roughness: 0.05, transparent: true, opacity: 0.45 }),
            glassOpen: new THREE.MeshPhysicalMaterial({ color: '#ff8a4c', roughness: 0.2, transparent: true, opacity: 0.6 }),
            glassTilted: new THREE.MeshPhysicalMaterial({ color: '#ffcf4a', roughness: 0.2, transparent: true, opacity: 0.6 }),
        }),
        [wallColor],
    );
    useEffect(() => () => Object.values(extra).forEach(m => m.dispose()), [extra]);

    const group = useRef<THREE.Group>(null);
    const anim = useRef({ lift: props.state === 'closed' ? 0 : 1, opacity: props.state === 'closed' ? 1 : 0, offset: props.offset });
    useFrame((_, dt) => {
        const g = group.current;
        if (!g) return;
        const a = anim.current;
        const k = 1 - Math.exp(-dt * 5);
        const lift = props.state === 'open' ? 1 : 0;
        const opacity = props.state === 'closed' ? 1 : 0;
        a.lift += (lift - a.lift) * k;
        a.opacity += (opacity - a.opacity) * (props.state === 'hidden' ? 1 : k);
        a.offset += (props.offset - a.offset) * k;
        if (Math.abs(a.opacity - opacity) < 1e-3) a.opacity = opacity;
        g.position.y = props.elevation + a.offset + a.lift * 3;
        spread.current += ((props.spread ? 1 : 0) - spread.current) * k;
        parts?.forEach((p, i) => planeRefs.current[i]?.position.set(p.dir[0] * spread.current * SPREAD, 0, p.dir[1] * spread.current * SPREAD));
        g.visible = a.opacity > 0.01;
        const transparent = a.opacity < 0.999;
        if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.needsUpdate = true;
        }
        material.opacity = a.opacity;
        material.depthWrite = a.opacity > 0.5;
        for (const m of [extra.wall, extra.frame]) {
            if (m.transparent !== transparent) {
                m.transparent = transparent;
                m.needsUpdate = true;
            }
            m.opacity = a.opacity;
        }
        snowMat.opacity = snowOpacity(snow) * a.opacity;
        extra.glass.opacity = 0.45 * a.opacity;
        extra.glassOpen.opacity = 0.6 * a.opacity;
        extra.glassTilted.opacity = 0.6 * a.opacity;
    });

    if (!parts) return null;
    return (
        <group ref={group} position={[0, props.elevation + props.offset, 0]}>
            {parts.map((p, i) => (
                <mesh key={i} ref={el => void (planeRefs.current[i] = el)} geometry={p.geometry} material={material} castShadow receiveShadow onClick={props.onClick}>
                    {snow > 0 && p.snow && <mesh geometry={p.snow} material={snowMat} receiveShadow raycast={() => null} renderOrder={1} />}
                </mesh>
            ))}
            {frame && floor.roof?.features?.length ? (
                <RoofFeatures3D frame={frame} features={floor.roof.features} mats={{ roof: material, ...extra }} spread={spread} spreadBy={SPREAD} />
            ) : null}
        </group>
    );
}

/** How far the slopes fold apart in the explosion view (m). */
const SPREAD = 1.3;

/** Horizontal direction a roof plane faces (down its slope); none for a flat roof. */
function outward(points: [number, number, number][]): [number, number] {
    const [a, b, c] = points.map(p => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0) n.negate();
    const h = Math.hypot(n.x, n.z);
    return h < 0.05 ? [0, 0] : [n.x / h, n.z / h];
}

/** Snow on a roof plane: a thin layer on its top face; steep planes (over ~55°) stay bare, the snow slides off. */
function snowLayer(points: [number, number, number][]): THREE.BufferGeometry | null {
    const v = points.map(p => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize();
    if (n.y < 0) n.negate();
    if (n.y < 0.57) return null;
    const lifted = v.map(p => p.clone().addScaledVector(n, ROOF_THICKNESS + 0.004));
    return buildRoofGeometry([{ points: lifted.map(p => [p.x, p.y, p.z] as [number, number, number]) }], 0.05);
}
