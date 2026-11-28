import type { WeatherMode } from './weather';
/**
 * Project data model.
 *
 * Coordinates: the floor plan uses metres in (x, y) with y pointing "down"
 * on screen (SVG convention). In 3D, plan x maps to world X, plan y maps to
 * world Z, and world Y is up.
 *
 * Walls are stored parametrically as a graph (nodes + edges). All geometry
 * (mitred wall footprints, room polygons, meshes) is derived from it.
 */

import type { CadDoc } from '../cad/types';

export type Vec2 = [number, number];

export interface WallNode {
    id: string;
    x: number;
    y: number;
}

export type OpeningType = 'door' | 'window';

export interface Opening {
    id: string;
    type: OpeningType;
    /** Distance of the opening's centre from the wall's start node `a`, in metres. */
    offset: number;
    width: number;
    height: number;
    /** Height of the bottom edge above the floor (0 for doors). */
    sill: number;
    /** 2 = double window (two sashes) or double door (two leaves). */
    leaves?: 1 | 2;
    /** The hinge is at the side of the wall's end node `b` (default: start node `a`). */
    hingeEnd?: boolean;
    /** Opens towards the wall's right side (seen from a to b); default: left side. */
    swingRight?: boolean;
    /** Contact datapoint: truthy = open (numeric 1 = tilted, 2 = open for rotary handles). */
    stateId?: string;
    /** Contact reports `true` when closed. */
    invert?: boolean;
    /** Roller shutter position datapoint (ioBroker convention: 0 = closed, 100 = open). */
    blindId?: string;
    /** Shutter reports 100 = closed. */
    blindInvert?: boolean;
    /** Value for "fully open" (default 100). */
    blindMax?: number;
}

export interface Wall {
    id: string;
    a: string;
    b: string;
    thickness: number;
    height: number;
    openings: Opening[];
    /**
     * An invisible boundary (garden areas): bounds rooms/areas like a wall, but
     * has no body in 3D.
     */
    boundary?: boolean;
    /** Colour of the side facing the left normal of a→b (default: interior/exterior colour of the project). */
    colorLeft?: string;
    colorRight?: string;
}

export interface RoomMeta {
    id: string;
    name: string;
    /**
     * A point inside the room. Detected room polygons are matched to their
     * metadata by containing this point, so names survive edits of the walls.
     * It is also where the room label is drawn.
     */
    anchor: Vec2;
    /** ioBroker room enum, e.g. "enum.rooms.living_room". */
    enumId?: string;
    floorColor?: string;
    floorMaterial?: FloorMaterial | GroundMaterial;
    /** Temperature datapoint: shown on the room label and in the heat map. */
    temperatureId?: string;
    humidityId?: string;
}

export interface BackgroundImage {
    src: string;
    /** Plan position of the image's top-left corner, in metres. */
    x: number;
    y: number;
    /** Metres per image pixel. */
    scale: number;
    pxWidth: number;
    pxHeight: number;
    opacity: number;
    visible: boolean;
    /** The scale was set with "Maßstab kalibrieren" (wall detection needs it). */
    calibrated?: boolean;
}

/** Where an object is mounted; decides how it snaps when placed. */
export type Mount = 'floor' | 'wall' | 'ceiling';

export type AssetCategory = 'furniture' | 'lighting' | 'appliance' | 'plant' | 'garden' | 'decor' | 'other';

/**
 * A reusable 3D model. Built-in assets (id "builtin:…") are generated in
 * code; imported ones are stored as normalised GLB (metres, Y up, pivot at
 * the bottom centre of the bounding box, front facing +Z).
 */
export interface AssetMeta {
    id: string;
    name: string;
    category: AssetCategory;
    mount: Mount;
    /** Bounding box size [width (x), height (y), depth (z)] in metres. */
    size: [number, number, number];
    thumbnail?: string;
    /** Size of the stored GLB in bytes. */
    bytes?: number;
    /** Built with the furniture editor: its document, so it can be edited again. */
    cad?: CadDoc;
}

/**
 * Behaviours connect an object to ioBroker datapoints. A value is
 * normalised to 0…1 (booleans → 0/1, numbers → (v − min) / (max − min)).
 */
export type Behavior =
    | {
          id: string;
          type: 'light';
          stateId: string;
          color: string;
          /** Light intensity (candela) at full brightness. */
          intensity: number;
          range: number;
          /** Value meaning "fully on" for dimmers (100 for 0…100 %). Booleans are on/off. */
          max: number;
          /** Optional on/off datapoint: when it is off, the light is off whatever the level says. */
          onId?: string;
          /** Light colour from datapoints (e.g. Hue): how to read `colorIds`. */
          colorMode?: LightColorMode;
          /**
           * rgb/cie: [colour]; hue: [hue, saturation?, colour temperature?];
           * ct: [colour temperature]; rgbParts: [red, green, blue]
           */
          colorIds?: string[];
          /** Maximum values of the colour datapoints (e.g. 360 for hue, 254 for saturation). */
          colorMax?: number[];
      }
    | { id: string; type: 'color'; stateId: string; min: number; max: number; colorMin: string; colorMax: string }
    | { id: string; type: 'visibility'; stateId: string; invert: boolean }
    | {
          id: string;
          type: 'transform';
          stateId: string;
          mode: 'rotate' | 'move';
          axis: 'x' | 'y' | 'z';
          min: number;
          max: number;
          /** Degrees for rotate, metres for move. */
          from: number;
          to: number;
      }
    | { id: string; type: 'label'; stateId: string; unit: string; decimals: number; prefix: string }
    | { id: string; type: 'action'; stateId: string; mode: 'toggle' | 'set' | 'increment'; value: string };

