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
}

export interface Wall {
    id: string;
    a: string;
    b: string;
    thickness: number;
    height: number;
    openings: Opening[];
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
}

/** Where an object is mounted; decides how it snaps when placed. */
export type Mount = 'floor' | 'wall' | 'ceiling';

export type AssetCategory = 'furniture' | 'lighting' | 'appliance' | 'decor' | 'other';

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
}

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
}

export interface Floor {
    id: string;
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
}

export interface Project {
    version: 1;
    name: string;
    /** Ordered bottom to top. */
    floors: Floor[];
    /** Imported assets used by this project (built-in assets are not listed). */
    assets: Record<string, AssetMeta>;
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
