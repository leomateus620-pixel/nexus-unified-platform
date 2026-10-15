import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SILO_CONFIG } from "./SiloConfig";
import { CUT_PLANE_Z } from "./SiloModel";

export type WorkerId = "A" | "B";
export type FootSide = "left" | "right";
export interface FootGoal {
  /** Sole target in world metres. The domain owns stance, swing and burial. */
  position: readonly [number, number, number];
  yaw: number;
  locked: boolean;
}
export interface WorkerPose {
  /** Foot origin, in silo world metres; y-up. Domain has already applied restraint. */
  position: readonly [number, number, number];
  heading: number;
  walkPhase: number;
  mobility: number;
  depth: number;
  tension: number;
  lean?: number;
  connected?: boolean;
  /** Exact point constrained by the domain, in world metres. */
  dorsal?: readonly [number, number, number];
  surfaceAt?: (x: number, z: number) => number;
  feet?: { left: FootGoal; right: FootGoal };
}
export interface WorkersFrame {
  A: WorkerPose;
  B: WorkerPose;
  watchperson?: WorkerPose;
}

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
type Limb = {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
  upperLength: number;
  lowerLength: number;
  ankleHeight: number;
  footRotation: THREE.Quaternion;
};
type MeshView = {
  mesh: THREE.Mesh;
  near: boolean;
  hideInFirstPerson: boolean;
  geometry: THREE.BufferGeometry;
  headless: THREE.BufferGeometry | undefined;
};

/** Final owner of source resources. Clones never dispose shared geometry or images. */
function disposeSources(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  roots.forEach((root) =>
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          materials.add(material);
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) textures.add(value);
          });
        }
      }
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    }),
  );
  skeletons.forEach((skeleton) => skeleton.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  const closed = new Set<ImageBitmap>();
  textures.forEach((texture) => {
    texture.dispose();
    if (
      typeof ImageBitmap !== "undefined" &&
      texture.image instanceof ImageBitmap &&
      !closed.has(texture.image)
    ) {
      texture.image.close();
      closed.add(texture.image);
    }
  });
}

function abortError() {
  return new DOMException("Carregamento dos técnicos cancelado", "AbortError");
}

