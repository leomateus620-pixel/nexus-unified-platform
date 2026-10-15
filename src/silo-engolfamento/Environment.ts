import * as T from "three";

/** Contained agricultural yard. Locally generated, static, no renderer or RAF. */
export function createEnvironment() {
  const root = new T.Group();
  root.name = "Patio_agroindustrial_Nexus";
  const resources: (T.BufferGeometry | T.Material | T.Texture)[] = [];
  const detail = new T.Group();
  root.add(detail);
  const textureData = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) {
    const n = (Math.imul(i + 71, 2654435761) >>> 17) % 29;
    textureData.set([157 + n, 151 + n, 132 + n, 255], i * 4);
  }
  const gravel = new T.DataTexture(textureData, 128, 128);
  gravel.wrapS = gravel.wrapT = T.RepeatWrapping;
  gravel.repeat.set(180, 180);
  gravel.colorSpace = T.SRGBColorSpace;
  gravel.generateMipmaps = true;
  gravel.minFilter = T.LinearMipmapLinearFilter;
  gravel.magFilter = T.LinearFilter;
  gravel.anisotropy = 4;
  gravel.needsUpdate = true;
  resources.push(gravel);
  const earth = new T.MeshStandardMaterial({ color: "#b4b5a2", map: gravel, roughness: 1 });
  const concrete = new T.MeshStandardMaterial({
    color: "#969d90",
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const pasture = new T.MeshStandardMaterial({ color: "#707d5b", map: gravel, roughness: 1 });
  const green = new T.MeshStandardMaterial({ color: "#4d5e41", roughness: 1 });
  const bark = new T.MeshStandardMaterial({ color: "#666353", roughness: 1 });
  const roofMat = new T.MeshStandardMaterial({ color: "#738079", roughness: 0.8, metalness: 0.32 });
  const wallMat = new T.MeshStandardMaterial({ color: "#b8bba9", roughness: 0.9 });
  resources.push(earth, concrete, pasture, green, bark, roofMat, wallMat);
  const mesh = (g: T.BufferGeometry, mat: T.Material, group = root) => {
    const item = new T.Mesh(g, mat);
    group.add(item);
    item.receiveShadow = true;
    resources.push(g);
    return item;
  };
  const worldUv = (geometry: T.BufferGeometry) => {
    const p = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1000 + 0.5, p.getY(i) / 1000 + 0.5);
    return geometry;
  };
  // Adjacent terrain annuli share boundaries and never overlap in depth. A
  // 2mm separation between kilometre-scale planes is not a stable depth order.
  const ground = mesh(worldUv(new T.CircleGeometry(11.84, 96)), earth);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.185;
  const outerGravel = mesh(worldUv(new T.RingGeometry(16, 28, 96)), earth);
  outerGravel.rotation.x = -Math.PI / 2;
  outerGravel.position.y = -0.185;
  const field = mesh(worldUv(new T.RingGeometry(28, 500, 96)), pasture);
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.185;
  // Narrow concrete apron and service lane read as a yard, never an infinite grid.
  const apron = mesh(new T.RingGeometry(11.84, 16, 96), concrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.177;
  const road = mesh(new T.PlaneGeometry(10, 74), concrete);
  road.rotation.x = -Math.PI / 2;
  road.position.set(22, -0.176, 17);
  const expansion = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: "#999d91", transparent: true, opacity: 0.32 }),
  );
  const seams: number[] = [];
  for (let z = -17; z < 54; z += 6) seams.push(17, -0.16, z, 27, -0.16, z);
  expansion.geometry.setAttribute("position", new T.Float32BufferAttribute(seams, 3));
  root.add(expansion);
  resources.push(expansion.geometry, expansion.material as T.Material);
  // Economical distant landscape: a tree line and low service shed for scale.
  const trunkGeometry = new T.CylinderGeometry(0.14, 0.23, 2.9, 5),
    leafGeometry = new T.IcosahedronGeometry(1.4, 0);
  resources.push(trunkGeometry, leafGeometry);
  const count = 26,
    trunks = new T.InstancedMesh(trunkGeometry, bark, count),
    leaves = new T.InstancedMesh(leafGeometry, green, count);
  const o = new T.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = 0.68 + (i / (count - 1)) * 4.65,
      radius = 44 + (i % 4) * 4.7,
      scale = 0.7 + ((i * 7) % 13) / 20;
    const x = Math.sin(angle) * radius,
      z = Math.cos(angle) * radius;
    o.position.set(x, 1.25, z);
    o.scale.setScalar(scale);
    o.rotation.set(0, i, 0);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
    o.position.set(x, 3.3 * scale, z);
    o.scale.set(1.45 * scale, 1.9 * scale, 1.35 * scale);
    o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix);
    leaves.setColorAt(
      i,
      new T.Color().setHSL(0.22 + (i % 3) * 0.009, 0.17, 0.24 + (i % 5) * 0.012),
    );
  }
  detail.add(trunks, leaves);
  const shed = mesh(new T.BoxGeometry(23, 4.2, 8), wallMat, detail);
  shed.position.set(-33, 1.9, -35);
  const shedRoof = mesh(new T.BoxGeometry(24, 0.16, 9.2), roofMat, detail);
  shedRoof.position.set(-33, 4.1, -35);
  shedRoof.rotation.z = -0.035;
  const door = mesh(new T.PlaneGeometry(5.4, 3.3), roofMat, detail);
  door.position.set(-33, 1.5, -30.99);
  let disposed = false;
  return {
    root,
    setQuality(quality: string) {
      // Preserve a distant context silhouette even on economy. Only the cheap
      // tree instance count changes; the service shed and ground never vanish.
      detail.visible = true;
      leaves.count = trunks.count = ["economic", "economy", "low"].includes(quality)
        ? 12
        : quality === "balanced"
          ? 20
          : 26;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach((resource) => resource.dispose());
      root.removeFromParent();
      root.clear();
    },
  };
}
