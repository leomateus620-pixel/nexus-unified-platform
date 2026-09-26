import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { feetAt, routeAt, clamp } from "./lc02-walkway";
import type { Person } from "./lc02-simulation";

const UP = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3(),
  b = new THREE.Vector3(),
  c = new THREE.Vector3();
const direction = new THREE.Vector3(),
  pole = new THREE.Vector3(),
  knee = new THREE.Vector3();
const q = new THREE.Quaternion(),
  parentQ = new THREE.Quaternion(),
  currentQ = new THREE.Quaternion();

function worldQuaternion(bone: THREE.Bone, desired: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(parentQ).invert();
  bone.quaternion.copy(parentQ.multiply(desired));
  bone.updateWorldMatrix(false, true);
}
function aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
  bone.getWorldPosition(a);
  child.getWorldPosition(b);
  b.sub(a).normalize();
  c.copy(target).sub(a).normalize();
  q.setFromUnitVectors(b, c);
  bone.getWorldQuaternion(currentQ);
  worldQuaternion(bone, q.multiply(currentQ));
}
type Limb = {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
  upperLength: number;
  lowerLength: number;
};
function solve(limb: Limb, target: THREE.Vector3, bend: THREE.Vector3) {
  const hip = limb.upper.getWorldPosition(new THREE.Vector3());
  direction.copy(target).sub(hip);
  const d = clamp(direction.length(), 0.01, limb.upperLength + limb.lowerLength - 0.001);
  direction.normalize();
  const along = (limb.upperLength ** 2 - limb.lowerLength ** 2 + d * d) / (2 * d);
  const away = Math.sqrt(Math.max(0, limb.upperLength ** 2 - along * along));
  pole.copy(bend).addScaledVector(direction, -bend.dot(direction)).normalize();
  knee.copy(hip).addScaledVector(direction, along).addScaledVector(pole, away);
  aim(limb.upper, limb.lower, knee);
  aim(limb.lower, limb.end, target);
}
function disposeTrees(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  roots.forEach((root) =>
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => materials.add(mat));
    }),
  );
  materials.forEach((mat) => {
    Object.values(mat).forEach((v) => {
      if (v instanceof THREE.Texture) textures.add(v);
    });
    mat.dispose();
  });
  textures.forEach((t) => {
    t.dispose();
    if (typeof ImageBitmap !== "undefined" && t.image instanceof ImageBitmap) t.image.close();
  });
  geometries.forEach((g) => g.dispose());
}

