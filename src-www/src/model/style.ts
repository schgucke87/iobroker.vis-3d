import type { FloorMaterial, GroundMaterial, Project, ProjectStyle, SkyMode } from './types';

export const DEFAULT_STYLE: ProjectStyle = {
    wallInterior: '#efede8',
    wallExterior: '#e4e0d8',
    floorColor: '#d8c6a5',
    floorMaterial: 'plain',
    groundColor: '#d6dccf',
    groundMaterial: 'plain',
    sky: 'color',
    skyColor: '#e9edf2',
};

export const projectStyle = (p: Project): ProjectStyle => ({ ...DEFAULT_STYLE, ...p.style });

export const FLOOR_MATERIALS: Record<FloorMaterial, string> = {
    plain: 'Einfarbig',
    wood: 'Parkett / Dielen',
    tiles: 'Fliesen',
    stone: 'Naturstein',
    carpet: 'Teppich',
};

export const GROUND_MATERIALS: Record<GroundMaterial, string> = {
    plain: 'Einfarbig',
    grass: 'Rasen',
    gravel: 'Kies',
    paving: 'Pflaster',
    snow: 'Schnee',
};

export const SKY_MODES: Record<SkyMode, string> = {
    color: 'Einfarbig',
    day: 'Tag',
    sunset: 'Abendrot',
    night: 'Nacht',
};

/** Colour suggestions shown as swatches next to the colour pickers. */
export const SWATCHES = {
    wall: ['#f5f3ee', '#efede8', '#e4e0d8', '#d9d4c7', '#c9d3d9', '#d6e2d3', '#f1e3c8', '#e8c9b5', '#9aa3ad', '#5f6670'],
    floor: ['#d8c6a5', '#c49a6c', '#8b5e3c', '#5c3d2e', '#e6e1d8', '#b8b4ad', '#7d8a99', '#6b4f3a', '#efe7da', '#3f4247'],
    ground: ['#d6dccf', '#7aa65a', '#5f8a43', '#c9bfa8', '#a39e94', '#8c8279', '#f4f6f8'],
    sky: ['#e9edf2', '#cfe3f5', '#bcd4ec', '#f3e6d8', '#2b3242', '#ffffff'],
};

/** Ground colour that fits a ground material when it is picked. */
export const GROUND_DEFAULT_COLOR: Record<GroundMaterial, string> = {
    plain: '#d6dccf',
    grass: '#6f9e4f',
    gravel: '#c9bfa8',
    paving: '#a39e94',
    snow: '#f4f6f8',
};

export const FLOOR_DEFAULT_COLOR: Record<FloorMaterial, string> = {
    plain: '#d8c6a5',
    wood: '#c49a6c',
    tiles: '#e6e1d8',
    stone: '#b8b4ad',
    carpet: '#7d8a99',
};
