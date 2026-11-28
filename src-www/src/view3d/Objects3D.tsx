import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import type { AssetMeta, Behavior, SceneObject } from '../model/types';
import { cloneInstance, loadAsset, onAssetsChanged } from '../assets/assetStore';
import { setStateValue, useConnection } from '../iobroker/connect';
import { formatValue, isTruthy, normalizeValue, type StateValue } from '../iobroker/backend';
import { actionValue, lightColor, lightLevel } from '../model/behaviors';

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
    obj: Pick<SceneObject, 'x' | 'y' | 'elevation' | 'rotation' | 'scale' | 'behaviors' | 'materialColors'>;
    asset: AssetMeta;
    selected?: boolean;
    ghost?: boolean;
    /** Viewer mode: clicks run the object's action instead of selecting it. */
    interactive?: boolean;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    groupRef?: (g: THREE.Group | null) => void;
}

export function ObjectInstance({ obj, asset, selected, ghost, interactive, onClick, groupRef }: ObjectInstanceProps) {
    const proto = useAssetPrototype(asset.id);
    const colorKey = JSON.stringify(obj.materialColors ?? {});
    const instance = useMemo(() => {
        if (!proto) return null;
        const inst = cloneInstance(proto, JSON.parse(colorKey));
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
    }, [proto, ghost, colorKey]);
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

    // ---------- behaviours ----------
    const behaviors = ghost ? [] : (obj.behaviors ?? []);
    const values = useConnection(useShallow(s => behaviors.map(b => (b.stateId ? s.values[b.stateId]?.val : undefined))));
    // extra datapoints of lights: on/off and colour
    const lightExtras = useConnection(
        useShallow(s =>
            behaviors.flatMap(b => (b.type === 'light' ? [b.onId, ...(b.colorIds ?? [])] : [])).map(id => (id ? s.values[id]?.val : undefined)),
        ),
    );
    const emitters = useMemo(() => (instance ? findEmitters(instance) : []), [instance]);
    const lightPos = useMemo(() => {
        if (!instance || !emitters.length) return new THREE.Vector3(0, h * 0.6, 0);
        const box = new THREE.Box3();
        instance.updateMatrixWorld(true);
        emitters.forEach(m => box.expandByObject(m));
        return box.getCenter(new THREE.Vector3());
    }, [instance, emitters, h]);

    let visible = true;
    const rot: [number, number, number] = [0, 0, 0];
    const pos: [number, number, number] = [0, 0, 0];
    const lights: { color: string; intensity: number; range: number }[] = [];
    const labels: string[] = [];
    let glow: { color: string; level: number } | null = null;
    let tint: string | null = null;
    let action: Extract<Behavior, { type: 'action' }> | null = null;
    let actionValueNow: StateValue | undefined;
    const axis = { x: 0, y: 1, z: 2 } as const;
    let extra = 0;
    for (let i = 0; i < behaviors.length; i++) {
        const b = behaviors[i];
        const v = values[i];
        switch (b.type) {
            case 'visibility':
                if (b.stateId && v !== undefined && isTruthy(v) === b.invert) visible = false;
                break;
            case 'transform': {
                const t = normalizeValue(v, b.min, b.max);
                const amount = b.from + (b.to - b.from) * t;
                if (b.mode === 'rotate') rot[axis[b.axis]] += THREE.MathUtils.degToRad(amount);
                else pos[axis[b.axis]] += amount;
                break;
            }
            case 'light': {
                const onVal = lightExtras[extra];
                const colorVals = lightExtras.slice(extra + 1, extra + 1 + (b.colorIds?.length ?? 0));
                extra += 1 + (b.colorIds?.length ?? 0);
                let level = lightLevel(v, b.max);
                // a separate on/off datapoint switches the light off whatever the level says
                if (b.onId && onVal !== undefined) level = isTruthy(onVal) ? (b.onId === b.stateId ? 1 : level || 1) : 0;
                const color = lightColor(b.colorMode, colorVals, b.colorMax) ?? b.color;
                lights.push({ color, intensity: b.intensity * level, range: b.range });
                if (level > 0) glow = { color, level };
                break;
            }
            case 'color':
                if (v !== undefined) tint = mixColor(b.colorMin, b.colorMax, normalizeValue(v, b.min, b.max));
                break;
            case 'label':
                if (b.stateId) labels.push(`${b.prefix ? `${b.prefix} ` : ''}${formatValue(v, b.decimals, b.unit)}`);
                break;
            case 'action':
                action = b;
                actionValueNow = v;
                break;
        }
    }

    useEffect(() => applyGlow(emitters, glow), [emitters, glow?.color, glow?.level]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => applyTint(instance, tint), [instance, tint]);

    const runAction = interactive && action;
    const handleClick = (e: ThreeEvent<MouseEvent>) => {
        if (runAction && action) {
            e.stopPropagation();
            if (action.stateId) setStateValue(action.stateId, actionValue(action, actionValueNow));
            return;
        }
        onClick?.(e);
    };

    return (
        <group
            ref={groupRef}
            position={[obj.x, obj.elevation, obj.y]}
            rotation={[0, obj.rotation, 0]}
            scale={obj.scale}
            visible={visible}
            onClick={runAction || onClick ? handleClick : undefined}
            onPointerOver={runAction ? () => (document.body.style.cursor = 'pointer') : undefined}
            onPointerOut={runAction ? () => (document.body.style.cursor = '') : undefined}
        >
            {lights.map((l, i) => (
                <pointLight
                    key={i}
                    position={lightPos}
                    color={l.color}
                    intensity={l.intensity}
                    distance={l.range}
                    decay={2}
                />
            ))}
            {labels.length > 0 && (
                <Html position={[0, h + 0.15, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="value-label-3d">{labels.join(' · ')}</div>
                </Html>
            )}
            {instance ? (
                <group rotation={rot} position={pos}>
                    <primitive object={instance} />
                </group>
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

// ---------- behaviour helpers ----------

const EMITTER_NAME = /light|lamp|leuchte|bulb|birne|shade|schirm|emit|glow/i;

/** Meshes that glow when a light is on: named parts if the model has them, otherwise the whole model. */
function findEmitters(root: THREE.Object3D): THREE.Mesh[] {
    const named: THREE.Mesh[] = [];
    const all: THREE.Mesh[] = [];
    root.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        all.push(m);
        if (EMITTER_NAME.test(m.name) || EMITTER_NAME.test(materials(m)[0]?.name ?? '')) named.push(m);
    });
    return named.length ? named : all;
}

const materials = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];

function applyGlow(meshes: THREE.Mesh[], glow: { color: string; level: number } | null) {
    for (const mesh of meshes) {
        for (const mat of materials(mesh)) {
            if (!('emissive' in mat)) continue;
            if (mat.userData.baseEmissive === undefined) {
                mat.userData.baseEmissive = mat.emissive.getHex();
                mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
            }
            if (glow) {
                mat.emissive.set(glow.color);
                mat.emissiveIntensity = 0.25 + 0.9 * glow.level;
            } else {
                mat.emissive.setHex(mat.userData.baseEmissive);
                mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
            }
        }
    }
}

function applyTint(root: THREE.Object3D | null, color: string | null) {
    root?.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of materials(m)) {
            if (!mat.color) continue;
            if (mat.userData.baseColor === undefined) mat.userData.baseColor = mat.color.getHex();
            if (color) mat.color.set(color);
            else mat.color.setHex(mat.userData.baseColor);
        }
    });
}

function mixColor(a: string, b: string, t: number): string {
    return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
