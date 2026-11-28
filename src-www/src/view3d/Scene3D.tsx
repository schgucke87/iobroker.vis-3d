import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { findAsset, floorElevations, normalizeAngle, useEditor } from '../model/store';
import type { DetectedRoom, Floor, Project, Vec2 } from '../model/types';
import { FloorModel } from './FloorModel';
import { Roof3D } from './Roof3D';
import { roofFrame, roofTop } from '../geometry/roof';
import { Environment } from './Environment';
import { useSnowCover } from './useSnowCover';
import { projectStyle } from '../model/style';
import { ObjectInstance } from './Objects3D';
import { computePlacement } from '../geometry/placement';

const EXPLODE_GAP = 3.5;
/** In the explosion view a roof also lifts off its storey by this much. */
const ROOF_GAP = 2.2;
const POLAR_BUILDING = THREE.MathUtils.degToRad(62);
const POLAR_FLOOR = THREE.MathUtils.degToRad(38);
const POLAR_ROOM = THREE.MathUtils.degToRad(42);

function floorBox(floor: Floor, y0: number, y1: number, pad = 0.5): THREE.Box3 | null {
    const nodes = Object.values(floor.nodes);
    if (!nodes.length) return null;
    const xs = nodes.map(n => n.x);
    const zs = nodes.map(n => n.y);
    return new THREE.Box3(
        new THREE.Vector3(Math.min(...xs) - pad, y0, Math.min(...zs) - pad),
        new THREE.Vector3(Math.max(...xs) + pad, y1, Math.max(...zs) + pad),
    );
}

/** Height of a storey including its roof (gables reach up to the ridge). */
function storeyHeight(f: Floor): number {
    const rf = f.roof ? roofFrame(f) : null;
    return rf ? Math.max(f.height, roofTop(rf)) : f.height;
}

