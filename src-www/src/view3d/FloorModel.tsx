import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { DetectedRoom, Floor, Opening } from '../model/types';
import { computeWallGeometry, clampOpening, pointOnWall, type WallFrame } from '../geometry/walls';
import { detectRooms } from '../geometry/rooms';
import { buildPrism, buildWallGeometry, yawFor } from '../geometry/mesh';
import { useStateValue } from '../iobroker/connect';
import { formatValue } from '../iobroker/backend';
import { contactLevel, temperatureColor } from '../model/behaviors';

export interface FloorModelProps {
    floor: Floor;
    elevation: number;
    /** Extra vertical offset (explosion view). Animated. */
    offset: number;
    /** 1 = visible, 0 = hidden. Animated. */
    opacity: number;
    showLabels: boolean;
    /** Colour room floors by temperature. */
    heatmap?: boolean;
    selectedWallId?: string;
    hoverRoom?: number | null;
    onFloorClick?: (e: ThreeEvent<MouseEvent>) => void;
    onRoomClick?: (room: DetectedRoom, e: ThreeEvent<MouseEvent>) => void;
    onRoomHover?: (index: number | null) => void;
    onWallClick?: (wallId: string, e: ThreeEvent<MouseEvent>) => void;
    /** Placed objects etc., rendered in the storey's coordinate frame and faded with it. */
    children?: ReactNode;
}

const COLORS = {
    wall: '#efede8',
    wallSelected: '#5b8def',
    floor: '#d8c6a5',
    frame: '#fafafa',
    glass: '#9cc7e6',
    leaf: '#e8e1d4',
};

