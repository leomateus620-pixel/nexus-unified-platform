import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { CruzArea, CruzLine, CruzPart, GroundPoint, SceneLayers } from "./scene-types";
import { center, extent, inside, type SpatialIndex } from "./spatial";

type Vertex = [number, number, number];
function perimeter(p: GroundPoint[]) {
  return p.filter(([x, z], i) => {
    const next = p[(i + 1) % p.length];
    return next && (next[0] !== x || next[1] !== z);
  });
}
function triangles(p: GroundPoint[]) {
  return T.ShapeUtils.triangulateShape(
    p.map(([x, z]) => new T.Vector2(x, z)),
    [],
  );
}
function profile(part: CruzPart) {
  const p = perimeter(part.footprint);
  const edge = p
    .map(
      ([x, z], i) => [p[(i + 1) % p.length]![0] - x, p[(i + 1) % p.length]![1] - z] as GroundPoint,
    )
    .sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0]!;
  const [dx, dz] = part.axis ?? edge,
    len = Math.hypot(dx, dz) || 1;
  const along = ([x, z]: GroundPoint) => (x * dx + z * dz) / len;
  const across = ([x, z]: GroundPoint) => (z * dx - x * dz) / len;
  const distances = p.map(across),
    lo = Math.min(...distances),
    width = Math.max(0.001, Math.max(...distances) - lo);
  const t = (v: GroundPoint) => (across(v) - lo) / width;
  const h = (v: GroundPoint) => {
    const u = T.MathUtils.clamp(t(v), 0, 1);
    const rise =
      part.roof === "gable"
        ? 1 - Math.abs(2 * u - 1)
        : part.roof === "arc"
          ? 4 * u * (1 - u)
          : part.roof === "mono"
            ? u
            : 0;
    return part.eave + rise * part.rise;
  };
  const steps = part.roof === "arc" ? 16 : part.roof === "gable" ? 2 : 1;
  return { p, along, across, t, h, steps };
}
function clip(poly: GroundPoint[], at: number, t: (p: GroundPoint) => number, above: boolean) {
  const out: GroundPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!,
      ta = t(a),
      tb = t(b);
    const keepA = above ? ta >= at : ta <= at,
      keepB = above ? tb >= at : tb <= at;
    if (keepA) out.push(a);
    if (keepA !== keepB) {
      const u = (at - ta) / (tb - ta);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}
function meshGeometry(positions: number[], uvs?: number[]) {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  if (uvs) geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
function shell(part: CruzPart) {
  const { p, h, t, along, across, steps } = profile(part);
  const roof: number[] = [],
    wall: number[] = [],
    uv: number[] = [],
    parapet: number[] = [];
  for (const [i, j, k] of triangles(p)) {
    const face = [p[i!]!, p[j!]!, p[k!]!];
    for (let s = 0; s < steps; s++) {
      const band = clip(clip(face, s / steps, t, true), (s + 1) / steps, t, false);
      for (let n = 1; n + 1 < band.length; n++)
        for (const v of [band[0]!, band[n + 1]!, band[n]!]) {
          roof.push(v[0], h(v), v[1]);
          uv.push(along(v), across(v));
        }
    }
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!,
      b = p[(i + 1) % p.length]!,
      ta = t(a),
      tb = t(b);
    const cuts = [0, 1];
    for (let s = 1; s < steps; s++) {
      const cut = (s / steps - ta) / (tb - ta);
      if (cut > 0 && cut < 1) cuts.push(cut);
    }
    cuts.sort((a, b) => a - b);
    const interpolate = (fraction: number): GroundPoint => [
      a[0] + (b[0] - a[0]) * fraction,
      a[1] + (b[1] - a[1]) * fraction,
    ];
    for (let j = 1; j < cuts.length; j++) {
      const v = interpolate(cuts[j - 1]!),
        w = interpolate(cuts[j]!);
      const bottom = part.base ?? 0,
        vh = h(v),
        wh = h(w);
      const quad = (buffer: number[], v1: number, w1: number, v2: number, w2: number) => {
        buffer.push(
          v[0],
          v1,
          v[1],
          w[0],
          w1,
          w[1],
          v[0],
          v2,
          v[1],
          v[0],
          v2,
          v[1],
          w[0],
          w1,
          w[1],
          w[0],
          w2,
          w[1],
        );
      };
      quad(wall, bottom, bottom, vh, wh);
      if (part.parapet)
        quad(
          parapet,
          vh,
          wh,
          part.eave + part.rise + part.parapet.height,
          part.eave + part.rise + part.parapet.height,
        );
    }
  }
  return {
    roof: meshGeometry(roof, uv),
    wall: meshGeometry(wall),
    parapet: parapet.length ? meshGeometry(parapet) : null,
  };
}
function groundFace(a: CruzArea, y: number) {
  const p = perimeter(a.footprint),
    pos: number[] = [],
    uv: number[] = [];
  for (const face of triangles(p))
    for (const i of face.slice().reverse()) {
      const [x, z] = p[i]!;
      pos.push(x, y, z);
      uv.push(x / 12, z / 12);
    }
  return meshGeometry(pos, uv);
}
const technicalColors = { montada: 0x146957, "a-montar": 0xdb731f, fora: 0x737780 };
export function buildModel(
  parts: CruzPart[],
  lines: CruzLine[],
  context: CruzArea[],
  index: SpatialIndex,
  invalidate: () => void,
) {
  const root = new T.Group(),
    layers = {
      edificacoes: new T.Group(),
      equipamentos: new T.Group(),
      entorno: new T.Group(),
      lvhf: new T.Group(),
    };
  root.add(...Object.values(layers));
  const material = (color: T.ColorRepresentation, roughness: number, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
  const walls = material("#a9aea5", 0.88),
    roof = material("#bbc3c2", 0.48, 0.22),
    steel = material("#aaaead", 0.44, 0.34),
    tank = material("#d2d0c7", 0.52, 0.17);
  const paint = new Map<string, T.Material>();
  const textures: T.Texture[] = [];
  const loader = new T.TextureLoader();
  const normal = loader.load("/textures/3tentos/galvanized-normal.png", invalidate);
  normal.wrapS = normal.wrapT = T.RepeatWrapping;
  normal.anisotropy = 4;
  normal.repeat.set(0.7, 1);
  textures.push(normal);
  roof.normalMap = normal;
  roof.normalScale.set(0.2, 0.2);
  function metalFinish(pattern: "rings" | "seams" | "sheet") {
    const tile = document.createElement("canvas");
    tile.width = 512;
    tile.height = 256;
    const brush = tile.getContext("2d")!;
    brush.fillStyle = "#f0ede4";
    brush.fillRect(0, 0, 512, 256);
    if (pattern === "rings") {
      for (let y = 0; y < 256; y += 2) {
        brush.fillStyle = y % 16 === 0 ? "#aaa99f" : "#d6d5ca";
        brush.fillRect(0, y, 512, y % 16 === 0 ? 1.5 : 0.7);
      }
      for (let x = 0; x < 512; x += 32) {
        brush.fillStyle = "#bfc0b9";
        brush.fillRect(x, 0, 1, 256);
      }
    } else {
      const step = pattern === "seams" ? 16 : 32;
      for (let x = 0; x < 512; x += step) {
        brush.fillStyle = "#c2c4be";
        brush.fillRect(x, 0, pattern === "seams" ? 2 : 3, 256);
        brush.fillStyle = "#fafaf4";
        brush.fillRect(x + 3, 0, 2, 256);
      }
    }
    const texture = new T.CanvasTexture(tile);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    textures.push(texture);
    return texture;
  }
  const siloWall = material("#b2b5af", 0.5, 0.27),
    siloRoof = material("#c5c8c4", 0.43, 0.26);
  siloWall.map = metalFinish("rings");
  siloRoof.map = metalFinish("seams");
  roof.map = metalFinish("sheet");
  roof.map.repeat.set(0.28, 0.15);
  const weathered = roof.clone();
  weathered.color.set("#a99685");
  weathered.roughness = 0.68;
  const darker = roof.clone();
  darker.color.set("#9c9d95");
  darker.roughness = 0.67;
  const bright = roof.clone();
  bright.color.set("#dbdcd4");
  const areaMaterials = {
    via: material("#80817a", 0.96),
    ferrovia: material("#76766e", 0.92),
    vegetacao: material("#75846a", 0.98),
    agua: material("#799593", 0.38),
    patio: material("#b3ad9d", 0.94),
    vizinhanca: material("#9b9f93", 0.91),
  };
  const gravel = loader.load("/textures/3tentos/gravel-base.png", invalidate);
  gravel.colorSpace = T.SRGBColorSpace;
  gravel.wrapS = gravel.wrapT = T.RepeatWrapping;
  gravel.anisotropy = 4;
  textures.push(gravel);
  areaMaterials.patio.map = gravel;
  // Background silhouettes carry no technical-object IDs or ownership links.
  const treeMatrices: T.Matrix4[] = [],
    treeColors: T.Color[] = [];
  let seed = 20260824;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const treeGeo = new T.IcosahedronGeometry(1, 1),
    treeMat = material("#819173", 0.96);
  const backgroundRoof = material("#b0b3a8", 0.75, 0.07);
  const backdropWalls = material("#a2a69a", 0.88);
  const levels = {
    vizinhanca: 0.025,
    patio: 0.04,
    vegetacao: 0.055,
    agua: 0.06,
    via: 0.075,
    ferrovia: 0.09,
  };
  for (const a of context)
    if (a.footprint.length > 2) {
      const m = new T.Mesh(groundFace(a, levels[a.kind]), areaMaterials[a.kind]);
      m.receiveShadow = true;
      layers.entorno.add(m);
      const bb = extent(a.footprint);
      if (a.kind === "vegetacao") {
        const spacing=Math.max(bb.east-bb.west,bb.south-bb.north)>180?10:5.9;
        for (let x = bb.west; x < bb.east; x += spacing)
          for (let z = bb.north; z < bb.south; z += spacing*.93) {
            const px = x + random() * spacing*.74,
              pz = z + random() * spacing*.74;
            if (!inside(px, pz, a.footprint)) continue;
            const w = spacing*(.5+random()*.42),
              h = 2.8+random()*2.95;
            treeMatrices.push(
              new T.Matrix4().makeScale(w, h, w * 0.93).setPosition(px, h * 0.8, pz),
            );
            treeColors.push(
              new T.Color().setHSL(
                0.23 + random() * 0.035,
                0.12 + random() * 0.12,
                0.39 + random() * 0.14,
              ),
            );
          }
      }
      if (a.kind === "vizinhanca") {
        const circular = a.footprint.length > 12;
        if (circular) {
          const [x, z] = center(bb),
            r = (bb.east - bb.west) / 2,
            estimatedHeight = r * 1.45;
          const wall = new T.Mesh(new T.CylinderGeometry(r, r, estimatedHeight, 24), backdropWalls);
          const cap = new T.Mesh(new T.ConeGeometry(r, r * 0.45, 24), backgroundRoof);
          wall.position.set(x, estimatedHeight / 2, z);
          cap.position.set(x, estimatedHeight + r * 0.225, z);
          wall.castShadow = cap.castShadow = true;
          layers.entorno.add(wall, cap);
        } else {
          const mass = shell({ id: "", footprint: a.footprint, eave: 5, rise: 1.9, roof: "gable" });
          const wall = new T.Mesh(mass.wall, backdropWalls),
            cap = new T.Mesh(mass.roof, backgroundRoof);
          wall.castShadow = cap.castShadow = true;
          layers.entorno.add(wall, cap);
        }
      }
      if (a.kind === "ferrovia" && a.footprint.length === 4) {
        const [a0, a1, a2, a3] = a.footprint;
        const from = new T.Vector3((a0![0] + a3![0]) / 2, 0.14, (a0![1] + a3![1]) / 2),
          to = new T.Vector3((a1![0] + a2![0]) / 2, 0.14, (a1![1] + a2![1]) / 2);
        const delta = to.clone().sub(from),
          perp = new T.Vector3(-delta.z, 0, delta.x).normalize();
        for (const side of [-0.63, 0.63]) {
          const geo = new T.BoxGeometry(0.085, 0.09, delta.length());
          const rail = new T.Mesh(geo, steel);
          rail.position.copy(from).lerp(to, 0.5).addScaledVector(perp, side);
          rail.lookAt(rail.position.clone().add(delta));
          layers.entorno.add(rail);
        }
      }
    }
  const canopy = new T.InstancedMesh(treeGeo, treeMat, treeMatrices.length);
  treeMatrices.forEach((m, i) => {
    canopy.setMatrixAt(i, m);
    canopy.setColorAt(i, treeColors[i]!);
  });
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  layers.entorno.add(canopy);
  const candidates: T.Object3D[] = [];
  const highlightParts = new Map<string, { geo: T.BufferGeometry; matrix: T.Matrix4 }[]>();
  function register(id: string, geo: T.BufferGeometry, matrix = new T.Matrix4()) {
    const list = highlightParts.get(id) ?? [];
    list.push({ geo, matrix });
    highlightParts.set(id, list);
  }
  const staticBatches = new Map<
    T.Group,
    Map<T.Material, { id: string; geo: T.BufferGeometry }[]>
  >();
  const faceIds = new Map<T.Object3D, { end: number; id: string }[]>();
  const instanceIds = new Map<T.Object3D, string[]>();
  const barGeo = new T.BoxGeometry(1, 1, 1);
  for (const p of parts.filter((p) => p.roof !== "tank" && p.roof !== "silo")) {
    if (p.footprint.length < 3) continue;
    const g = shell(p),
      layer = layers[p.layer ?? "edificacoes"];
    const structure =
      index.chains.get(p.id)?.find((id) => index.byId.get(id)?.kind === "estrutura") ?? p.id;
    const add = (geo: T.BufferGeometry, mat: T.Material, id: string) => {
      if (!staticBatches.has(layer)) staticBatches.set(layer, new Map());
      const batches = staticBatches.get(layer)!;
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat)!.push({ id, geo });
      register(id, geo);
    };
    const roofMaterial = ["cobertura-11", "cobertura-12"].includes(p.id)
      ? weathered
      : p.bracing || p.roof === "flat"
        ? darker
        : ["cobertura-02", "cobertura-08", "cobertura-56"].includes(p.id)
          ? bright
          : p.id === "cobertura-03"
            ? darker
            : roof;
    add(g.roof, roofMaterial, p.id);
    if(p.id==="cobertura-28.1"){
      g.wall.dispose();
      const deck=p.base??8.6;
      const columns:T.Matrix4[]=[];
      for(let i=0;i<4;i++){
        const a=p.footprint[i]!,b=p.footprint[(i+1)%4]!;
        const n=i%2===0?3:1;
        for(let j=0;j<n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;
          columns.push(new T.Matrix4().makeScale(.24,p.eave-deck,.24).setPosition(x,(deck+p.eave)/2,z));
        }
      }
      const posts=new T.InstancedMesh(barGeo,steel,columns.length);columns.forEach((matrix,i)=>posts.setMatrixAt(i,matrix));
      posts.castShadow=posts.receiveShadow=true;layer.add(posts);candidates.push(posts);instanceIds.set(posts,columns.map(()=>p.id));
    } else if (!p.bracing) add(g.wall, walls, structure);
    else {
      g.wall.dispose();
      const matrices: T.Matrix4[] = [];
      const beam = (a: T.Vector3, b: T.Vector3, r: number) => {
        const delta = b.clone().sub(a),
          matrix = new T.Matrix4().compose(
            a.clone().lerp(b, 0.5),
            new T.Quaternion().setFromUnitVectors(
              new T.Vector3(0, 1, 0),
              delta.clone().normalize(),
            ),
            new T.Vector3(r, delta.length(), r),
          );
        matrices.push(matrix);
      };
      const base = p.base ?? 0;
      const v = (point: GroundPoint, y: number) => new T.Vector3(point[0], y, point[1]);
      for (let i = 0; i < p.footprint.length; i++) {
        const a = v(p.footprint[i]!, base),
          b = v(p.footprint[(i + 1) % p.footprint.length]!, base);
        if (p.bracing === "tower") {
          const levels = Math.max(1, Math.round((p.eave - base) / 3.9));
          beam(a, a.clone().setY(p.eave), 0.19);
          for (let k = 0; k < levels; k++) {
            const h1 = base + ((p.eave - base) * k) / levels,
              h2 = base + ((p.eave - base) * (k + 1)) / levels;
            beam(a.clone().setY(h1), b.clone().setY(h1), 0.15);
            beam(a.clone().setY(h1), b.clone().setY(h2), 0.15);
          }
          continue;
        }
        const n = Math.max(1, Math.round(a.distanceTo(b) / 3.4));
        beam(a, b, 0.16);
        beam(a.clone().setY(p.eave), b.clone().setY(p.eave), 0.15);
        for (let j = 0; j < n; j++) {
          const start = a.clone().lerp(b, j / n),
            end = a.clone().lerp(b, (j + 1) / n);
          beam(start, start.clone().setY(p.eave), 0.12);
          if (j % 2 === 0) end.y = p.eave;
          else start.y = p.eave;
          beam(start, end, 0.13);
        }
      }
      const bars = new T.InstancedMesh(barGeo, steel, matrices.length);
      matrices.forEach((m, i) => bars.setMatrixAt(i, m));
      bars.castShadow = bars.receiveShadow = true;
      layer.add(bars);
      instanceIds.set(
        bars,
        matrices.map(() => p.id),
      );
      candidates.push(bars);
    }
    if (g.parapet && p.parapet) {
      const key = p.parapet.color ?? "#b8bcb6";
      if (!paint.has(key)) paint.set(key, material(key, 0.55, 0.16));
      add(g.parapet, paint.get(key)!, p.id);
    }
  }
  for (const [layer, batches] of staticBatches)
    for (const [mat, list] of batches) {
      // All source geometries are already in the local metric frame.
      // Prefix sums keep the pick ID stable when draw calls are batched.
      const merged = mergeGeometries(list.map((entry) => entry.geo));
      if (!merged) throw Error("A geometria das superfícies é incompatível.");
      const mesh = new T.Mesh(merged, mat);
      let end = 0;
      faceIds.set(
        mesh,
        list.map((entry) => ({
          id: entry.id,
          end: (end += entry.geo.getAttribute("position").count / 3),
        })),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      layer.add(mesh);
      candidates.push(mesh);
    }
  type Batch = {
    instances: T.InstancedMesh;
    ids: string[];
    matrices: T.Matrix4[];
    centers: T.Vector3[];
    high: boolean;
  };
  const batches: Batch[] = [];
  for (const kind of ["tank", "silo"] as const) {
    const cylinders = parts.filter((p) => p.roof === kind);
    if (!cylinders.length) continue;
    for (const cap of [false, true]) {
      const specs = cylinders.filter((p) => !cap || p.rise > 0);
      if (!specs.length) continue;
      const matrices: T.Matrix4[] = [],
        centers: T.Vector3[] = [],
        ids: string[] = [];
      for (const p of specs) {
        const e = extent(p.footprint),
          [x, z] = center(e);
        const height = cap ? p.rise : p.eave - (p.base ?? 0),
          y = (cap ? p.eave : (p.base ?? 0)) + height / 2;
        matrices.push(
          new T.Matrix4()
            .makeScale((e.east - e.west) / 2, height, (e.south - e.north) / 2)
            .setPosition(x, y, z),
        );
        centers.push(new T.Vector3(x, y, z));
        ids.push(p.id);
      }
      for (const high of [true, false]) {
        const geo = new T.CylinderGeometry(cap ? 0 : 1, 1, 1, high ? 64 : 32);
        const m = new T.InstancedMesh(
          geo,
          kind === "silo" ? (cap ? siloRoof : siloWall) : tank,
          specs.length,
        );
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = m.receiveShadow = true;
        if (high) for (let i = 0; i < ids.length; i++) register(ids[i]!, geo, matrices[i]!);
        layers.equipamentos.add(m);
        candidates.push(m);
        instanceIds.set(m, []);
        batches.push({ instances: m, ids, matrices, centers, high });
      }
    }
  }
  function updateLod(camera: T.Camera, sortDistance: number) {
    for (const b of batches) {
      const ids = instanceIds.get(b.instances)!;
      ids.length = 0;
      for (let i = 0; i < b.ids.length; i++) {
        const distance =
          camera instanceof T.OrthographicCamera
            ? sortDistance
            : camera.position.distanceTo(b.centers[i]!);
        if (distance < 130 !== b.high) continue;
        b.instances.setMatrixAt(ids.length, b.matrices[i]!);
        ids.push(b.ids[i]!);
      }
      b.instances.count = ids.length;
      b.instances.instanceMatrix.needsUpdate = true;
      b.instances.boundingSphere = null;
    }
  }
  const profiles = parts.filter((p) => p.footprint.length > 2).map((p) => ({ p, h: profile(p).h }));
  const lineMaterials = new Map<string, LineMaterial>();
  for (const line of lines) {
    if (line.points.length < 2) continue;
    const parent = index.byId.get(line.id)?.parent;
    const matches = profiles.filter(({ p }) => p.id === parent || p.id === line.id);
    const vertices: number[] = [];
    for (let i = 0; i < line.points.length; i++) {
      const a = line.points[i]!,
        b = line.points[i + 1];
      const n = b ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5)) : 1;
      for (let j = 0; j < n; j++) {
        const v: GroundPoint = b
          ? [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]
          : a;
        const surfaces = matches.length
          ? matches
          : profiles.filter(({ p }) => inside(...v, p.footprint));
        vertices.push(
          v[0],
          0.17 + (line.y ?? Math.max(0.12, ...surfaces.map((s) => s.h(v)))),
          v[1],
        );
      }
    }
    if (!lineMaterials.has(line.status))
      lineMaterials.set(
        line.status,
        new LineMaterial({
          color: technicalColors[line.status],
          linewidth: 3,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
    const geom = new LineGeometry().setPositions(vertices);
    const mesh = new Line2(geom, lineMaterials.get(line.status)!);
    mesh.userData["id"] = line.id;
    layers.lvhf.add(mesh);
    candidates.push(mesh);
  }
  const selected = new T.Group();
  root.add(selected);
  const selectionMat = new T.MeshBasicMaterial({
    color: "#39a893",
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const outlineMat = new T.LineBasicMaterial({
    color: "#154c4e",
    transparent: true,
    opacity: 0.95,
  });
  let selectedId: string | null = null;
  function highlight(id: string | null, visible: SceneLayers) {
    selectedId = id;
    for (const child of selected.children)
      if (child instanceof T.LineSegments) child.geometry.dispose();
    selected.clear();
    if (!id) return;
    const target = index.byId.get(id),
      focusId = target?.kind === "lvhf" ? target.parent : id;
    for (const [key, entries] of highlightParts) {
      if (!focusId || !index.chains.get(key)?.includes(focusId)) continue;
      const info = parts.find((p) => p.id === key),
        equipment =
          info && (info.layer === "equipamentos" || info.roof === "silo" || info.roof === "tank");
      if (!visible[equipment ? "equipamentos" : "edificacoes"]) continue;
      for (const entry of entries) {
        const fill = new T.Mesh(entry.geo, selectionMat),
          edge = new T.LineSegments(new T.EdgesGeometry(entry.geo, 6), outlineMat);
        fill.applyMatrix4(entry.matrix);
        edge.applyMatrix4(entry.matrix);
        selected.add(fill, edge);
      }
    }
  }
  function setLayers(visible: SceneLayers) {
    for (const key of Object.keys(layers) as (keyof typeof layers)[])
      layers[key].visible = visible[key];
    highlight(selectedId, visible);
  }
  function pick(ray: T.Raycaster) {
    const hits = ray.intersectObjects(
      candidates.filter((m) => m.parent?.visible),
      false,
    );
    const first = hits[0];
    if (first?.faceIndex != null && faceIds.has(first.object)) {
      const face = first.faceIndex;
      return faceIds.get(first.object)!.find((range) => face < range.end)?.id;
    }
    if (!first) return null;
    return (
      first.instanceId === undefined
        ? first.object.userData["id"]
        : instanceIds.get(first.object)?.[first.instanceId]
    ) as string | undefined;
  }
  function dispose() {
    const geos = new Set<T.BufferGeometry>(),
      mats = new Set<T.Material>([
        walls,
        roof,
        steel,
        tank,
        selectionMat,
        outlineMat,
        siloRoof,
        siloWall,
        weathered,
        darker,
        bright,
        treeMat,
        backgroundRoof,
        backdropWalls,
        ...paint.values(),
        ...Object.values(areaMaterials),
        ...lineMaterials.values(),
      ]);
    root.traverse((obj) => {
      if (obj instanceof T.Mesh || obj instanceof T.LineSegments) geos.add(obj.geometry);
      if (obj instanceof T.InstancedMesh) obj.dispose();
    });
    for (const entries of highlightParts.values()) for (const entry of entries) geos.add(entry.geo);
    geos.add(barGeo);
    for (const geo of geos) geo.dispose();
    for (const m of mats) m.dispose();
    for (const tex of textures) tex.dispose();
  }
  return { root, highlight, setLayers, pick, updateLod, dispose };
}
