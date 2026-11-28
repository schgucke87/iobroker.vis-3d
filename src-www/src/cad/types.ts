/**
 * A small CAD document for building furniture from simple shapes
 * (Tinkercad style): every shape is a solid or a hole; grouping fuses the
 * solids and cuts the holes out. Groups are flat to work with (no outline
 * tree) but remember their parts, so they can be ungrouped again.
 *
 * Units are metres; the UI shows centimetres.
 */
export type CadPrimitive = 'box' | 'cylinder' | 'sphere' | 'cone' | 'wedge' | 'halfCylinder';
export type CadKind = CadPrimitive | 'group';

export interface CadShape {
    id: string;
    kind: CadKind;
    name?: string;
    /** Holes are cut out of the solids they are grouped with. */
    hole: boolean;
    color: string;
    /** Centre of the shape's bounding box. */
    position: [number, number, number];
    /** Degrees, XYZ order. */
    rotation: [number, number, number];
    /** Bounding box size before rotation [width, height, depth]. */
    size: [number, number, number];
    /** Groups: the parts, relative to the group's centre at the time of grouping. */
    children?: CadShape[];
    /** Groups: the size the parts were grouped at (size / baseSize = scale of the group). */
    baseSize?: [number, number, number];
}

export interface CadDoc {
    version: 1;
    shapes: CadShape[];
}
