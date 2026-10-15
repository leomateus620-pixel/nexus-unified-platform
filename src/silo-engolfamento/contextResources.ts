import * as T from "three";

/** Release the old WebGL epoch while it is lost, retaining the model's CPU data.
 * Three's old geometry/instance listeners otherwise survive manager recreation
 * and try to delete stale buffers/VAOs during the eventual owner disposal. */
export function releaseContextGpuResources(
  scene: T.Scene,
  additional: readonly (T.BufferGeometry | T.Material | T.Texture | T.RenderTarget)[] = [],
) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>(),
    targets = new Set<T.RenderTarget>(),
    instances = new Set<T.InstancedMesh>();
  const collect = (resource: T.BufferGeometry | T.Material | T.Texture | T.RenderTarget) => {
    if (resource instanceof T.BufferGeometry) geometries.add(resource);
    else if (resource instanceof T.Material) materials.add(resource);
    else if (resource instanceof T.Texture) textures.add(resource);
    else targets.add(resource);
  };
  additional.forEach(collect);
  if (scene.environment) textures.add(scene.environment);
  if (scene.background instanceof T.Texture) textures.add(scene.background);
  scene.traverse((object) => {
    if (!(object instanceof T.Mesh) && !(object instanceof T.Line) && !(object instanceof T.Points))
      return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
    if (object instanceof T.InstancedMesh) instances.add(object);
    if (object instanceof T.SkinnedMesh && object.skeleton.boneTexture)
      textures.add(object.skeleton.boneTexture);
  });
  for (const material of materials)
    for (const value of Object.values(material))
      if (value instanceof T.Texture) textures.add(value);
  // Render targets own their attachment disposal. Do not dispatch twice.
  for (const target of targets) {
    textures.delete(target.texture);
    target.textures.forEach((texture) => textures.delete(texture));
    if (target.depthTexture) textures.delete(target.depthTexture);
  }
  for (const instance of instances) {
    const morph = instance.morphTexture;
    instance.dispose();
    // dispose() nulls morphTexture; its pixel data remains valid for re-upload.
    instance.morphTexture = morph;
    if (morph) textures.delete(morph);
  }
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  targets.forEach((target) => target.dispose());
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    targets: targets.size,
    instances: instances.size,
  };
}