export function FloorModel(props: FloorModelProps) {
    const { floor, elevation, offset, opacity, showLabels } = props;
    const group = useRef<THREE.Group>(null);
    const objects = useRef<THREE.Group>(null);
    const current = useRef({ offset, opacity, applied: 1 });

    const geometry = useMemo(() => computeWallGeometry(floor), [floor]);
    const rooms = useMemo(() => detectRooms(floor), [floor]);

    const wallGeos = useMemo(
        () => Object.values(geometry.frames).map(fr => ({ id: fr.wall.id, geo: buildWallGeometry(fr, -floor.slab) })),
        [geometry, floor.slab],
    );
    const hubGeos = useMemo(
        () => geometry.hubs.map(h => buildPrism(h.polygon, -floor.slab, h.height)),
        [geometry, floor.slab],
    );
    const roomGeos = useMemo(() => rooms.map(r => buildPrism(r.polygon, -floor.slab, 0)), [rooms, floor.slab]);
    useEffect(
        () => () => {
            wallGeos.forEach(w => w.geo.dispose());
            hubGeos.forEach(g => g.dispose());
            roomGeos.forEach(g => g.dispose());
        },
        [wallGeos, hubGeos, roomGeos],
    );

    // One material set per storey, so storeys can fade independently.
    const mats = useMemo(() => {
        const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
            new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
        const m = {
            wall: std(COLORS.wall),
            wallSelected: std(COLORS.wallSelected),
            floor: std(COLORS.floor, { roughness: 0.8 }),
            floorHover: std('#f0d9a8', { emissive: '#3a2a00', emissiveIntensity: 0.25 }),
            frame: std(COLORS.frame, { roughness: 0.5 }),
            glass: new THREE.MeshPhysicalMaterial({ color: COLORS.glass, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35 }),
            leaf: std(COLORS.leaf, { roughness: 0.6 }),
            glassOpen: new THREE.MeshPhysicalMaterial({ color: '#ff8a4c', roughness: 0.2, transparent: true, opacity: 0.6 }),
            glassTilted: new THREE.MeshPhysicalMaterial({ color: '#ffcf4a', roughness: 0.2, transparent: true, opacity: 0.6 }),
            frameOpen: std('#ff8a4c', { roughness: 0.5 }),
            roomColors: new Map<string, THREE.MeshStandardMaterial>(),
        };
        return m;
    }, []);
    const roomMat = (r: DetectedRoom, i: number, heatColor?: string) => {
        if (props.hoverRoom === i) return mats.floorHover;
        const c = heatColor ?? r.meta?.floorColor;
        if (!c) return mats.floor;
        let mat = mats.roomColors.get(c);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
            mats.roomColors.set(c, mat);
        }
        return mat;
    };
    useEffect(
        () => () => {
            Object.values(mats).forEach(m => (m instanceof THREE.Material ? m.dispose() : undefined));
            mats.roomColors.forEach(m => m.dispose());
        },
        [mats],
    );

    useFrame((_, dt) => {
        const g = group.current;
        if (!g) return;
        const c = current.current;
        const k = 1 - Math.exp(-dt * 6);
        c.offset += (offset - c.offset) * k;
        c.opacity += (opacity - c.opacity) * k;
        if (Math.abs(offset - c.offset) < 1e-3) c.offset = offset;
        if (Math.abs(opacity - c.opacity) < 1e-3) c.opacity = opacity;
        g.position.y = elevation + c.offset;
        g.visible = c.opacity > 0.01;
        const all: THREE.Material[] = [
            mats.wall, mats.wallSelected, mats.floor, mats.floorHover, mats.frame, mats.leaf, mats.frameOpen, ...mats.roomColors.values(),
        ];
        for (const m of all) {
            const transparent = c.opacity < 0.999;
            if (m.transparent !== transparent) {
                m.transparent = transparent;
                m.needsUpdate = true;
            }
            m.opacity = c.opacity;
            m.depthWrite = c.opacity > 0.5;
        }
        mats.glass.opacity = 0.35 * c.opacity;
        mats.glassOpen.opacity = 0.6 * c.opacity;
        mats.glassTilted.opacity = 0.6 * c.opacity;

        // fade the placed objects' own materials (only while the opacity changes)
        if (objects.current && (c.applied !== c.opacity || c.opacity < 0.999)) {
            c.applied = c.opacity;
            objects.current.traverse(o => {
                const mesh = o as THREE.Mesh;
                if (!mesh.isMesh) return;
                for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                    if (m.userData.baseOpacity === undefined) {
                        m.userData.baseOpacity = m.opacity;
                        m.userData.baseTransparent = m.transparent;
                    }
                    const transparent = m.userData.baseTransparent || c.opacity < 0.999;
                    if (m.transparent !== transparent) {
                        m.transparent = transparent;
                        m.needsUpdate = true;
                    }
                    m.opacity = m.userData.baseOpacity * c.opacity;
                }
            });
        }
    });

    return (
        <group ref={group} position={[0, elevation + offset, 0]} onClick={props.onFloorClick}>
            {wallGeos.map(w => (
                <mesh
                    key={w.id}
                    geometry={w.geo}
                    material={w.id === props.selectedWallId ? mats.wallSelected : mats.wall}
                    castShadow
                    receiveShadow
                    onClick={props.onWallClick ? e => props.onWallClick!(w.id, e) : undefined}
                />
            ))}
            {hubGeos.map((g, i) => (
                <mesh key={i} geometry={g} material={mats.wall} castShadow receiveShadow />
            ))}
            {rooms.map((r, i) => (
                <RoomFloor
                    key={i}
                    room={r}
                    geometry={roomGeos[i]}
                    material={heat => roomMat(r, i, heat)}
                    heatmap={!!props.heatmap}
                    onClick={props.onRoomClick ? e => props.onRoomClick!(r, e) : undefined}
                    onPointerOver={props.onRoomHover ? e => (e.stopPropagation(), props.onRoomHover!(i)) : undefined}
                    onPointerOut={props.onRoomHover ? () => props.onRoomHover!(null) : undefined}
                />
            ))}
            {Object.values(geometry.frames).flatMap(fr =>
                fr.wall.openings.map(o => <OpeningModel key={o.id} frame={fr} opening={o} mats={mats} />),
            )}
            <group ref={objects}>{props.children}</group>
            {showLabels &&
                rooms
                    .filter(r => r.meta)
                    .map((r, i) => (
                        <Html key={i} position={[r.centroid[0], 0.05, r.centroid[1]]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                            <RoomLabel room={r} />
                        </Html>
                    ))}
        </group>
    );
}