export type BehaviorType = Behavior['type'];

export type LightColorMode = 'rgb' | 'hue' | 'ct' | 'cie' | 'rgbParts';

/** A placed instance of an asset on a floor. */
export interface SceneObject {
    id: string;
    assetId: string;
    name?: string;
    /** Plan position of the pivot (x, y) in metres. */
    x: number;
    y: number;
    /** Height of the pivot above the floor surface. */
    elevation: number;
    /** Rotation about the vertical axis in radians (counter-clockwise in plan view). */
    rotation: number;
    scale: [number, number, number];
    behaviors?: Behavior[];
    /** Colour per model material (index in the order the materials appear in the model). */
    materialColors?: Record<string, string>;
}

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip' | 'pyramid';

/**
 * A roof on top of a storey's walls. Its footprint is the bounding rectangle
 * of the storey's outer walls; exterior walls rise up to the roof (gables
 * close by themselves), interior walls are cut off by the slopes.
 */
export interface Roof {
    type: RoofType;
    /** Pitch in degrees. */
    pitch: number;
    /** Overhang beyond the outer walls, in metres. */
    overhang: number;
    /** Direction of the ridge: along the longer side (auto) or along plan x / y. */
    ridge: 'auto' | 'x' | 'y';
    /** Shed roof: the high side is the other one. */
    flip?: boolean;
    color: string;
    /** Roof windows and dormers. */
    features?: RoofFeature[];
}

/**
 * A roof window or dormer, placed by a plan position on the roof: it sits on
 * the roof plane found there and faces down the slope.
 */
export interface RoofFeature {
    id: string;
    type: 'window' | 'dormer';
    /** Plan position: the window's centre, or the middle of the dormer's front wall. */
    x: number;
    y: number;
    /** Width along the eaves, metres. */
    width: number;
    /** Roof window: length up the slope, metres. */
    length?: number;
    /** Dormer: height of the front wall above the roof surface, metres. */
    frontHeight?: number;
    /** Dormer roof: shed (Schleppgaube) or gable (Satteldachgaube). */
    dormerRoof?: 'shed' | 'gable';
    /** Window contact datapoint (open/tilted shown like windows). */
    stateId?: string;
    invert?: boolean;
}

/**
 * normal: a storey of the building; basement: below the ground floor, under
 * the ground; outdoor: the garden at ground level, whose "rooms" are areas
 * such as terraces (bounded by invisible boundaries).
 */
export type FloorKind = 'normal' | 'basement' | 'outdoor';

export interface Floor {
    id: string;
    kind?: FloorKind;
    name: string;
    /** Clear storey height (floor top to ceiling); default height for new walls. */
    height: number;
    /** Thickness of the floor slab below this storey. */
    slab: number;
    nodes: Record<string, WallNode>;
    walls: Record<string, Wall>;
    rooms: Record<string, RoomMeta>;
    objects: Record<string, SceneObject>;
    background?: BackgroundImage;
    roof?: Roof;
}

export type FloorMaterial = 'plain' | 'wood' | 'tiles' | 'carpet' | 'stone';
export type GroundMaterial = 'plain' | 'grass' | 'gravel' | 'paving' | 'snow';
export type SkyMode = 'auto' | 'color' | 'day' | 'sunset' | 'night';

/** Look of the whole project; every field has a default (see projectStyle()). */
export interface ProjectStyle {
    wallInterior: string;
    wallExterior: string;
    floorColor: string;
    floorMaterial: FloorMaterial;
    groundColor: string;
    groundMaterial: GroundMaterial;
    sky: SkyMode;
    skyColor: string;
    /** Where north points in the floor plan, degrees clockwise from "up" (for the sun position). */
    northAngle: number;
    /** Weather effects: off, live from the daswetter adapter, or a fixed preset. */
    weather: WeatherMode;
    /** daswetter hour channel for live weather, e.g. daswetter.0.location_1.ForecastHourly.Current */
    weatherChannel?: string;
    /** Lying snow from Open-Meteo's modelled snow depth (sends the ioBroker location there). */
    snowOpenMeteo?: boolean;
    /** Datapoint for lying snow: boolean (snow yes/no) or depth in cm; takes priority over Open-Meteo. */
    snowStateId?: string;
    /** How opaque lying snow is, 0.2…1 (1: even a thin layer covers the ground completely). */
    snowDensity: number;
}

export interface Project {
    version: 1;
    name: string;
    /** Ordered bottom to top. */
    floors: Floor[];
    /** Imported assets used by this project (built-in assets are not listed). */
    assets: Record<string, AssetMeta>;
    style?: Partial<ProjectStyle>;
}

/** A wall-graph room detected from closed wall loops. */
export interface DetectedRoom {
    /** Polygon in plan coordinates, counter-clockwise in math orientation. */
    polygon: Vec2[];
    area: number;
    centroid: Vec2;
    /** Metadata matched via its anchor, if any. */
    meta?: RoomMeta;
}
