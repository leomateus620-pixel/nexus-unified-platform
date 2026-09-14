import { useEffect, useState } from "react";
import { Group, Mesh, Texture } from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { diagnostics } from "../performance/metrics";
export function disposeAsset(group: Group) {
  const geometries = new Set<Mesh["geometry"]>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  group.traverse((o) => {
    if (o instanceof Mesh) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
    }
  });
  materials.forEach((m) => {
    Object.values(m).forEach((v) => {
      if (v instanceof Texture) textures.add(v);
    });
    m.dispose();
  });
  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
}
export function useAsset(file: string) {
  const [asset, setAsset] = useState<Group | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let loaded: Group | null = null;
    const run = async () => {
      const start = performance.now();
      const response = await fetch(`/models/3tentos/${file}.glb`, { signal: controller.signal });
      if (!response.ok)
        throw new Error(`Não foi possível carregar o setor ${file} (${response.status}).`);
      const buffer = await response.arrayBuffer();
      const fetched = performance.now();
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(buffer, "/models/3tentos/");
      if (!active) {
        disposeAsset(gltf.scene);
        return;
      }
      loaded = gltf.scene;
      loaded.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = file !== "terrain" && file !== "grass";
          o.receiveShadow = true;
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          materials.forEach((m) => {
            Object.values(m).forEach((v) => {
              if (v instanceof Texture) v.anisotropy = 4;
            });
          });
        }
      });
      diagnostics.assets[file] = {
        bytes: buffer.byteLength,
        fetchMs: fetched - start,
        decodeMs: performance.now() - fetched,
      };
      setAsset(loaded);
    };
    run().catch((e) => {
      if (active && !controller.signal.aborted)
        setError(e instanceof Error ? e : new Error(String(e)));
    });
    return () => {
      active = false;
      controller.abort();
      if (loaded) disposeAsset(loaded);
    };
  }, [file]);
  if (error) throw error;
  return asset;
}
