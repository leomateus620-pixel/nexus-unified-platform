import { BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";

/** Bake glTF node transforms without writing back into quantized integer data.
 * A crown may extend past 1 local unit; normalized Int16 writes would wrap those
 * coordinates and turn leaves into long triangles. Keep indices/UVs untouched.
 */
export function bakePrototypeGeometry(source: BufferGeometry, transform: Matrix4) {
  const geometry = source.clone();
  for (const name of ["position", "normal", "tangent"]) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++)
      for (let c = 0; c < attribute.itemSize; c++)
        values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
  }
  return geometry.applyMatrix4(transform);
}
