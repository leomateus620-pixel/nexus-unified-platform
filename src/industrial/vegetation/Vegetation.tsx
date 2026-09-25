import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
} from "three";
import type { BufferGeometry, Material } from "three";
import { site } from "../data";
import { useAsset } from "../scene/assets";
import type { Quality } from "../types";
import { bakePrototypeGeometry } from "./prototypeGeometry";

function Batch({
  geometry,
  material,
  trees,
  wind,
  quality,
  onSelect,
}: {
  geometry: BufferGeometry;
  material: Material;
  trees: typeof site.trees;
  wind: boolean;
  quality: Quality;
  onSelect: (id: string) => void;
}) {
  const { invalidate } = useThree();
  const ref = useRef<InstancedMesh>(null);
  const time = useRef({ value: 0 });
  const strength = useRef({ value: 0 });
  const leaf = material.name.startsWith("leaf") || material.name === "palm";
  const localMaterial = useMemo(() => {
    const m = material.clone() as MeshStandardMaterial;
    if (leaf) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms["windTime"] = time.current;
        shader.uniforms["windStrength"] = strength.current;
        shader.vertexShader =
          "uniform float windTime;\nuniform float windStrength;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nfloat flex = smoothstep(0.52, 0.9, position.y);\ntransformed.x += sin(windTime + instanceMatrix[3].x * 0.38 + position.y * 3.0) * flex * 0.009 * windStrength;",
        );
      };
      m.customProgramCacheKey = () => "3tentos-leaf-wind-v2";
    }
    return m;
  }, [material, leaf]);
  const depthMaterial = useMemo(() => {
    const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
    if (leaf) {
      m.onBeforeCompile = localMaterial.onBeforeCompile;
      m.customProgramCacheKey = () => "3tentos-wind-depth-v2";
    }
    return m;
  }, [leaf, localMaterial]);
  useEffect(() => () => localMaterial.dispose(), [localMaterial]);
  useEffect(() => () => depthMaterial.dispose(), [depthMaterial]);
  useEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [geometry, localMaterial, trees.length]);
  useEffect(() => {
    const m = new Matrix4(),
      p = new Vector3(),
      s = new Vector3(),
      q = new Quaternion();
    trees.forEach((t, i) => {
      p.fromArray(t.position);
      s.setScalar(t.height);
      q.setFromAxisAngle(new Vector3(0, 1, 0), t.rotation);
      m.compose(p, q, s);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
      // The instance transforms are populated after commit. Request the frame
      // that uploads them even when the camera and wind are both stationary.
      invalidate();
    }
  }, [trees, invalidate]);
  useFrame((state) => {
    strength.current.value = wind && leaf && quality === "balanced" ? 1 : 0;
    if (wind && leaf && quality === "balanced") time.current.value = state.clock.elapsedTime * 0.65;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, localMaterial, trees.length]}
      customDepthMaterial={depthMaterial}
      castShadow
      receiveShadow
      frustumCulled
      dispose={null}
      onClick={(e) => {
        if (e.delta > 5 || e.instanceId === undefined) return;
        for (
          let ancestor: import("three").Object3D | null = e.object;
          ancestor;
          ancestor = ancestor.parent
        )
          if (!ancestor.visible) return;
        const tree = trees[e.instanceId];
        if (tree) {
          e.stopPropagation();
          onSelect(tree.id);
        }
      }}
    />
  );
}
export function Vegetation({
  wind,
  quality,
  visible,
  onReady,
  onSelect,
}: {
  wind: boolean;
  quality: Quality;
  visible: boolean;
  onReady: (name: string) => void;
  onSelect: (id: string) => void;
}) {
  const high = useAsset("vegetation-prototypes");
  const low = useAsset("vegetation-low");
  const asset = quality === "economy" ? (low ?? high) : (high ?? low);
  const batches = useMemo(() => {
    if (!asset) return [];
    asset.updateMatrixWorld(true);
    const result: {
      key: string;
      geometry: BufferGeometry;
      material: Material;
      trees: typeof site.trees;
    }[] = [];
    asset.children.forEach((group) => {
      // GLTFLoader sanitizes dots from Object3D.name but retains the original
      // Blender name here, including the .001 suffix on preserved low assets.
      const sourceName = String(group.userData["name"] ?? group.name).replace(/\.\d+$/, "");
      const trees = site.trees.filter((t) => `${t.type}-${t.variant}` === sourceName);
      // Divide instances geographically so a far sector can be frustum culled.
      const sectors = quality === "economy" ? 1 : 2;
      for (let sector = 0; sector < sectors; sector++) {
        const local = trees.filter((t) => sectors === 1 || (t.position[0]! > 0 ? 1 : 0) === sector);
        if (!local.length) continue;
        group.traverse((o) => {
          if (o instanceof Mesh && !Array.isArray(o.material))
            result.push({
              key: `${o.name}-${sector}`,
              geometry: bakePrototypeGeometry(o.geometry, o.matrixWorld),
              material: o.material,
              trees: local,
            });
        });
      }
    });
    return result;
  }, [asset, quality]);
  useEffect(() => () => batches.forEach((b) => b.geometry.dispose()), [batches]);
  useEffect(() => {
    if (asset) onReady("vegetation");
  }, [asset, onReady]);
  return (
    <group visible={visible}>
      {batches.map(({ key, ...b }) => (
        <Batch key={key} {...b} wind={wind} quality={quality} onSelect={onSelect} />
      ))}
    </group>
  );
}
