import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RoofFeature } from '../model/types';
import type { RoofFrame } from '../geometry/roof';
import { dormerShape, roofPointAt } from '../geometry/roofFeatures';
import { buildRoofGeometry } from '../geometry/mesh';
import { useStateValue } from '../iobroker/connect';
import { contactLevel } from '../model/behaviors';

export interface FeatureMaterials {
    roof: THREE.Material;
    wall: THREE.Material;
    frame: THREE.Material;
    glass: THREE.Material;
    glassOpen: THREE.Material;
    glassTilted: THREE.Material;
}

/** Roof windows and dormers of a roof, in the storey's coordinate frame. */
export function RoofFeatures3D({
    frame,
    features,
    mats,
    spread,
    spreadBy = 0,
}: {
    frame: RoofFrame;
    features: RoofFeature[];
    mats: FeatureMaterials;
    /** 0…1: how far the roof planes have moved apart (explosion view); features move with their plane. */
    spread?: { current: number };
    spreadBy?: number;
}) {
    return (
        <>
            {features.map(f => (
                <Spread key={f.id} frame={frame} feature={f} spread={spread} by={spreadBy}>
                    {f.type === 'window' ? <RoofWindow frame={frame} feature={f} mats={mats} /> : <Dormer frame={frame} feature={f} mats={mats} />}
                </Spread>
            ))}
        </>
    );
}

function Spread({ frame, feature, spread, by, children }: { frame: RoofFrame; feature: RoofFeature; spread?: { current: number }; by: number; children: ReactNode }) {
    const ref = useRef<THREE.Group>(null);
    const dir = useMemo(() => (frame.roof.type === 'flat' ? [0, 0] : roofPointAt(frame, [feature.x, feature.y]).downhill), [frame, feature.x, feature.y]);
    useFrame(() => {
        const s = (spread?.current ?? 0) * by;
        ref.current?.position.set(dir[0] * s, 0, dir[1] * s);
    });
    return <group ref={ref}>{children}</group>;
}

function useContact(f: RoofFeature) {
    const v = useStateValue(f.stateId);
    return f.stateId ? contactLevel(v, f.invert) : 0;
}

/** A roof window lying on the slope; open or tilted windows lift their sash. */
function RoofWindow({ frame, feature: f, mats }: { frame: RoofFrame; feature: RoofFeature; mats: FeatureMaterials }) {
    const level = useContact(f);
    const { position, quaternion } = useMemo(() => {
        const rp = roofPointAt(frame, [f.x, f.y]);
        const [dx, dy] = rp.downhill;
        const X = new THREE.Vector3(-dy, 0, dx);
        const Z = new THREE.Vector3(-dx, rp.tan, -dy).normalize(); // up the slope
        let Y = new THREE.Vector3().crossVectors(Z, X);
        if (Y.y < 0) {
            X.negate();
            Y = new THREE.Vector3().crossVectors(Z, X);
        }
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y.normalize(), Z));
        return { position: new THREE.Vector3(f.x, rp.top + 0.02, f.y), quaternion: q };
    }, [frame, f.x, f.y]);
    const w = f.width;
    const l = f.length ?? 1.18;
    const p = 0.07;
    // the sash opens around its top edge: open lifts it more than tilted
    const angle = level >= 1 ? 0.45 : level > 0 ? 0.15 : 0;
    const glass = level >= 1 ? mats.glassOpen : level > 0 ? mats.glassTilted : mats.glass;
    return (
        <group position={position} quaternion={quaternion}>
            {[
                [0, -l / 2 + p / 2, w, p],
                [0, l / 2 - p / 2, w, p],
                [-w / 2 + p / 2, 0, p, l],
                [w / 2 - p / 2, 0, p, l],
            ].map(([x, z, sx, sz], i) => (
                <mesh key={i} position={[x, 0.03, z]} material={mats.frame} castShadow>
                    <boxGeometry args={[sx, 0.06, sz]} />
                </mesh>
            ))}
            <group position={[0, 0.04, l / 2 - p]} rotation={[angle, 0, 0]}>
                <mesh position={[0, 0, -(l - 2 * p) / 2]} material={glass}>
                    <boxGeometry args={[w - 2 * p, 0.02, l - 2 * p]} />
                </mesh>
            </group>
        </group>
    );
}

/** A dormer: front wall with window, side walls and its own small roof. */
function Dormer({ frame, feature: f, mats }: { frame: RoofFrame; feature: RoofFeature; mats: FeatureMaterials }) {
    const level = useContact(f);
    const built = useMemo(() => {
        const rp = roofPointAt(frame, [f.x, f.y]);
        const shape = dormerShape(rp, f);
        if (!shape) return null;
        const [dx, dy] = rp.downhill;
        // local frame: x along the eaves, y up, z up the slope (horizontal)
        const q = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(new THREE.Vector3(-dy, 0, dx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx, 0, -dy)),
        );
        const outline = new THREE.Shape(shape.front.map(([x, y]) => new THREE.Vector2(x, y)));
        const [x0, y0, x1, y1] = shape.window;
        const hole = new THREE.Path();
        hole.moveTo(x0, y0);
        hole.lineTo(x0, y1);
        hole.lineTo(x1, y1);
        hole.lineTo(x1, y0);
        hole.closePath();
        outline.holes.push(hole);
        const front = new THREE.ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: false });
        front.computeVertexNormals();
        const cheeks = buildRoofGeometry(shape.cheeks.map(points => ({ points })), 0.1);
        const roof = buildRoofGeometry(shape.roof.map(points => ({ points })), 0.12);
        return { q, front, cheeks, roof, window: shape.window };
    }, [frame, f]);
    useEffect(
        () => () => {
            built?.front.dispose();
            built?.cheeks.dispose();
            built?.roof.dispose();
        },
        [built],
    );
    if (!built) return null;
    const [x0, y0, x1, y1] = built.window;
    const glass = level >= 1 ? mats.glassOpen : level > 0 ? mats.glassTilted : mats.glass;
    return (
        <group position={[f.x, 0, f.y]} quaternion={built.q}>
            <mesh geometry={built.front} material={mats.wall} castShadow receiveShadow />
            <mesh geometry={built.cheeks} material={mats.wall} castShadow receiveShadow />
            <mesh geometry={built.roof} material={mats.roof} castShadow receiveShadow />
            <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, 0.05]} material={glass}>
                <boxGeometry args={[x1 - x0, y1 - y0, 0.02]} />
            </mesh>
            {[
                [(x0 + x1) / 2, y0 + 0.03, x1 - x0, 0.06],
                [(x0 + x1) / 2, y1 - 0.03, x1 - x0, 0.06],
                [x0 + 0.03, (y0 + y1) / 2, 0.06, y1 - y0],
                [x1 - 0.03, (y0 + y1) / 2, 0.06, y1 - y0],
            ].map(([x, y, sx, sy], i) => (
                <mesh key={i} position={[x, y, 0.05]} material={mats.frame}>
                    <boxGeometry args={[sx, sy, 0.08]} />
                </mesh>
            ))}
        </group>
    );
}