function buildingBox(project: Project, offsets: number[], elevations: number[], roofLift: number[]): THREE.Box3 {
    const box = new THREE.Box3();
    project.floors.forEach((f, i) => {
        const b = floorBox(f, elevations[i] + offsets[i] - f.slab, elevations[i] + offsets[i] + storeyHeight(f) + roofLift[i]);
        if (b) box.union(b);
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    return box;
}

/**
 * Smoothly moves the camera so the box fills the view, looking at it from the
 * given polar angle while keeping the current azimuth. (camera-controls'
 * fitToBox would snap the view to an axis-aligned angle.)
 */
function flyTo(c: CameraControls, box: THREE.Box3, polar: number, margin: number) {
    const cam = c.camera as THREE.PerspectiveCamera;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const distance = (radius * margin) / Math.sin(Math.min(vHalf, hHalf));
    const offset = new THREE.Vector3().setFromSphericalCoords(distance, polar, c.azimuthAngle);
    const pos = center.clone().add(offset);
    void c.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
}

export function Scene3D({ editable }: { editable: boolean }) {
    const project = useEditor(s => s.project);
    const focusFloorId = useEditor(s => s.focusFloorId);
    const explode = useEditor(s => s.explode);
    const selection = useEditor(s => s.selection);
    const setFocusFloor = useEditor(s => s.setFocusFloor);
    const setActiveFloor = useEditor(s => s.setActiveFloor);
    const select = useEditor(s => s.select);
    const tool = useEditor(s => s.tool);
    const placeAssetId = useEditor(s => s.placeAssetId);
    const placeRotation = useEditor(s => s.placeRotation);
    const gizmo = useEditor(s => s.gizmo);
    const settings = useEditor(s => s.settings);
    const heatmap = useEditor(s => s.heatmap);
    const style = useMemo(() => projectStyle(project), [project]);
    const snow = useSnowCover(style).amount;
    const [selectedGroup, setSelectedGroup] = useState<THREE.Group | null>(null);
    const [placePoint, setPlacePoint] = useState<Vec2 | null>(null);

    const controls = useRef<CameraControls>(null);
    const [focusRoom, setFocusRoom] = useState<DetectedRoom | null>(null);
    const [hover, setHover] = useState<{ floor: string; room: number } | null>(null);

    const elevations = useMemo(() => floorElevations(project), [project]);
    const focusIndex = project.floors.findIndex(f => f.id === focusFloorId);
    // explosion: storeys move apart in their stacking order; the garden stays on the ground
    const storeyRank = (() => {
        let r = 0;
        return project.floors.map(f => (f.kind === 'outdoor' ? 0 : r++));
    })();
    // a roof lifts off its storey too, and the storeys above make room for it
    const exploding = explode && focusIndex < 0;
    const roofLift = project.floors.map(f => (exploding && f.roof && f.kind !== 'outdoor' ? ROOF_GAP : 0));
    const offsets = (() => {
        let extra = 0;
        return project.floors.map((f, i) => {
            if (!exploding || f.kind === 'outdoor') return 0;
            const o = storeyRank[i] * EXPLODE_GAP + extra;
            extra += roofLift[i];
            return o;
        });
    })();
    const focusElevation = focusIndex >= 0 ? elevations[focusIndex] : Infinity;
    const focusKind = focusIndex >= 0 ? (project.floors[focusIndex].kind ?? 'normal') : null;

    useEffect(() => setFocusRoom(null), [focusFloorId]);

    // the house keeps rain and snow out (not in the explosion view, where it is taken apart)
    const shelter = useMemo(() => {
        if (explode) return undefined;
        const box = new THREE.Box3();
        project.floors.forEach((f, i) => {
            if (f.kind === 'outdoor') return;
            const b = floorBox(f, elevations[i], elevations[i] + storeyHeight(f), 0.3);
            if (b) box.union(b);
        });
        return box.isEmpty() ? undefined : { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y };
    }, [project, elevations, explode]);

    // Camera flights. Only re-run when the navigation target changes, not on every edit.
    // (the floor ids change when another project is loaded, which also re-fits the camera)
    const navKey = `${focusFloorId ?? 'building'}|${explode}|${focusRoom ? focusRoom.centroid.join(',') : ''}|${project.floors.map(f => f.id).join()}`;
    const projectRef = useRef(project);
    projectRef.current = project;
    useEffect(() => {
        const c = controls.current;
        if (!c) return;
        const p = projectRef.current;
        const idx = p.floors.findIndex(f => f.id === focusFloorId);
        let box: THREE.Box3 | null;
        let polar: number;
        if (idx < 0) {
            box = buildingBox(p, offsets, elevations, roofLift);
            polar = POLAR_BUILDING;
        } else if (focusRoom) {
            const e = elevations[idx];
            const xs = focusRoom.polygon.map(q => q[0]);
            const zs = focusRoom.polygon.map(q => q[1]);
            box = new THREE.Box3(
                new THREE.Vector3(Math.min(...xs), e, Math.min(...zs)),
                new THREE.Vector3(Math.max(...xs), e + p.floors[idx].height, Math.max(...zs)),
            );
            polar = POLAR_ROOM;
        } else {
            const f = p.floors[idx];
            box = floorBox(f, elevations[idx], elevations[idx] + storeyHeight(f));
            polar = POLAR_FLOOR;
        }
        if (!box) return;
        flyTo(c, box, polar, idx < 0 ? 1.15 : 1.0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navKey]);

    const selectedWallId = selection?.kind === 'wall' ? selection.id : undefined;
    const selectedObjectId = selection?.kind === 'object' ? selection.id : undefined;
    const placing = editable && tool === 'place' && !!placeAssetId && focusIndex >= 0;
    const placeAsset = placeAssetId ? findAsset(project, placeAssetId) : undefined;
    const focusFloor = focusIndex >= 0 ? project.floors[focusIndex] : undefined;
    const placement =
        placing && placeAsset && placePoint && focusFloor
            ? computePlacement({
                  floor: focusFloor,
                  asset: placeAsset,
                  point: placePoint,
                  rotation: placeRotation,
                  scale: [1, 1, 1],
                  grid: settings.grid,
                  snap: settings.snap,
              })
            : null;

    /** Writes the gizmo result back to the store. */
    const commitTransform = () => {
        const g = selectedGroup;
        if (!g || !selectedObjectId) return;
        const grid = settings.snap ? settings.grid : 0;
        const r = (v: number) => (grid ? Math.round(v / grid) * grid : v);
        useEditor.getState().updateObject(selectedObjectId, {
            x: r(g.position.x),
            y: r(g.position.z),
            elevation: Math.max(0, r(g.position.y)),
            rotation: normalizeAngle(g.rotation.y),
        });
    };

    return (
        <Canvas shadows camera={{ position: [18, 16, 22], fov: 40, near: 0.1, far: 500 }} onPointerMissed={() => setHover(null)}>
            {/* the ground hides the basement: fade it out while a basement is selected */}
            <Environment style={style} groundOpacity={focusKind === 'basement' ? 0.12 : 1} shelter={shelter} snowCover={snow} />

            {project.floors.map((f, i) => {
                // everything above the selected floor is hidden (by height, so the garden and the
                // ground floor show together)
                const hidden = focusIndex >= 0 && elevations[i] > focusElevation + 0.01;
                const isFocus = i === focusIndex;
                // the roof opens when its storey is selected, and disappears with the storey
                const roofState = isFocus ? 'open' : hidden ? 'hidden' : 'closed';
                return (
                    <group key={f.id}>
                    {f.roof && (
                        <Roof3D
                            floor={f}
                            elevation={elevations[i]}
                            offset={offsets[i] + roofLift[i]}
                            state={roofState}
                            spread={roofLift[i] > 0}
                            snow={snow}
                            wallColor={style.wallExterior}
                            onClick={
                                roofState === 'closed'
                                    ? e => {
                                          e.stopPropagation();
                                          if (editable) setActiveFloor(f.id);
                                          else setFocusFloor(f.id);
                                      }
                                    : undefined
                            }
                        />
                    )}
                    <FloorModel
                        key={f.id}
                        floor={f}
                        elevation={elevations[i]}
                        offset={offsets[i]}
                        opacity={hidden ? 0 : 1}
                        showLabels={isFocus}
                        style={style}
                        heatmap={heatmap}
                        snow={snow}
                        selectedWallId={isFocus || focusIndex < 0 ? selectedWallId : undefined}
                        hoverRoom={hover?.floor === f.id && !placing ? hover.room : null}
                        onFloorClick={
                            focusIndex < 0 || (!isFocus && !hidden)
                                ? e => {
                                      e.stopPropagation();
                                      if (editable) setActiveFloor(f.id);
                                      else setFocusFloor(f.id);
                                  }
                                : undefined
                        }
                        onRoomClick={
                            isFocus && !placing
                                ? (room, e) => {
                                      e.stopPropagation();
                                      setFocusRoom(room);
                                      if (editable) select({ kind: 'room', anchor: room.meta?.anchor ?? room.centroid });
                                  }
                                : undefined
                        }
                        onRoomHover={isFocus && !placing ? room => setHover(room === null ? null : { floor: f.id, room }) : undefined}
                        onWallClick={
                            isFocus && editable && !placing
                                ? (id, e) => {
                                      e.stopPropagation();
                                      select({ kind: 'wall', id });
                                  }
                                : undefined
                        }
                    >
                        {Object.values(f.objects).map(o => {
                            const asset = findAsset(project, o.assetId);
                            if (!asset) return null;
                            const selected = isFocus && o.id === selectedObjectId;
                            return (
                                <ObjectInstance
                                    key={o.id}
                                    obj={o}
                                    asset={asset}
                                    selected={selected}
                                    interactive={!editable}
                                    groupRef={selected ? setSelectedGroup : undefined}
                                    onClick={
                                        isFocus && editable && !placing
                                            ? e => {
                                                  e.stopPropagation();
                                                  select({ kind: 'object', id: o.id });
                                              }
                                            : undefined
                                    }
                                />
                            );
                        })}
                        {isFocus && placing && (
                            <mesh
                                rotation={[-Math.PI / 2, 0, 0]}
                                position={[0, 0.002, 0]}
                                onPointerMove={e => setPlacePoint([e.point.x, e.point.z])}
                                onPointerOut={() => setPlacePoint(null)}
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!placement || !placeAsset) return;
                                    const { againstWall: _w, ...pos } = placement;
                                    void _w;
                                    useEditor.getState().addObject({ assetId: placeAsset.id, name: placeAsset.name, scale: [1, 1, 1], ...pos });
                                }}
                            >
                                <planeGeometry args={[400, 400]} />
                                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                            </mesh>
                        )}
                        {isFocus && placement && placeAsset && (
                            <ObjectInstance obj={{ ...placement, scale: [1, 1, 1] }} asset={placeAsset} ghost />
                        )}
                    </FloorModel>
                    </group>
                );
            })}

            {editable && selectedObjectId && selectedGroup && tool === 'select' && (
                <TransformControls
                    object={selectedGroup}
                    mode={gizmo}
                    size={0.8}
                    showX={gizmo === 'translate'}
                    showZ={gizmo === 'translate'}
                    showY
                    translationSnap={settings.snap ? settings.grid : null}
                    rotationSnap={settings.snap ? Math.PI / 12 : null}
                    onMouseUp={commitTransform}
                />
            )}

            <DebugHandle />
            <CameraControls ref={controls} makeDefault minDistance={2} maxDistance={150} maxPolarAngle={Math.PI / 2 - 0.05} />
        </Canvas>
    );
}

/** With ?debug, exposes the camera so tests can project scene positions to the screen. */
function DebugHandle() {
    const camera = useThree(s => s.camera);
    const gl = useThree(s => s.gl);
    const scene = useThree(s => s.scene);
    useEffect(() => {
        if (!new URLSearchParams(location.search).has('debug')) return;
        const w = window as unknown as { __vis3d?: Record<string, unknown> };
        w.__vis3d = { ...w.__vis3d, camera, scene, canvas: gl.domElement };
    }, [camera, gl, scene]);
    return null;
}
