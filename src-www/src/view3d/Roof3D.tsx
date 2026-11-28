import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Floor } from '../model/types';
import { roofFrame, roofPlanes, ROOF_THICKNESS } from '../geometry/roof';
import { buildRoofGeometry } from '../geometry/mesh';
import { surfaceMaterial } from './textures';

/**
 * The roof of a storey. `state`: closed (on the house), open (lifted off and
 * faded out, so the storey under it can be seen) or hidden.
 */
export function Roof3D(props: {
    floor: Floor;
    elevation: number;
    offset: number;
    state: 'closed' | 'open' | 'hidden';
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
    const { floor } = props;
    const frame = useMemo(() => roofFrame(floor), [floor]);
    const geometry = useMemo(() => (frame ? buildRoofGeometry(roofPlanes(frame), ROOF_THICKNESS) : null), [frame]);
    useEffect(() => () => geometry?.dispose(), [geometry]);
    const color = floor.roof?.color ?? '#8e4636';
    const material = useMemo(() => surfaceMaterial(floor.roof?.type === 'flat' ? 'gravel' : 'rooftiles', color, 1, { roughness: 0.8, side: THREE.DoubleSide }), [color, floor.roof?.type]);
    useEffect(() => () => material.dispose(), [material]);

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
        g.visible = a.opacity > 0.01;
        const transparent = a.opacity < 0.999;
        if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.needsUpdate = true;
        }
        material.opacity = a.opacity;
        material.depthWrite = a.opacity > 0.5;
    });

    if (!geometry) return null;
    return (
        <group ref={group} position={[0, props.elevation + props.offset, 0]}>
            <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={props.onClick} />
        </group>
    );
}
