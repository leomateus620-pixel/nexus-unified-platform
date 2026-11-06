import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { visualGroundHeight } from "./terrain";

/** All terrain layers share the same world Z strips. Heights vary only with Z.
 * Independent recursive triangulations previously crossed on the graded yard:
 * a nominal 4 cm clearance could become negative between unrelated vertices.
 * Splitting on common contour lines makes each layer exactly parallel. */
export function conformTerrain(source: BufferGeometry, offset: number, spacing = 2) {
  const positions = source.getAttribute("position");
  const index = source.index;
  const count = index?.count ?? positions.count;
  const vertices: number[] = [];
  const clip = (polygon: Vector3[], z: number, above: boolean) => {
    const result: Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!;
      const da = above ? a.z - z : z - a.z,
        db = above ? b.z - z : z - b.z;
      if (da >= -1e-8) result.push(a);
      if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8))
        result.push(a.clone().lerp(b, da / (da - db)));
    }
    return result;
  };
  const height = (z: number) => {
    const low = Math.floor(z / spacing) * spacing;
    const t = (z - low) / spacing;
    return visualGroundHeight(0, low) * (1 - t) + visualGroundHeight(0, low + spacing) * t + offset;
  };
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(positions, index ? index.getX(i + k) : i + k),
    );
    const min = Math.min(...triangle.map((v) => v.z)),
      max = Math.max(...triangle.map((v) => v.z));
    for (let z = Math.floor(min / spacing) * spacing; z < max + 1e-8; z += spacing) {
      const polygon = clip(clip(triangle, z, true), z + spacing, false);
      for (let k = 1; k < polygon.length - 1; k++) {
        const points = [polygon[0]!, polygon[k]!, polygon[k + 1]!];
        if (
          new Vector3()
            .subVectors(points[1]!, points[0]!)
            .cross(new Vector3().subVectors(points[2]!, points[0]!))
            .lengthSq() < 1e-12
        )
          continue;
        for (const p of points) vertices.push(p.x, height(p.z), p.z);
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  result.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array((vertices.length / 3) * 2), 2),
  );
  result.computeVertexNormals();
  source.dispose();
  return result;
}