function shareCommonTextures(sources: THREE.Object3D[]) {
  // These four images have equal SHA-256 values in both generated manifests.
  // Skins remain distinct. Share only this explicitly validated source contract.
  const names = new Set([
    "shoes02_diffuse",
    "brown_eye",
    "male_worksuit01_normal-normal",
    "male_worksuit01_diffuse",
  ]);
  const canonical = new Map<string, THREE.Texture>();
  const unused = new Set<THREE.Texture>();
  sources.forEach((source) =>
    source.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const properties = material as unknown as Record<string, unknown>;
        Object.entries(properties).forEach(([key, value]) => {
          if (!(value instanceof THREE.Texture) || !names.has(value.name)) return;
          const signature = `${value.name}:${value.colorSpace}:${value.flipY}`;
          const shared = canonical.get(signature);
          if (!shared) canonical.set(signature, value);
          else if (shared !== value) {
            properties[key] = shared;
            unused.add(value);
          }
        });
      }
    }),
  );
  const closed = new Set<ImageBitmap>();
  unused.forEach((texture) => {
    texture.dispose();
    if (
      typeof ImageBitmap !== "undefined" &&
      texture.image instanceof ImageBitmap &&
      !closed.has(texture.image)
    ) {
      texture.image.close();
      closed.add(texture.image);
    }
  });
}
async function loadWorker(
  id: "a" | "b",
  signal?: AbortSignal,
  onAsset?: (id: "a" | "b", bytes: number) => void,
) {
  const response = await fetch(
    `/models/silo-engolfamento/worker-${id}.glb`,
    signal ? { signal } : {},
  );
  if (!response.ok) throw new Error(`Técnico ${id.toUpperCase()}: recurso HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (signal?.aborted) throw abortError();
  // GLTFLoader can catch image decode failures and still resolve an untextured
  // scene. Track this load locally so a damaged texture is recoverable through
  // the same explicit retry flow, instead of silently claiming full readiness.
  let resourceFailed = false;
  const manager = new THREE.LoadingManager();
  manager.onError = () => {
    resourceFailed = true;
  };
  const result = await new GLTFLoader(manager).parseAsync(bytes, "/models/silo-engolfamento/");
  // GLTF image decoding is not abortable. Dispose the late result before exposing it.
  if (signal?.aborted) {
    disposeSources([result.scene]);
    throw abortError();
  }
  if (resourceFailed) {
    disposeSources([result.scene]);
    throw new Error(
      `Textura do técnico ${id.toUpperCase()} indisponível. Tente carregar novamente.`,
    );
  }
  onAsset?.(id, bytes.byteLength);
  return result.scene;
}

/** Preserve hands and body while removing the wearer's own head from the eye camera. */
function headlessGeometry(mesh: THREE.SkinnedMesh) {
  const index = mesh.geometry.index;
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  if (!index || !skinIndex || !skinWeight)
    throw new Error("A anatomia requer índices e pesos de esqueleto");
  const headBones = new Set(
    mesh.skeleton.bones.flatMap((bone, i) => (/^(head|neck_01)$/.test(bone.name) ? [i] : [])),
  );
  const headWeight = (vertex: number) => {
    let value = 0;
    for (let k = 0; k < 4; k++)
      if (headBones.has(skinIndex.getComponent(vertex, k)))
        value += skinWeight.getComponent(vertex, k);
    return value;
  };
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    if (Math.max(headWeight(a), headWeight(b), headWeight(c)) < 0.35) kept.push(a, b, c);
  }
  const geometry = mesh.geometry.clone();
  geometry.setIndex(kept);
  return geometry;
}

function ribbon(
  points: number[][],
  width = 0.036,
  horizontal = false,
  project?: (point: THREE.Vector3) => void,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3().fromArray(point)),
  );
  const segments = Math.max(20, points.length * 4);
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const point = curve.getPoint(i / segments);
    project?.(point);
    centers.push(point);
  }
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const tangent = new THREE.Vector3(),
    side = new THREE.Vector3(),
    normal = new THREE.Vector3();
  let distance = 0;
  for (let i = 0; i <= segments; i++) {
    const center = centers[i]!;
    tangent
      .copy(centers[Math.min(segments, i + 1)]!)
      .sub(centers[Math.max(0, i - 1)]!)
      .normalize();
    side.copy(horizontal ? UP : new THREE.Vector3(1, 0, 0));
    side.addScaledVector(tangent, -side.dot(tangent)).normalize();
    normal.crossVectors(tangent, side).normalize();
    if (i) distance += center.distanceTo(centers[i - 1]!);
    // 4 mm webbing, smoothly curved along the actual uniform surface.
    for (let k = 0; k < 4; k++) {
      const u = k === 0 || k === 3 ? -1 : 1;
      const v = k < 2 ? 1 : -1;
      positions.push(
        center.x + ((side.x * width) / 2) * u + normal.x * 0.002 * v,
        center.y + ((side.y * width) / 2) * u + normal.y * 0.002 * v,
        center.z + ((side.z * width) / 2) * u + normal.z * 0.002 * v,
      );
      uv.push((u + 1) / 2, distance * 25);
    }
    if (i < segments)
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k,
          b = i * 4 + ((k + 1) % 4),
          c = a + 4,
          d = b + 4;
        indices.push(a, c, b, b, c, d);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function belt(
  y: number,
  rx: number,
  rz: number,
  centerX = 0,
  centerZ = 0.03,
  project?: (point: THREE.Vector3) => void,
) {
  const points = Array.from({ length: 25 }, (_, i) => [
    centerX + Math.sin((i / 24) * Math.PI * 2) * rx,
    y,
    centerZ + Math.cos((i / 24) * Math.PI * 2) * rz,
  ]);
  return ribbon(points, 0.037, true, project);
}
function mergedMesh(
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
  bone: THREE.Bone,
  root: THREE.Group,
) {
  // Model straps in foot-origin coordinates, then convert once to the chosen bone bind space.
  root.updateMatrixWorld(true);
  const conversion = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(root.matrixWorld);
  geometries.forEach((geometry) => geometry.applyMatrix4(conversion));
  const merged = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Falha ao montar cinturão");
  const mesh = new THREE.Mesh(merged, material);
  mesh.receiveShadow = true;
  bone.add(mesh);
  return mesh;
}

class Technician {
  readonly root = new THREE.Group();
  readonly harnessPoint = new THREE.Object3D();
  readonly eyePoint = new THREE.Object3D();
  private readonly bones: {
    bone: THREE.Bone;
    rotation: THREE.Quaternion;
    position: THREE.Vector3;
  }[] = [];
  private readonly meshViews: MeshView[] = [];
  private readonly skeletons = new Set<THREE.Skeleton>();
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly legs: Limb[];
  private readonly arms: Limb[];
  private readonly spine: THREE.Bone;
  private near = true;
  private readonly target = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly parentQ = new THREE.Quaternion();
  private readonly worldQ = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
  private harnessMaterial: THREE.MeshStandardMaterial | undefined;
  private cut = false;

  constructor(source: THREE.Object3D, id: WorkerId | "watch") {
    const instance = clone(source);
    this.root.name = id === "watch" ? "Vigia_externo" : `Tecnico_${id}`;
    this.root.userData["workerId"] = id;
    this.root.add(instance);
    const boneMap = new Map<string, THREE.Bone>();
    let skeleton: THREE.Skeleton | null = null;
    const copies = new Map<THREE.Material, THREE.Material>();
    const tint = new THREE.Color(id === "A" ? "#b7d2cd" : id === "B" ? "#d6c8ae" : "#c3d2e2");
    instance.traverse((node) => {
      if (node instanceof THREE.Bone) {
        boneMap.set(node.name, node);
        this.bones.push({
          bone: node,
          rotation: node.quaternion.clone(),
          position: node.position.clone(),
        });
      }
      if (node instanceof THREE.SkinnedMesh) {
        if (!skeleton) skeleton = node.skeleton;
        else if (
          node.skeleton !== skeleton &&
          node.skeleton.bones.every((bone, i) => bone === skeleton!.bones[i])
        ) {
          node.skeleton.dispose();
          node.skeleton = skeleton;
        }
        this.skeletons.add(node.skeleton);
      }
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = false;
      node.receiveShadow = true;
      // Skinning changes the original bounds; the three workers remain bounded by the scene.
      node.frustumCulled = false;
      let lodNode: THREE.Object3D | null = node;
      while (lodNode && !/^(near|far)_/.test(lodNode.name)) lodNode = lodNode.parent;
      if (!lodNode) throw new Error(`LOD ausente em ${node.name}`);
      const geometry = node.geometry;
      const body = lodNode.name.endsWith("_body") && node instanceof THREE.SkinnedMesh;
      const headless = body ? headlessGeometry(node as THREE.SkinnedMesh) : undefined;
      if (headless) this.geometries.add(headless);
      this.meshViews.push({
        mesh: node,
        near: lodNode.name.startsWith("near_"),
        hideInFirstPerson: /_(helmet|eyes)$/.test(lodNode.name),
        geometry,
        headless,
      });
      const mapMaterial = (material: THREE.Material) => {
        // A/B own every material so their technical section cannot cut the
        // external watchperson's shared source skin, boots or eyes. Textures
        // and geometry still share their existing immutable source owner.
        if (id === "watch" && !/^(uniform|helmet)/.test(material.name)) return material;
        if (!copies.has(material)) {
          const copy = material.clone() as THREE.MeshStandardMaterial;
          if (material.name.startsWith("uniform")) copy.color.multiply(tint);
          else if (material.name.startsWith("helmet")) {
            copy.color.set(id === "A" ? "#eeb631" : id === "B" ? "#e4e6d7" : "#dc922b");
            copy.roughness = 0.62;
          }
          copies.set(material, copy);
          this.materials.add(copy);
        }
        return copies.get(material)!;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(mapMaterial)
        : mapMaterial(node.material);
    });
    this.root.updateMatrixWorld(true);
    const bone = (name: string) => {
      const value = boneMap.get(name);
      if (!value) throw new Error(`Osso essencial ausente: ${name}`);
      return value;
    };
    const limb = (upper: string, lower: string, end: string): Limb => {
      const x = bone(upper),
        y = bone(lower),
        z = bone(end);
      return {
        upper: x,
        lower: y,
        end: z,
        upperLength: x.getWorldPosition(this.a).distanceTo(y.getWorldPosition(this.b)),
        lowerLength: y.getWorldPosition(this.a).distanceTo(z.getWorldPosition(this.b)),
        ankleHeight: z.getWorldPosition(this.a).y,
        footRotation: z.getWorldQuaternion(new THREE.Quaternion()),
      };
    };
    this.legs = [limb("thigh_l", "calf_l", "foot_l"), limb("thigh_r", "calf_r", "foot_r")];
    this.arms = [
      limb("upperarm_l", "lowerarm_l", "hand_l"),
      limb("upperarm_r", "lowerarm_r", "hand_r"),
    ];
    this.spine = bone("spine_03");
    this.attachPoint(
      this.harnessPoint,
      this.spine,
      id === "B" ? [0, 1.35, -0.1] : [0, 1.42, -0.14],
    );
    this.attachPoint(this.eyePoint, bone("head"), [0, id === "B" ? 1.61 : 1.66, 0.1]);
    if (id !== "watch") this.buildHarness(boneMap, id);
  }

  private attachPoint(
    point: THREE.Object3D,
    bone: THREE.Bone,
    position: readonly [number, number, number],
  ) {
    point.position.fromArray(position);
    this.root.localToWorld(point.position);
    bone.worldToLocal(point.position);
    bone.add(point);
  }

  private buildHarness(bones: Map<string, THREE.Bone>, id: WorkerId) {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const shade = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 235 : 210;
        pixels.set([shade, shade, shade, 255], (y * 16 + x) * 4);
      }
    const weave = new THREE.DataTexture(pixels, 16, 16);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.colorSpace = THREE.SRGBColorSpace;
    weave.needsUpdate = true;
    this.textures.add(weave);
    const webbing = new THREE.MeshStandardMaterial({
      color: id === "A" ? "#cd5428" : "#394952",
      map: weave,
      roughness: 0.94,
    });
    this.harnessMaterial = webbing;
    const metal = new THREE.MeshStandardMaterial({
      color: "#aeb7ba",
      metalness: 0.7,
      roughness: 0.35,
    });
    this.materials.add(webbing);
    this.materials.add(metal);
    const scale = id === "B" ? 0.966 : 1;
    const uniform = this.root.getObjectByName("near_uniform") as THREE.SkinnedMesh;
    uniform.skeleton.update();
    // Bake the bind pose once for preparation. Raycasting the SkinnedMesh for
    // each fitting sample would repeat skinning thousands of triangles per ray.
    const bindPositions = new Float32Array(uniform.geometry.getAttribute("position").count * 3);
    const bindPoint = new THREE.Vector3();
    for (let i = 0; i < bindPositions.length / 3; i++) {
      uniform.getVertexPosition(i, bindPoint).applyMatrix4(uniform.matrixWorld);
      bindPositions[i * 3] = bindPoint.x;
      bindPositions[i * 3 + 1] = bindPoint.y;
      bindPositions[i * 3 + 2] = bindPoint.z;
    }
    const fittingGeometry = new THREE.BufferGeometry();
    fittingGeometry.setAttribute("position", new THREE.BufferAttribute(bindPositions, 3));
    fittingGeometry.setIndex(uniform.geometry.index!.clone());
    fittingGeometry.computeBoundingBox();
    fittingGeometry.computeBoundingSphere();
    const fittingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const fittingMesh = new THREE.Mesh(fittingGeometry, fittingMaterial);
    const ray = new THREE.Raycaster();
    const vector = new THREE.Vector3();
    const fitted = (point: THREE.Vector3) => {
      // Project onto the true bind-pose uniform only at preparation, never per frame.
      if (point.y > 1.395 * scale) return;
      const sign = point.z >= 0.025 ? 1 : -1;
      ray.set(vector.set(point.x, point.y, sign * 0.55), new THREE.Vector3(0, 0, -sign));
      const hit = ray.intersectObject(fittingMesh, false)[0];
      if (hit) point.z = hit.point.z + sign * 0.006;
    };
    const fittedBelt = (point: THREE.Vector3, centerX = 0) => {
      const outward = new THREE.Vector3(point.x - centerX, 0, point.z - 0.03).normalize();
      const origin = new THREE.Vector3(centerX, point.y, 0.03).addScaledVector(outward, 0.5);
      ray.set(origin, outward.clone().negate());
      const hit = ray.intersectObject(fittingMesh, false)[0];
      if (hit) point.copy(hit.point).addScaledVector(outward, 0.006);
    };
    const path = (points: number[][], width = 0.036, projection = true) =>
      ribbon(
        points.map((p) => [p[0]!, p[1]! * scale, p[2]!]),
        width,
        false,
        projection ? fitted : undefined,
      );
    const geometry: THREE.BufferGeometry[] = [
      belt(1.01 * scale, 0.165, 0.119, 0, 0.03, fittedBelt),
    ];
    for (const side of [-1, 1]) {
      geometry.push(
        path([
          [side * 0.12, 1.01, 0.15],
          [side * 0.125, 1.2, 0.14],
          [side * 0.13, 1.34, 0.11],
          [side * 0.125, 1.395, 0.075],
          [side * 0.12, 1.425, 0.025],
          [side * 0.12, 1.405, -0.025],
          [side * 0.115, 1.35, -0.072],
          [side * 0.11, 1.2, -0.09],
          [side * 0.1, 1.01, -0.1],
        ]),
      );
      geometry.push(
        path(
          [
            [side * 0.1, 1.015, -0.1],
            [side * 0.065, 1.18, -0.095],
            [0, 1.35, -0.1],
          ],
          0.032,
        ),
      );
    }
    // Chest strap is below clavicles, closely follows the chest, and has no cage brace.
    geometry.push(
      ribbon(
        [
          [-0.13, 1.245 * scale, 0.15],
          [0, 1.245 * scale, 0.16],
          [0.13, 1.245 * scale, 0.15],
        ],
        0.029,
        true,
        fitted,
      ),
    );
    if (id === "A")
      geometry.push(
        ribbon(
          [
            [0, 1.35, -0.095],
            [0, 1.4, -0.13],
            [0, 1.42, -0.14],
          ],
          0.033,
        ),
      );
    else
      geometry.push(
        ribbon(
          [
            [0, 1.35 * scale, -0.09],
            [0, 1.35, -0.1],
          ],
          0.03,
        ),
      );
    const torso = mergedMesh(geometry, webbing, this.spine, this.root);
    torso.name = "Cinturao_tiras_ombros_cintura";
    this.geometries.add(torso.geometry);
    const buckleParts: THREE.BufferGeometry[] = [];
    const buckle = (x: number, y: number, width: number, height: number) => {
      const center = new THREE.Vector3(x, y, 0.15);
      fitted(center);
      for (const side of [-1, 1]) {
        const horizontal = new THREE.BoxGeometry(width, 0.004, 0.005);
        horizontal.translate(x, y + (side * height) / 2, center.z + 0.005);
        buckleParts.push(horizontal);
        const vertical = new THREE.BoxGeometry(0.004, height, 0.005);
        vertical.translate(x + (side * width) / 2, y, center.z + 0.005);
        buckleParts.push(vertical);
      }
    };
    for (const x of [-0.125, 0.125]) buckle(x, 1.15 * scale, 0.043, 0.025);
    buckle(0, 1.01 * scale, 0.047, 0.029);
    buckle(0, 1.245 * scale, 0.036, 0.024);
    const dorsal = new THREE.TorusGeometry(0.028, 0.005, 6, 16);
    dorsal.translate(0, id === "A" ? 1.42 : 1.35, id === "A" ? -0.14 : -0.1);
    buckleParts.push(dorsal);
    if (id === "A") {
      const connector = new THREE.TorusGeometry(0.021, 0.0045, 6, 14);
      connector.scale(0.8, 1.55, 1);
      connector.translate(0, 1.455, -0.14);
      buckleParts.push(connector);
    }
    const buckles = mergedMesh(buckleParts, metal, this.spine, this.root);
    buckles.name = "Dorsal_conector_ajustes";
    this.geometries.add(buckles.geometry);
    for (const side of [-1, 1]) {
      const thigh = bones.get(side === 1 ? "thigh_l" : "thigh_r")!;
      const straps = [
        belt(0.79 * scale, 0.07, 0.087, side * 0.103, 0.03, (p) => fittedBelt(p, side * 0.103)),
      ];
      straps.push(
        path(
          [
            [side * 0.1, 0.79, 0.11],
            [side * 0.12, 0.9, 0.14],
            [side * 0.12, 1.01, 0.15],
          ],
          0.032,
        ),
      );
      const legStrap = mergedMesh(straps, webbing, thigh, this.root);
      legStrap.name = "Cinturao_perna";
      this.geometries.add(legStrap.geometry);
    }
    fittingGeometry.dispose();
    fittingMaterial.dispose();
  }

  private setWorldQuaternion(bone: THREE.Bone, desired: THREE.Quaternion) {
    bone.parent!.getWorldQuaternion(this.parentQ).invert();
    bone.quaternion.copy(this.parentQ.multiply(desired));
    bone.updateWorldMatrix(false, true);
  }
  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.getWorldPosition(this.a);
    child.getWorldPosition(this.b).sub(this.a).normalize();
    this.direction.copy(target).sub(this.a).normalize();
    this.q.setFromUnitVectors(this.b, this.direction);
    bone.getWorldQuaternion(this.worldQ);
    this.setWorldQuaternion(bone, this.q.multiply(this.worldQ));
  }
  private solve(limb: Limb, target: THREE.Vector3, bend: THREE.Vector3) {
    limb.upper.getWorldPosition(this.p);
    this.direction.copy(target).sub(this.p);
    const length = clamp(
      this.direction.length(),
      0.03,
      limb.upperLength + limb.lowerLength - 0.008,
    );
    this.direction.normalize();
    const along = (limb.upperLength ** 2 - limb.lowerLength ** 2 + length ** 2) / (2 * length);
    const away = Math.sqrt(Math.max(0, limb.upperLength ** 2 - along ** 2));
    this.pole.copy(bend).addScaledVector(this.direction, -bend.dot(this.direction)).normalize();
    this.knee.copy(this.p).addScaledVector(this.direction, along).addScaledVector(this.pole, away);
    this.aim(limb.upper, limb.lower, this.knee);
    this.aim(limb.lower, limb.end, target);
  }

  update(pose: WorkerPose, camera: THREE.Camera, ownFirstPerson: boolean) {
    this.root.position.fromArray(pose.position);
    this.root.rotation.y = pose.heading;
    this.yaw.setFromAxisAngle(UP, pose.heading);
    this.bones.forEach(({ bone, rotation, position }) => {
      bone.quaternion.copy(rotation);
      bone.position.copy(position);
    });
    this.root.updateMatrixWorld(true);
    const mobility = clamp(pose.mobility, 0, 1);
    const trapped = clamp(pose.depth / 1.1, 0, 1);
    const lean = pose.lean ?? trapped * 0.12 + pose.tension * -0.06;
    this.spine.getWorldQuaternion(this.worldQ);
    this.q.setFromAxisAngle(this.b.set(Math.cos(pose.heading), 0, -Math.sin(pose.heading)), lean);
    this.setWorldQuaternion(this.spine, this.q.multiply(this.worldQ));
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      const goal = pose.feet?.[i === 0 ? "left" : "right"];
      if (goal) this.target.fromArray(goal.position);
      else {
        // Neutral fallback only for the external watchperson or standalone rig
        // inspection. Incident technicians always receive explicit domain goals.
        this.target
          .set(i === 0 ? 0.12 : -0.12, 0, 0)
          .applyQuaternion(this.yaw)
          .add(this.root.position);
      }
      this.target.y += leg.ankleHeight;
      this.b.set(0, 0, 1).applyQuaternion(this.yaw);
      this.solve(leg, this.target, this.b);
      this.q.setFromAxisAngle(UP, goal?.yaw ?? pose.heading).multiply(leg.footRotation);
      this.setWorldQuaternion(leg.end, this.q);
    }
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? 1 : -1;
      arm.upper.getWorldPosition(this.p);
      // Short arm motion stops with lost mobility. Raised hands communicate bracing,
      // never a swimming stroke or an attempted improvised rescue of the colleague.
      this.target.set(
        side * 0.035,
        -0.43 + trapped * 0.49,
        0.08 + trapped * 0.2 + Math.sin(pose.walkPhase + i * Math.PI) * 0.08 * mobility,
      );
      this.target.applyQuaternion(this.yaw).add(this.p);
      this.b.set(side * 0.22, -0.2, -1).applyQuaternion(this.yaw);
      this.solve(arm, this.target, this.b);
    }
    this.root.updateMatrixWorld(true);
    if (pose.dorsal) {
      // Keep the visible dorsal ring and the domain endpoint identical. The
      // torso correction is local to the spine; planted feet retain their IK.
      this.harnessPoint.getWorldPosition(this.a);
      this.b.fromArray(pose.dorsal);
      this.spine.parent!.worldToLocal(this.a);
      this.spine.parent!.worldToLocal(this.b);
      this.spine.position.add(this.b.sub(this.a));
      this.root.updateMatrixWorld(true);
    }
    const distance = camera.position.distanceTo(this.root.position);
    // Hysteresis prevents near/far flashing at the 8 m threshold.
    if (ownFirstPerson || distance < 7) this.near = true;
    else if (distance > 9) this.near = false;
    this.meshViews.forEach((view) => {
      view.mesh.visible = view.near === this.near && !(ownFirstPerson && view.hideInFirstPerson);
      view.mesh.geometry = ownFirstPerson && view.headless ? view.headless : view.geometry;
    });
  }

  getGpuResources(): (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] {
    return [
      ...this.geometries,
      ...this.materials,
      ...this.textures,
      ...this.meshViews.flatMap((view) => [
        view.geometry,
        ...(view.headless ? [view.headless] : []),
      ]),
      ...[...this.skeletons].flatMap((skeleton) =>
        skeleton.boneTexture ? [skeleton.boneTexture] : [],
      ),
    ];
  }
  dispose() {
    this.skeletons.forEach((skeleton) => skeleton.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.root.removeFromParent();
    this.root.clear();
  }

  setHarnessHighlight(enabled: boolean) {
    this.harnessMaterial?.emissive.set(enabled ? "#66351d" : "#000000");
  }

  setCut(enabled: boolean, plane: THREE.Plane) {
    if (this.cut === enabled) return;
    this.cut = enabled;
    const update = (material: THREE.Material) => {
      material.clippingPlanes = enabled ? [plane] : [];
      material.clipShadows = enabled;
      material.needsUpdate = true;
    };
    // Update retained originals as well as currently attached inspection clones;
    // clearing a highlight must not restore the previous clipping policy.
    this.materials.forEach(update);
    this.root.traverse((node) => {
      if (node instanceof THREE.Mesh)
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(update);
    });
  }

  getFoot(side: FootSide, out: THREE.Vector3) {
    const leg = this.legs[side === "left" ? 0 : 1]!;
    leg.end.getWorldPosition(out);
    out.y -= leg.ankleHeight;
    return out;
  }
}

export async function createWorkers(
  signal?: AbortSignal,
  onAsset?: (id: "a" | "b", bytes: number) => void,
) {
  const loaded = await Promise.allSettled([
    loadWorker("a", signal, onAsset),
    loadWorker("b", signal, onAsset),
  ]);
  const sources = loaded.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (sources.length !== 2 || signal?.aborted) {
    disposeSources(sources);
    if (signal?.aborted) throw abortError();
    const failure = loaded.find((result) => result.status === "rejected");
    throw failure?.status === "rejected" ? failure.reason : new Error("Técnicos indisponíveis");
  }
  shareCommonTextures(sources);
  const root = new THREE.Group();
  root.name = "Tecnicos_silo_e_vigia";
  const technicians: Technician[] = [];
  try {
    technicians.push(new Technician(sources[0]!, "A"));
    technicians.push(new Technician(sources[1]!, "B"));
    technicians.push(new Technician(sources[0]!, "watch"));
    technicians.forEach((worker) => root.add(worker.root));
  } catch (error) {
    technicians.forEach((worker) => worker.dispose());
    disposeSources(sources);
    throw error;
  }
  const [A, B, watch] = technicians as [Technician, Technician, Technician];
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT_PLANE_Z);
  const defaultWatch: WorkerPose = {
    position: [-13.3, SILO_CONFIG.groundY.value, 3.5],
    heading: 2.5,
    walkPhase: 0,
    mobility: 0,
    depth: 0,
    tension: 0,
  };
  let disposed = false;
  return {
    root,
    getGpuResources() {
      return technicians.flatMap((worker) => worker.getGpuResources());
    },
    update(frame: WorkersFrame, camera: THREE.Camera, firstPerson: WorkerId | null = null) {
      if (disposed) return;
      A.update(frame.A, camera, firstPerson === "A");
      B.update(frame.B, camera, firstPerson === "B");
      watch.update(frame.watchperson ?? defaultWatch, camera, false);
    },
    getEye(id: WorkerId, out: THREE.Vector3) {
      return (id === "A" ? A : B).eyePoint.getWorldPosition(out);
    },
    getHarness(id: WorkerId, out: THREE.Vector3) {
      return (id === "A" ? A : B).harnessPoint.getWorldPosition(out);
    },
    setSupported(supported: boolean, showComparison = true) {
      A.root.visible = supported;
      B.root.visible = supported && showComparison;
    },
    setCut(enabled: boolean) {
      A.setCut(enabled, cutPlane);
      B.setCut(enabled, cutPlane);
    },
    getTechnician(id: WorkerId) {
      return (id === "A" ? A : B).root;
    },
    getFoot(id: WorkerId, side: FootSide, out: THREE.Vector3) {
      return (id === "A" ? A : B).getFoot(side, out);
    },
    setHarnessHighlight(enabled: boolean) {
      A.setHarnessHighlight(enabled);
      B.setHarnessHighlight(enabled);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      technicians.forEach((worker) => worker.dispose());
      disposeSources(sources);
      root.removeFromParent();
      root.clear();
    },
  };
}
export type WorkerPool = Awaited<ReturnType<typeof createWorkers>>;