function RoomFloor(props: {
    room: DetectedRoom;
    geometry: THREE.BufferGeometry;
    material: (heatColor?: string) => THREE.Material;
    heatmap: boolean;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut?: () => void;
}) {
    const temp = useStateValue(props.room.meta?.temperatureId);
    const heat = props.heatmap && typeof temp === 'number' ? temperatureColor(temp) : undefined;
    return (
        <mesh
            geometry={props.geometry}
            material={props.material(heat)}
            receiveShadow
            onClick={props.onClick}
            onPointerOver={props.onPointerOver}
            onPointerOut={props.onPointerOut}
        />
    );
}

function RoomLabel({ room }: { room: DetectedRoom }) {
    const temp = useStateValue(room.meta?.temperatureId);
    const hum = useStateValue(room.meta?.humidityId);
    const parts = [
        temp !== undefined && temp !== null ? formatValue(temp, 1, '°C') : null,
        hum !== undefined && hum !== null ? formatValue(hum, 0, '%') : null,
    ].filter(Boolean);
    return (
        <div className="room-label-3d">
            {room.meta!.name}
            {parts.length > 0 && <span className="room-values"> · {parts.join(' · ')}</span>}
        </div>
    );
}

interface OpeningMats {
    frame: THREE.Material;
    frameOpen: THREE.Material;
    glass: THREE.Material;
    glassOpen: THREE.Material;
    glassTilted: THREE.Material;
    leaf: THREE.Material;
}

function OpeningModel({ frame, opening, mats }: { frame: WallFrame; opening: Opening; mats: OpeningMats }) {
    const o = clampOpening(opening, frame);
    const [x, z] = pointOnWall(frame, o.offset);
    const yaw = yawFor(frame.dir);
    const p = 0.06; // frame profile
    const depth = Math.min(0.08, frame.wall.thickness);
    const w = o.width;
    const h = o.height;
    const bars: [number, number, number, number][] = [
        // [cx, cy, sx, sy] in opening-local coordinates (origin at bottom centre)
        [-w / 2 + p / 2, h / 2, p, h],
        [w / 2 - p / 2, h / 2, p, h],
        [0, h - p / 2, w, p],
    ];
    if (o.type === 'window') bars.push([0, p / 2, w, p]);
    const state = useStateValue(opening.stateId);
    const level = opening.stateId ? contactLevel(state, opening.invert) : 0;
    const frameMat = level > 0 ? mats.frameOpen : mats.frame;
    const sw = w - 2 * p; // sash / leaf width
    return (
        <group position={[x, o.sill, z]} rotation={[0, yaw, 0]}>
            {bars.map(([cx, cy, sx, sy], i) => (
                <mesh key={i} position={[cx, cy, 0]} material={frameMat} castShadow>
                    <boxGeometry args={[sx, sy, depth]} />
                </mesh>
            ))}
            {o.type === 'window' ? (
                level >= 1 ? (
                    // open: sash turned inwards on its left hinge
                    <group position={[-sw / 2, 0, 0]} rotation={[0, -THREE.MathUtils.degToRad(70), 0]}>
                        <mesh position={[sw / 2, h / 2, 0]} material={mats.glassOpen}>
                            <boxGeometry args={[sw, h - 2 * p, 0.02]} />
                        </mesh>
                    </group>
                ) : level > 0 ? (
                    // tilted: sash leaning in at the top
                    <group position={[0, p, 0]} rotation={[THREE.MathUtils.degToRad(12), 0, 0]}>
                        <mesh position={[0, (h - 2 * p) / 2, 0]} material={mats.glassTilted}>
                            <boxGeometry args={[sw, h - 2 * p, 0.02]} />
                        </mesh>
                    </group>
                ) : (
                    <mesh position={[0, h / 2, 0]} material={mats.glass}>
                        <boxGeometry args={[sw, h - 2 * p, 0.01]} />
                    </mesh>
                )
            ) : (
                // door leaf hinged at the start side, swinging to the wall's left side
                <group position={[-sw / 2, 0, 0]} rotation={[0, -THREE.MathUtils.degToRad(80 * level), 0]}>
                    <mesh position={[sw / 2, (h - p) / 2, 0]} material={mats.leaf} castShadow>
                        <boxGeometry args={[sw, h - p, 0.04]} />
                    </mesh>
                </group>
            )}
        </group>
    );
}
