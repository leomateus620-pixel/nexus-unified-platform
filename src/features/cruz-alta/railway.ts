import * as T from "three";
import { exposedBallast, localGroundHeight, railwayAxes } from "./site-ground";

// Perfil esquemático, dimensões aparentes. Manter os eixos cadastrados na rev. 56.
const gauge = 1.26;
const profile: Array<[number, number]> = [
  [-0.065, 0],
  [0.065, 0],
  [0.065, 0.018],
  [0.013, 0.032],
  [0.012, 0.104],
  [0.035, 0.113],
  [0.039, 0.142],
  [0.033, 0.152],
  [-0.033, 0.152],
  [-0.039, 0.142],
  [-0.035, 0.113],
  [-0.012, 0.104],
  [-0.013, 0.032],
  [-0.065, 0.018],
];

function mesh(positions: number[], material: T.Material) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const result = new T.Mesh(geometry, material);
  result.receiveShadow = true;
  return result;
}

export function railway() {
  const root = new T.Group();
  root.name = "Via permanente";
  const polished = new T.MeshStandardMaterial({
    color: "#a5a5a0",
    metalness: 0.62,
    roughness: 0.43,
  });
  const webs = new T.MeshStandardMaterial({ color: "#61534a", metalness: 0.31, roughness: 0.72 });
  const tie = new T.MeshStandardMaterial({ roughness: 0.92 });
  const tieShape = new T.BoxGeometry(1.96, 0.12, 0.235);
  const head: number[] = [],
    web: number[] = [];
  const stretches: { mesh: T.InstancedMesh; box: T.Box3 }[] = [];
  const pose = new T.Object3D();
  const weathered = ["#524940", "#817364", "#696156", "#746457"].map((c) => new T.Color(c));
  for (const axis of railwayAxes) {
    const flare = 2.4 / axis.length;
    const stations = [
      0,
      flare,
      0.15 - flare,
      0.15,
      0.15 + flare,
      0.8 - flare,
      0.8,
      0.8 + flare,
      1 - flare,
      1,
    ];
    for (const side of [-gauge / 2, gauge / 2]) {
      const slices = stations.map((t) => {
        const [cx, cz] = axis.point(t, side);
        const exposure = Math.max(
          0,
          Math.min(1, (0.15 + flare - t) / flare),
          Math.min(1, (t - 0.8 + flare) / flare),
        );
        const foot = localGroundHeight(cx, cz) - 0.116 + exposure * 0.181;
        return profile.map(([s, h]) => {
          const [x, z] = axis.point(t, s + side);
          return [x, foot + h, z];
        });
      });
      for (let j = 1; j < slices.length; j++) {
        for (let i = 0; i < profile.length; i++) {
          const next = (i + 1) % profile.length;
          const a = slices[j - 1]![i]!,
            b = slices[j - 1]![next]!,
            c = slices[j]![next]!,
            d = slices[j]![i]!;
          (i >= 5 && i <= 8 ? head : web).push(...a, ...c, ...b, ...a, ...d, ...c);
        }
      }
    }
    for (const [start, end] of exposedBallast) {
      const from = start + flare,
        to = end - flare;
      const count = Math.floor(((to - from) * axis.length) / 0.67);
      const sleepers = new T.InstancedMesh(tieShape, tie, count);
      pose.rotation.y = Math.atan2(axis.to[0] - axis.from[0], axis.to[1] - axis.from[1]);
      for (let i = 0; i < count; i++) {
        const [x, z] = axis.point(from + ((i + 0.5) * 0.67) / axis.length);
        pose.position.set(x, localGroundHeight(x, z) + 0.005, z);
        pose.updateMatrix();
        sleepers.setMatrixAt(i, pose.matrix);
        sleepers.setColorAt(i, weathered[(i * 7 + count) % weathered.length]!);
      }
      sleepers.receiveShadow = true;
      sleepers.visible = false;
      sleepers.computeBoundingBox();
      sleepers.computeBoundingSphere();
      stretches.push({ mesh: sleepers, box: sleepers.boundingBox! });
      root.add(sleepers);
    }
  }
  root.add(mesh(head, polished), mesh(web, webs));
  return {
    root,
    update(eye: T.Vector3, economical: boolean) {
      for (const { mesh, box } of stretches) {
        const threshold = economical ? 48 : 90;
        const distance = box.distanceToPoint(eye);
        mesh.visible = distance < threshold + (mesh.visible ? 13 : 0);
      }
    },
  };
}