class Worker {
  root = new THREE.Group();
  private bones: { bone: THREE.Bone; rotation: THREE.Quaternion; position: THREE.Vector3 }[] = [];
  private legs: Limb[];
  private arms: Limb[];
  private pelvis: THREE.Bone;
  private spine: THREE.Bone;
  private meshes: { mesh: THREE.Mesh; near: boolean }[] = [];
  private skeletons = new Set<THREE.Skeleton>();
  private ownedMaterials: THREE.Material[] = [];
  private footRotations: THREE.Quaternion[];
  private ankleHeights: number[];
  private target = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private yaw = new THREE.Quaternion();
  private handTarget = new THREE.Vector3();
  private marker: THREE.Mesh;
  private contact: THREE.Mesh;
  lastFootError = 0;
  get visibleMeshes() {
    return this.root.visible ? this.meshes.filter(({ mesh }) => mesh.visible).length : 0;
  }
  constructor(
    source: THREE.Object3D,
    id: number,
    ring: THREE.BufferGeometry,
    markerMat: THREE.Material,
    shadow: THREE.BufferGeometry,
    shadowMat: THREE.Material,
  ) {
    const instance = clone(source);
    this.root.name = `Trabalhador_${id + 1}`;
    this.root.userData["personId"] = id;
    this.root.add(instance);
    const scale = [1, 1.018, 0.99, 1.028, 0.975][id % 5]!;
    this.root.scale.setScalar(scale);
    const bones = new Map<string, THREE.Bone>();
    let skeleton: THREE.Skeleton | null = null;
    const tint = new THREE.Color(["#ffffff", "#cbdcda", "#e5d9bc", "#b7cddd", "#e2cbd1"][id % 5]!);
    const tinted = new Map<THREE.Material, THREE.Material>();
    instance.traverse((o) => {
      if (o instanceof THREE.Bone) {
        bones.set(o.name, o);
        this.bones.push({ bone: o, rotation: o.quaternion.clone(), position: o.position.clone() });
      }
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = false;
        let lodNode: THREE.Object3D | null = o;
        while (lodNode && !/^(near|far)_/.test(lodNode.name)) lodNode = lodNode.parent;
        if (!lodNode) throw new Error(`Missing LOD parent for ${o.name}`);
        this.meshes.push({ mesh: o, near: lodNode.name.startsWith("near_") });
        const mat = o.material as THREE.MeshStandardMaterial;
        if (mat.name.startsWith("uniform") || mat.name.startsWith("helmet")) {
          if (!tinted.has(mat)) {
            const copy = mat.clone();
            if (mat.name.startsWith("uniform")) copy.color.multiply(tint);
            else copy.color.set(id % 3 === 1 ? "#f4f2df" : "#f2c23d");
            tinted.set(mat, copy);
            this.ownedMaterials.push(copy);
          }
          o.material = tinted.get(mat)!;
        }
      }
      if (o instanceof THREE.SkinnedMesh) {
        // GLTF shares a rig; SkeletonUtils creates a Skeleton per mesh. Reuse one bone texture.
        if (!skeleton) skeleton = o.skeleton;
        else if (
          o.skeleton !== skeleton &&
          o.skeleton.bones.length === skeleton.bones.length &&
          o.skeleton.bones.every((bone, index) => bone === skeleton!.bones[index])
        ) {
          o.skeleton.dispose();
          o.skeleton = skeleton;
        }
        this.skeletons.add(o.skeleton);
      }
    });
    this.root.updateMatrixWorld(true);
    const get = (name: string) => {
      const bone = bones.get(name);
      if (!bone) throw new Error(`Worker rig missing ${name}`);
      return bone;
    };
    const limb = (upper: string, lower: string, end: string): Limb => {
      const x = get(upper),
        y = get(lower),
        z = get(end);
      return {
        upper: x,
        lower: y,
        end: z,
        upperLength: x.getWorldPosition(a).distanceTo(y.getWorldPosition(b)),
        lowerLength: y.getWorldPosition(a).distanceTo(z.getWorldPosition(b)),
      };
    };
    this.legs = [limb("thigh_l", "calf_l", "foot_l"), limb("thigh_r", "calf_r", "foot_r")];
    this.arms = [
      limb("upperarm_l", "lowerarm_l", "hand_l"),
      limb("upperarm_r", "lowerarm_r", "hand_r"),
    ];
    this.pelvis = get("pelvis");
    this.spine = get("spine_01");
    this.footRotations = this.legs.map((leg) => leg.end.getWorldQuaternion(new THREE.Quaternion()));
    this.ankleHeights = this.legs.map((leg) => leg.end.getWorldPosition(a).y);
    this.marker = new THREE.Mesh(ring, markerMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.contact = new THREE.Mesh(shadow, shadowMat);
    this.contact.rotation.x = -Math.PI / 2;
  }
  attach(parent: THREE.Group) {
    parent.add(this.root, this.marker, this.contact);
  }
  update(person: Person | undefined, selected: boolean, camera: THREE.Camera) {
    const visible = person?.state === "walking";
    this.root.visible = !!visible;
    this.marker.visible = !!visible && selected;
    this.contact.visible = !!visible;
    if (!visible || !person) return;
    const route = routeAt(person.s),
      feet = feetAt(person.s);
    this.root.position.fromArray(route.p);
    this.root.rotation.y = route.heading;
    this.yaw.setFromAxisAngle(UP, route.heading);
    for (const { bone, rotation, position } of this.bones) {
      bone.quaternion.copy(rotation);
      bone.position.copy(position);
    }
    this.root.updateMatrixWorld(true);
    this.pelvis.getWorldPosition(this.target);
    this.target.y -= 0.045 + Math.sin(feet.phase * 2) * 0.008;
    this.pelvis.position.copy(this.pelvis.parent!.worldToLocal(this.target));
    this.root.updateMatrixWorld(true);
    // Keep both ankle goals reachable throughout the rise. Root height follows the
    // route, while pelvis height follows support, avoiding a stretched planted leg.
    let lowerPelvis = 0;
    [feet.left, feet.right].forEach((foot, i) => {
      const leg = this.legs[i]!;
      leg.upper.getWorldPosition(a);
      const horizontal = Math.hypot(a.x - foot[0], a.z - foot[2]);
      const reach = leg.upperLength + leg.lowerLength - 0.018;
      const height = Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal));
      lowerPelvis = Math.min(lowerPelvis, foot[1] + this.ankleHeights[i]! + height - a.y);
    });
    if (lowerPelvis < 0) {
      this.pelvis.getWorldPosition(this.target);
      this.target.y += lowerPelvis;
      this.pelvis.position.copy(this.pelvis.parent!.worldToLocal(this.target));
      this.root.updateMatrixWorld(true);
    }
    this.spine.getWorldQuaternion(currentQ);
    q.setFromAxisAngle(
      this.bend.set(Math.cos(route.heading), 0, -Math.sin(route.heading)),
      route.stair ? 0.085 : 0.025,
    );
    worldQuaternion(this.spine, q.multiply(currentQ));
    this.lastFootError = 0;
    [feet.left, feet.right].forEach((foot, i) => {
      this.target.fromArray(foot);
      this.target.y += this.ankleHeights[i]!;
      this.bend.set(Math.sin(route.heading), 0, Math.cos(route.heading));
      solve(this.legs[i]!, this.target, this.bend);
      q.copy(this.yaw).multiply(this.footRotations[i]!);
      worldQuaternion(this.legs[i]!.end, q);
      this.lastFootError = Math.max(
        this.lastFootError,
        this.legs[i]!.end.getWorldPosition(a).distanceTo(this.target),
      );
    });
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? 1 : -1;
      const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
      this.handTarget.set(
        side * 0.035,
        -0.43 * this.root.scale.x,
        0.04 + Math.sin(feet.phase + i * Math.PI) * 0.105,
      );
      this.handTarget.applyQuaternion(this.yaw).add(shoulder);
      this.bend.set(side * 0.18, -0.15, -1).applyQuaternion(this.yaw);
      solve(arm, this.handTarget, this.bend);
    });
    const near = camera.position.distanceTo(this.root.position) < 6;
    this.meshes.forEach(({ mesh, near: nearMesh }) => {
      mesh.visible = near === nearMesh;
    });
    const stance = feet.stance === "left" ? feet.left : feet.right;
    this.contact.position.fromArray(stance);
    this.contact.position.y += 0.002;
    this.marker.position.set(route.p[0], route.p[1] + 0.025, route.p[2]);
  }
  dispose() {
    this.skeletons.forEach((s) => s.dispose());
    this.ownedMaterials.forEach((m) => m.dispose());
  }
}

