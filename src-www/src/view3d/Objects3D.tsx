import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AssetMeta, SceneObject } from '../model/types';
import { cloneInstance, loadAsset, onAssetsChanged } from '../assets/assetStore';

/** Loads an asset prototype; re-loads when the asset store changes. */
export function useAssetPrototype(id: string | null | undefined): THREE.Object3D | null {
    const [proto, setProto] = useState<THREE.Object3D | null>(null);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const off = onAssetsChanged(() => setVersion(v => v + 1));
        return () => void off();
    }, []);
    useEffect(() => {
        let alive = true;
        setProto(null);
        if (id) void loadAsset(id).then(p => alive && setProto(p));
        return () => {
            alive = false;
        };
    }, [id, version]);
    return proto;
}

const SELECT_COLOR = '#3b74e8';

export interface ObjectInstanceProps {
    obj: Pick<SceneObject, 'x' | 'y' | 'elevation' | 'rotation' | 'scale'>;
    asset: AssetMeta;
    selected?: boolean;
    ghost?: boolean;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    groupRef?: (g: THREE.Group | null) => void;
}

export function ObjectInstance({ obj, asset, selected, ghost, onClick, groupRef }: ObjectInstanceProps) {
    const proto = useAssetPrototype(asset.id);
    const instance = useMemo(() => {
        if (!proto) return null;
        const inst = cloneInstance(proto);
        if (ghost) {
            inst.traverse(o => {
                const m = o as THREE.Mesh;
                if (!m.isMesh) return;
                m.castShadow = false;
                m.raycast = () => {};
                (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
                    mat.transparent = true;
                    mat.opacity = 0.55;
                    mat.depthWrite = false;
                });
            });
        }
        return inst;
    }, [proto, ghost]);
    useEffect(
        () => () =>
            instance?.traverse(o => {
                const m = o as THREE.Mesh;
                if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
            }),
        [instance],
    );

    const [w, h, d] = asset.size;
    const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
    useEffect(() => () => outline.dispose(), [outline]);

    return (
        <group
            ref={groupRef}
            position={[obj.x, obj.elevation, obj.y]}
            rotation={[0, obj.rotation, 0]}
            scale={obj.scale}
            onClick={onClick}
        >
            {instance ? (
                <primitive object={instance} />
            ) : (
                // placeholder while loading (or if the asset is missing)
                <mesh position={[0, h / 2, 0]} raycast={ghost ? () => null : undefined}>
                    <boxGeometry args={[w, h, d]} />
                    <meshStandardMaterial color="#c8ccd2" transparent opacity={0.5} />
                </mesh>
            )}
            {(selected || ghost) && (
                <lineSegments geometry={outline} position={[0, h / 2, 0]} raycast={() => null}>
                    <lineBasicMaterial color={SELECT_COLOR} depthTest={false} transparent opacity={0.9} />
                </lineSegments>
            )}
        </group>
    );
}
