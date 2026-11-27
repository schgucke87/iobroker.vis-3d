import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl'];
export const ACCEPT = '.glb,.gltf,.obj,.mtl,.fbx,.stl,.bin,.png,.jpg,.jpeg,.webp,.tga,.bmp';

export type Unit = 'auto' | 'm' | 'cm' | 'mm' | 'in';
export const UNIT_FACTOR: Record<Exclude<Unit, 'auto'>, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 };

export interface RawModel {
    object: THREE.Object3D;
    name: string;
    format: string;
    /** Unit guessed from the raw size. */
    guessedUnit: Exclude<Unit, 'auto'>;
    triangles: number;
}

const ext = (name: string) => name.split('.').pop()!.toLowerCase();
const base = (path: string) => decodeURIComponent(path.split(/[\\/]/).pop() ?? path).toLowerCase();

/**
 * Reads a model from the selected files. The first file with a model
 * extension is the model; the others (textures, .bin, .mtl) are resolved by
 * file name when the model references them.
 */
export async function readModelFiles(files: File[]): Promise<RawModel> {
    const main = files.find(f => MODEL_EXTENSIONS.includes(ext(f.name)));
    if (!main) throw new Error('Keine Modelldatei gefunden (GLB, glTF, OBJ, FBX oder STL).');

    const urls = new Map<string, string>();
    for (const f of files) urls.set(base(f.name), URL.createObjectURL(f));
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
        return urls.get(base(url)) ?? url;
    });
    const missing: string[] = [];
    manager.onError = url => missing.push(base(url));

    try {
        const format = ext(main.name);
        let object: THREE.Object3D;
        switch (format) {
            case 'glb':
            case 'gltf': {
                const loader = new GLTFLoader(manager);
                loader.setMeshoptDecoder(MeshoptDecoder);
                const gltf = await loader.loadAsync(urls.get(base(main.name))!);
                object = gltf.scene;
                break;
            }
            case 'obj': {
                const loader = new OBJLoader(manager);
                const mtl = files.find(f => ext(f.name) === 'mtl');
                if (mtl) {
                    const materials = new MTLLoader(manager).parse(await mtl.text(), '');
                    materials.preload();
                    loader.setMaterials(materials);
                }
                object = loader.parse(await main.text());
                if (!mtl) applyDefaultMaterial(object);
                break;
            }
            case 'fbx':
                object = new FBXLoader(manager).parse(await main.arrayBuffer(), '');
                break;
            case 'stl': {
                const geo = new STLLoader().parse(await main.arrayBuffer());
                const material = new THREE.MeshStandardMaterial({
                    color: '#c9c9c9',
                    roughness: 0.7,
                    vertexColors: !!(geo as THREE.BufferGeometry & { hasColors?: boolean }).hasColors,
                });
                object = new THREE.Mesh(geo, material);
                break;
            }
            default:
                throw new Error(`Format .${format} wird nicht unterstützt.`);
        }
        // give the loaders' texture requests a moment to finish before the blob URLs are revoked
        await waitForManager(manager);
        if (missing.length) console.warn('Fehlende Dateien:', missing);

        object.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
        if (!Number.isFinite(size.x) || size.length() === 0) throw new Error('Das Modell enthält keine Geometrie.');

        let triangles = 0;
        object.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
                const g = m.geometry;
                triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
            }
        });

        return {
            object,
            name: main.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
            format,
            guessedUnit: guessUnit(Math.max(size.x, size.y, size.z), format),
            triangles: Math.round(triangles),
        };
    } finally {
        setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 10000);
    }
}

function waitForManager(manager: THREE.LoadingManager): Promise<void> {
    return new Promise(resolve => {
        let pending = false;
        const prevStart = manager.onStart;
        manager.onStart = (...a) => {
            pending = true;
            prevStart?.(...a);
        };
        manager.onLoad = () => resolve();
        // if nothing is pending shortly after parsing, we are done
        setTimeout(() => !pending && resolve(), 50);
        setTimeout(resolve, 8000);
    });
}

function applyDefaultMaterial(obj: THREE.Object3D) {
    const material = new THREE.MeshStandardMaterial({ color: '#c9c9c9', roughness: 0.7 });
    obj.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = material;
    });
}

/**
 * Typical household objects are 0.2–3 m: pick the unit that puts the model in
 * that range. STL files carry no unit but are millimetres by convention.
 */
export function guessUnit(maxDim: number, format = ''): Exclude<Unit, 'auto'> {
    if (format === 'stl') return maxDim <= 4 ? 'm' : 'mm';
    if (maxDim <= 12) return 'm';
    if (maxDim <= 600) return 'cm';
    return 'mm';
}

export interface PrepareOptions {
    unit: Exclude<Unit, 'auto'>;
    /** The model was authored with Z up (common for STL, many CAD tools). */
    zUp: boolean;
    /** Additional rotation about Y in degrees, to make the model's front face +Z. */
    rotateY: number;
    /** Extra uniform scale on top of the unit conversion. */
    scale: number;
}

/**
 * Wraps the raw model so that it follows the asset convention: metres, Y up,
 * pivot at the bottom centre, front facing +Z. Returns the wrapper and its size.
 */
export function prepareModel(raw: THREE.Object3D, opt: PrepareOptions): { object: THREE.Group; size: THREE.Vector3 } {
    const outer = new THREE.Group();
    const mid = new THREE.Group();
    outer.add(mid);
    mid.add(raw);
    mid.rotation.set(opt.zUp ? -Math.PI / 2 : 0, THREE.MathUtils.degToRad(opt.rotateY), 0, 'YXZ');
    mid.scale.setScalar(UNIT_FACTOR[opt.unit] * opt.scale);
    outer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(outer);
    const center = box.getCenter(new THREE.Vector3());
    mid.position.set(-center.x, -box.min.y, -center.z);
    outer.updateMatrixWorld(true);
    return { object: outer, size: box.getSize(new THREE.Vector3()) };
}

export async function exportGLB(object: THREE.Object3D): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(object, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    return result as ArrayBuffer;
}

// ---------- thumbnails ----------

let thumbRenderer: THREE.WebGLRenderer | null = null;

export function renderThumbnail(object: THREE.Object3D, size = 160): string {
    if (!thumbRenderer) {
        thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbRenderer.setPixelRatio(1);
        thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const r = thumbRenderer;
    r.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8d8577', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const parent = object.parent;
    scene.add(object);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const dir = new THREE.Vector3(0.9, 0.7, 1.3).normalize();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
    cam.position.copy(sphere.center).addScaledVector(dir, dist);
    cam.lookAt(sphere.center);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(object);
    if (parent) parent.add(object);
    return url;
}
