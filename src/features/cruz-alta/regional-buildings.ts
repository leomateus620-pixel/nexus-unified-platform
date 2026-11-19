import * as T from "three";

/** Exterior urban context, never entered into the unit's technical registry. */
export async function urbanSilhouette(
  signal: AbortSignal,
  heightAt: (x: number, z: number) => number,
) {
  const r = await fetch("/models/cruz-alta/edificacoes-vizinhanca.json", { signal });
  if (!r.ok) throw new Error("Contornos urbanos indisponíveis.");
  const data: { unitsPerMetre: number; objects: [number, number[]][] } = await r.json();
  const vertices: number[] = [],
    colors: number[] = [];
  const roofColor = new T.Color("#b8aca0"),
    wallColor = new T.Color("#9f9d8e");
  function vertex(x: number, z: number, y: number, roof: boolean, shade: number) {
    vertices.push(x, y, z);
    const c = roof ? roofColor : wallColor;
    colors.push(c.r * shade, c.g * shade, c.b * shade);
  }
  for (const [levels, coords] of data.objects) {
    const ring: T.Vector2[] = [];
    for (let i = 0; i < coords.length - 1; i += 2)
      ring.push(
        new T.Vector2(coords[i]! / data.unitsPerMetre, coords[i + 1]! / data.unitsPerMetre),
      );
    if (!T.ShapeUtils.isClockWise(ring)) ring.reverse();
    const center = ring.reduce((p, v) => p.add(v), new T.Vector2()).multiplyScalar(1 / ring.length);
    const level = heightAt(center.x, center.y),
      eave = level + (levels || 1) * 3;
    const roof = T.ShapeUtils.triangulateShape(ring, []);
    for (const tri of roof)
      for (const id of [tri[0]!, tri[2]!, tri[1]!]) {
        const v = ring[id]!;
        vertex(v.x, v.y, eave, true, 1);
      }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      const floorA = Math.min(level, heightAt(a.x, a.y)) - 0.25,
        floorB = Math.min(level, heightAt(b.x, b.y)) - 0.25;
      vertex(a.x, a.y, floorA, false, 0.85);
      vertex(b.x, b.y, eave, false, 1);
      vertex(a.x, a.y, eave, false, 1);
      vertex(a.x, a.y, floorA, false, 0.85);
      vertex(b.x, b.y, floorB, false, 0.85);
      vertex(b.x, b.y, eave, false, 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mesh = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  mesh.name = "Edificações do entorno urbano · OpenStreetMap";
  return mesh;
}