export async function createPeoplePool() {
  const loader = new GLTFLoader();
  const loaded = await Promise.allSettled(
    ["a", "b"].map((id) => loader.loadAsync(`/models/escada-lc02/people/worker-${id}.glb`)),
  );
  const sources = loaded.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.scene] : [],
  );
  if (sources.length !== 2) {
    disposeTrees(sources);
    throw new Error("Unable to load worker assets");
  }
  const root = new THREE.Group();
  root.name = "Pessoas_circulacao_ilustrativa";
  const ring = new THREE.RingGeometry(0.26, 0.29, 32);
  const markerMat = new THREE.MeshBasicMaterial({
    color: "#0a9b97",
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadow = new THREE.PlaneGeometry(0.34, 0.34);
  const data = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
      data[i + 3] = Math.round(
        Math.max(0, 1 - Math.hypot((x - 15.5) / 16, (y - 15.5) / 16)) ** 2 * 110,
      );
    }
  const texture = new THREE.DataTexture(data, 32, 32);
  texture.needsUpdate = true;
  const shadowMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const workers: Worker[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const worker = new Worker(sources[i % 2]!, i, ring, markerMat, shadow, shadowMat);
      workers.push(worker);
      worker.attach(root);
    }
  } catch (error) {
    workers.forEach((worker) => worker.dispose());
    disposeTrees(sources);
    ring.dispose();
    shadow.dispose();
    markerMat.dispose();
    shadowMat.dispose();
    texture.dispose();
    throw error;
  }
  return {
    root,
    workers,
    update(people: Person[], selected: number, camera: THREE.Camera) {
      workers.forEach((worker, i) => worker.update(people[i], selected === i, camera));
    },
    dispose() {
      workers.forEach((w) => w.dispose());
      disposeTrees(sources);
      ring.dispose();
      markerMat.dispose();
      shadow.dispose();
      shadowMat.dispose();
      texture.dispose();
      root.clear();
    },
  };
}
export type PeoplePool = Awaited<ReturnType<typeof createPeoplePool>>;
