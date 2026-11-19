import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { HorizonControls } from "./regional-types";
import { paintRoof, tankColor } from "./acabamentos";
import { palette as c } from "./paleta";
import { gableCladding } from "./cladding";
import { siloFinish, siloCapColor } from "./silo-finish";
import { openRoof, raisedRoof, roofFrames } from "./roof-supports";
import { createGroundContext } from "./environment";
import { shell, profile } from "./geometry";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { CruzArea, CruzLine, CruzPart, GroundPoint, SceneLayers } from "./scene-types";
import { center, extent, inside, type SpatialIndex } from "./spatial";

const technicalColors = { montada: 0x146957, "a-montar": 0xdb731f, fora: 0x737780 };
export function buildModel(
  parts: CruzPart[],
  lines: CruzLine[],
  context: CruzArea[],
  index: SpatialIndex,
  invalidate: () => void,
  maxAnisotropy = 8,
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
    tank = material("#ffffff", 0.52, 0.17);
  const paint = new Map<string, T.Material>();
  const textures: T.Texture[] = [];
  const loader = new T.TextureLoader();
  const normal = loader.load("/textures/3tentos/galvanized-normal.png", invalidate);
  normal.wrapS = normal.wrapT = T.RepeatWrapping;
  normal.anisotropy = maxAnisotropy;
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
      for (let y = 0; y < 256; y += 3) {
        brush.fillStyle = y % 21 === 0 ? "#a4a8a5" : "#d2d7d4";
        brush.fillRect(0, y, 512, y % 21 === 0 ? 1.4 : 0.7);
      }
      // The side stiffeners repeat around the shell. In the photo the hoop bands occupy the upper third.
      for (let x = 0; x < 512; x += 8) {
        brush.fillStyle = "#989f9e";
        brush.fillRect(x, 0, 1.4, 256);
        brush.fillStyle = "#fffdf4";
        brush.fillRect(x + 1.6, 0, 1.2, 256);
      }
      for (let y = 5; y < 103; y += 19) {
        brush.fillStyle = "#838b8a";
        brush.fillRect(0, y, 512, 2);
      }
    } else {
      const step = pattern === "seams" ? 16 : 32;
      for (let x = 0; x < 512; x += step) {
        const v = 0.5 + 0.5 * Math.sin(12.7 * x + 1.6) * Math.cos(2.7 * x);
        brush.fillStyle = "rgba(120,104,81," + v * (pattern === "seams" ? 0.17 : 0.07) + ")";
        brush.fillRect(x, 0, step, 256);
        brush.fillStyle = "#bcbeb5";
        brush.fillRect(x, 0, pattern === "seams" ? 2.5 : 3, 256);
        brush.fillStyle = "#fafaf4";
        brush.fillRect(x + 3, 0, 1.5, 256);
      }
      if (pattern === "seams") {
        for (let y = 22; y < 256; y += 71) {
          brush.fillStyle = "#adb2aa";
          brush.fillRect(0, y, 512, 1.8);
        }
      }
    }
    const texture = new T.CanvasTexture(tile);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    textures.push(texture);
    return texture;
  }
  const siloWall = material(c.siloCostado, 0.5, 0.27),
    siloRoof = material("#ffffff", 0.43, 0.26);
  siloWall.map = metalFinish("rings");
  siloRoof.map = metalFinish("seams");
  roof.map = metalFinish("sheet");
  roof.map.repeat.set(0.28, 0.15);
  const sheetWall = roof.clone();
  sheetWall.color.set("#b3bbb8");
  sheetWall.roughness = 0.71;
  sheetWall.metalness = 0.17;
  sheetWall.normalScale.set(0.24, 0.24);
  const oxidizedWall = sheetWall.clone();
  oxidizedWall.color.set("#ffffff");
  oxidizedWall.map = gableCladding(maxAnisotropy);
  textures.push(oxidizedWall.map);
  oxidizedWall.roughness = 0.8;
  const splitMetal = roof.clone();
  splitMetal.color.set("#ffffff");
  splitMetal.vertexColors = true;
  splitMetal.roughness = 0.58;
  const weathered = roof.clone();
  weathered.color.set("#a99685");
  weathered.roughness = 0.68;
  const darker = roof.clone();
  darker.color.set("#9c9d95");
  darker.roughness = 0.67;
  const bright = roof.clone();
  bright.color.set("#dbdcd4");
  const boilerWall = sheetWall.clone();
  boilerWall.color.set("#945045");
  boilerWall.roughness = 0.64;
  const louverWall = sheetWall.clone();
  louverWall.color.set("#59615e");
  louverWall.roughness = 0.74;
  const djiBox = sheetWall.clone();
  djiBox.color.set(c.caixa56);
  const galleryMetal = steel.clone();
  galleryMetal.color.set(c.galeria);
  const innerSteel = steel.clone();
  innerSteel.color.set(c.caldeiraAco);
  innerSteel.roughness = 0.62;
  const cavacoRed = sheetWall.clone();
  cavacoRed.color.set(c.tintaCavaco);
  cavacoRed.roughness = 0.67;
  const prepPanel = sheetWall.clone();
  prepPanel.color.set(c.preparacaoFachada);
  const footConcrete = walls.clone();
  footConcrete.color.set(c.siloBase);
  const environment: ReturnType<typeof createGroundContext> & Partial<HorizonControls> =
    createGroundContext(context, index, invalidate, parts, maxAnisotropy);
  layers.entorno.add(environment.root);
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
  const curved: { id: string; low: T.Mesh; high?: T.Mesh }[] = [];
  const details: (() => void)[] = [];
  let disposed = false,
    matteEnabled = false;
  function loadDetails() {
    if (disposed || !details.length) return;
    const pending = details.splice(0, 2);
    for (const addDetail of pending) addDetail();
    invalidate();
  }
  const lodInfo = new Map<string, { center: T.Vector3; diameter: number; near: boolean }>();
  function trackLod(p: CruzPart) {
    const e = extent(p.footprint),
      [x, z] = center(e);
    const width =
      p.roof === "arc"
        ? Math.max(...p.footprint.map(profile(p).across)) -
          Math.min(...p.footprint.map(profile(p).across))
        : e.east - e.west;
    lodInfo.set(p.id, { center: new T.Vector3(x, p.eave, z), diameter: width, near: false });
  }
  for (const p of parts.filter((p) => p.roof !== "tank" && p.roof !== "silo")) {
    if (p.footprint.length < 3) continue;
    const g = shell(p, p.roof === "arc" ? 18 : undefined),
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
    const roofMaterial = [
      "cobertura-11",
      "cobertura-12",
      "cobertura-03",
      "cobertura-04",
      "cobertura-05",
      "cobertura-13",
      "cobertura-57",
    ].includes(p.id)
      ? weathered
      : p.bracing || p.roof === "flat"
        ? darker
        : ["cobertura-02", "cobertura-08", "cobertura-35", "cobertura-56"].includes(p.id)
          ? bright
          : p.id === "cobertura-51"
            ? darker
            : roof;
    if (p.id === "cobertura-11") {
      // DJI 0044, May 2026: contrasting sheets at the ridge and four rows of round roof terminals.
      const roofProfile = profile(p);
      const a = p.footprint[0]!,
        b = p.footprint[1]!,
        c = p.footprint[3]!,
        d = p.footprint[2]!;
      const start = new T.Vector2((a[0] + c[0]) / 2, (a[1] + c[1]) / 2),
        end = new T.Vector2((b[0] + d[0]) / 2, (b[1] + d[1]) / 2);
      const axis = end.clone().sub(start),
        length = axis.length();
      axis.normalize();
      const normal = new T.Vector2(-axis.y, axis.x);
      const yImage = [234, 210, 195, 180, 170, 160, 153, 147, 142, 137, 133, 129, 125, 122, 119];
      const caps = new T.InstancedMesh(
        new T.CylinderGeometry(0.27, 0.41, 0.52, 12),
        steel,
        yImage.length * 4,
      );
      const focal = 800,
        tilt = Math.atan((337.5 - 57) / focal),
        slope = (v: number) => Math.tan(tilt + Math.atan((v - 337.5) / focal));
      const eyeDist = (length * slope(117)) / (slope(258) - slope(117)),
        eyeRise = eyeDist * slope(258);
      const m = new T.Matrix4();
      let instance = 0;
      for (const v of yImage)
        for (const offset of [-2.3, -0.78, 0.78, 2.3]) {
          const at = start
            .clone()
            .addScaledVector(
              axis,
              T.MathUtils.clamp((eyeRise - 0.26) / slope(v) - eyeDist, 0.5, length - 0.5),
            )
            .addScaledVector(normal, offset);
          m.makeTranslation(at.x, roofProfile.h([at.x, at.y]) + 0.24, at.y);
          caps.setMatrixAt(instance++, m);
        }
      caps.castShadow = caps.receiveShadow = true;
      layer.add(caps);
      instanceIds.set(caps, Array(instance).fill(p.id));
      candidates.push(caps);
    }
    const calibrated = paintRoof(g.roof, p);
    if (p.roof === "arc") {
      const mat = calibrated ? splitMetal : roofMaterial;
      const low = new T.Mesh(g.roof, mat);
      const addMesh = (m: T.Mesh) => {
        m.userData["id"] = p.id;
        m.castShadow = m.receiveShadow = true;
        layer.add(m);
        candidates.push(m);
      };
      addMesh(low);
      register(p.id, g.roof);
      trackLod(p);
      const pair: { id: string; low: T.Mesh; high?: T.Mesh } = { id: p.id, low };
      curved.push(pair);
      details.push(() => {
        const fine = shell(p, 72);
        fine.wall.dispose();
        fine.gable?.dispose();
        fine.parapet?.dispose();
        if (calibrated) paintRoof(fine.roof, p);
        const high = new T.Mesh(fine.roof, mat);
        high.visible = false;
        addMesh(high);
        pair.high = high;
        if (matteEnabled) {
          painted.set(high, mat);
          high.material = clay;
        }
      });
    } else add(g.roof, calibrated ? splitMetal : roofMaterial, p.id);
    if (p.id === "cobertura-56") {
      // Three lower corners were intersected with the roof plane from the DJI 0044 pose.
      // The top lies at roughly 12.4 m in the relative frame. No equipment function or absolute datum is inferred.
      const [a, b, c, d] = p.footprint as [GroundPoint, GroundPoint, GroundPoint, GroundPoint];
      const at = (u: number, v: number): GroundPoint => [
        (1 - v) * (a[0] + u * (b[0] - a[0])) + v * (d[0] + u * (c[0] - d[0])),
        (1 - v) * (a[1] + u * (b[1] - a[1])) + v * (d[1] + u * (c[1] - d[1])),
      ];
      const footprint = [at(0.18, 0.04), at(0.76, 0.04), at(0.76, 0.23), at(0.18, 0.23)];
      const mount = Math.min(...footprint.map(profile(p).h));
      const housing = shell({
        ...p,
        footprint,
        roof: "mono",
        base: mount - 0.12,
        eave: 12.36,
        rise: 0.16,
      });
      add(housing.wall, djiBox, p.id);
      add(housing.roof, bright, p.id);
    }
    if (g.gable) add(g.gable, p.id === "cobertura-08" ? cavacoRed : oxidizedWall, structure);
    if (openRoof(p) || raisedRoof(p)) {
      // The Preparação assembly explicitly shows a band of open posts between the wall and both upper roofs.
      const deck = raisedRoof(p) ? p.eave - 1.4 : (p.base ?? 0);
      if (raisedRoof(p)) {
        const body = shell({ id: p.id, footprint: p.footprint, roof: "flat", eave: deck, rise: 0 });
        add(body.wall, prepPanel, structure);
        add(body.roof, darker, structure);
      }
      if (["cobertura-57", "cobertura-08", "cobertura-35"].includes(p.id))
        add(g.wall, p.id === "cobertura-35" ? boilerWall : sheetWall, structure);
      else g.wall.dispose();
      const profileHeight = profile(p).h;
      const frames = roofFrames(p),
        columns: T.Matrix4[] = [];
      function insert(a: T.Vector3, b: T.Vector3, width: number, depth = width) {
        const vector = b.clone().sub(a);
        if (vector.length() < 0.005) return;
        columns.push(
          new T.Matrix4().compose(
            a.clone().lerp(b, 0.5),
            new T.Quaternion().setFromUnitVectors(
              new T.Vector3(0, 1, 0),
              vector.clone().normalize(),
            ),
            new T.Vector3(width, vector.length(), depth),
          ),
        );
      }
      const v = ([x, z]: GroundPoint, y: number) => new T.Vector3(x, y, z);
      for (const [a, b] of frames) {
        const ah = profileHeight(a),
          bh = profileHeight(b);
        insert(v(a, deck), v(a, ah), 0.24);
        insert(v(b, deck), v(b, bh), 0.24);
        const low = Math.min(ah, bh) - 0.32;
        if (p.id !== "cobertura-08") insert(v(a, low), v(b, low), 0.16);
        if (!["cobertura-08", "cobertura-28.1"].includes(p.id) && !raisedRoof(p)) {
          const bays = 6;
          for (let j = 0; j < bays; j++) {
            const at = (k: number): GroundPoint => [
              a[0] + ((b[0] - a[0]) * k) / bays,
              a[1] + ((b[1] - a[1]) * k) / bays,
            ];
            const start = at(j),
              end = at(j + 1);
            insert(
              v(start, j % 2 ? low : profileHeight(start) - 0.09),
              v(end, j % 2 ? profileHeight(end) - 0.09 : low),
              0.1,
            );
          }
        }
      }
      // Folded edge at the perimeter provides a finite roof rim when viewed from the yard.
      for (let i = 0; i < p.footprint.length; i++) {
        const a = p.footprint[i]!,
          b = p.footprint[(i + 1) % 4]!,
          n = p.roof === "gable" ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const at = (k: number): GroundPoint => [
            a[0] + ((b[0] - a[0]) * k) / n,
            a[1] + ((b[1] - a[1]) * k) / n,
          ];
          const start = at(j),
            end = at(j + 1);
          insert(
            v(start, profileHeight(start) - 0.13),
            v(end, profileHeight(end) - 0.13),
            0.24,
            0.18,
          );
        }
      }
      if (p.id === "cobertura-35") {
        // Three horizontal levels are discernible through the east-facing bay in the 72 s video frame.
        for (const k of [0.27, 0.53, 0.77])
          insert(v(p.footprint[0]!, p.eave * k), v(p.footprint[1]!, p.eave * k), 0.19);
      }
      const posts = new T.InstancedMesh(
        barGeo,
        p.id === "cobertura-35" ? innerSteel : steel,
        columns.length,
      );
      columns.forEach((m, i) => posts.setMatrixAt(i, m));
      posts.castShadow = posts.receiveShadow = true;
      layer.add(posts);
      candidates.push(posts);
      instanceIds.set(
        posts,
        columns.map(() => p.id),
      );
    } else if (!p.bracing) {
      const wallMaterial =
        p.id === "cobertura-06"
          ? louverWall
          : ["cobertura-16", "cobertura-35", "cobertura-33", "cobertura-34"].includes(p.id)
            ? boilerWall
            : p.id === "cobertura-11"
              ? sheetWall
              : [
                    "cobertura-03",
                    "cobertura-04",
                    "cobertura-05",
                    "cobertura-06",
                    "cobertura-46",
                    "cobertura-56",
                  ].includes(p.id)
                ? sheetWall
                : walls;
      add(g.wall, wallMaterial, structure);
    } else {
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
      const bars = new T.InstancedMesh(barGeo, galleryMetal, matrices.length);
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
      const key = ["cobertura-27", "cobertura-27.1", "cobertura-28"].includes(p.id)
        ? c.preparacaoPintura
        : (p.parapet.color ?? "#b8bcb6");
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
    colors: T.Color[] | null;
    order: string;
    high: boolean;
  };
  const batches: Batch[] = [];
  for (const kind of ["tank", "silo"] as const) {
    const cylinders = parts.filter((p) => p.roof === kind);
    if (!cylinders.length) continue;
    cylinders.forEach(trackLod);
    for (const cap of [false, true]) {
      const specs = cylinders.filter((p) => !cap || p.rise > 0);
      if (!specs.length) continue;
      const matrices: T.Matrix4[] = [],
        colors =
          kind === "tank"
            ? specs.map((p) => tankColor(p.id, cap))
            : cap
              ? specs.map((p) => siloCapColor(p.id))
              : null,
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
        if (colors) m.setColorAt(0, colors[0]!);
        batches.push({ instances: m, ids, matrices, colors, high, order: "pending" });
      }
    }
  }
  for (const { mesh, ids } of siloFinish(parts, galleryMetal, footConcrete)) {
    layers.equipamentos.add(mesh);
    candidates.push(mesh);
    instanceIds.set(mesh, ids);
  }
  const plainWhite = new T.Color(0xffffff);
  const viewAxis = new T.Vector3(),
    relative = new T.Vector3();
  function updateLod(
    camera: T.PerspectiveCamera | T.OrthographicCamera,
    height: number,
    tier: string,
  ) {
    camera.getWorldDirection(viewAxis);
    const ortho = camera instanceof T.OrthographicCamera;
    const pixelScale = ortho
      ? (height * camera.zoom) / (camera.top - camera.bottom)
      : height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
    let near = 0;
    for (const entry of lodInfo.values()) {
      const depth = relative.copy(entry.center).sub(camera.position).dot(viewAxis);
      const pixels = (entry.diameter * pixelScale) / (ortho ? 1 : Math.max(0.1, depth));
      entry.near =
        depth > 0 &&
        pixels >
          (entry.near
            ? tier === "economico"
              ? 66
              : tier === "equilibrado"
                ? 52
                : 40
            : tier === "economico"
              ? 91
              : tier === "equilibrado"
                ? 74
                : 60);
      if (entry.near) near++;
    }
    for (const pair of curved) {
      if (pair.high) {
        pair.high.visible = lodInfo.get(pair.id)!.near;
        pair.low.visible = !pair.high.visible;
      }
    }
    for (const b of batches) {
      const order = b.ids.map((id) => Number(lodInfo.get(id)!.near === b.high)).join("");
      if (b.order === order) continue;
      b.order = order;
      const ids = instanceIds.get(b.instances)!;
      ids.length = 0;
      for (let i = 0; i < b.ids.length; i++) {
        if (lodInfo.get(b.ids[i]!)!.near !== b.high) continue;
        b.instances.setMatrixAt(ids.length, b.matrices[i]!);
        if (b.colors) b.instances.setColorAt(ids.length, matteEnabled ? plainWhite : b.colors[i]!);
        ids.push(b.ids[i]!);
      }
      b.instances.count = ids.length;
      if (b.instances.instanceColor) b.instances.instanceColor.needsUpdate = true;
      b.instances.instanceMatrix.needsUpdate = true;
      b.instances.boundingSphere = null;
    }
    return { near, distant: lodInfo.size - near };
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
  function nearest(ray: T.Raycaster) {
    return ray.intersectObjects(
      candidates.filter((m) => m.visible && m.parent?.visible),
      false,
    )[0];
  }
  function pick(ray: T.Raycaster) {
    const first = nearest(ray);
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
  const clay = material("#acb2a8", 0.98);
  const painted = new Map<T.Mesh, T.Material | T.Material[]>();
  function matte(enabled: boolean) {
    matteEnabled = enabled;
    for (const b of batches) if (b.colors) b.order = "refresh";
    for (const key of ["edificacoes", "equipamentos"] as const) {
      layers[key].traverse((obj) => {
        if (!(obj instanceof T.Mesh)) return;
        if (enabled) {
          if (!painted.has(obj)) painted.set(obj, obj.material);
          obj.material = clay;
        } else {
          const original = painted.get(obj);
          if (original) obj.material = original;
        }
      });
    }
    if (!enabled) painted.clear();
  }
  function dispose() {
    disposed = true;
    details.length = 0;
    const geos = new Set<T.BufferGeometry>(),
      mats = new Set<T.Material>([
        clay,
        footConcrete,
        prepPanel,
        djiBox,
        galleryMetal,
        innerSteel,
        cavacoRed,
        boilerWall,
        louverWall,
        sheetWall,
        oxidizedWall,
        walls,
        roof,
        steel,
        tank,
        selectionMat,
        outlineMat,
        splitMetal,
        siloRoof,
        siloWall,
        weathered,
        darker,
        bright,
        ...paint.values(),
        ...lineMaterials.values(),
      ]);
    environment.root.removeFromParent();
    environment.dispose();
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
  return {
    root,
    highlight,
    setLayers,
    pick,
    nearest,
    matte,
    updateLod,
    loadDetails,
    dispose,
    showHorizon: (enabled: boolean) => environment.setRegion?.(enabled),
    horizonInfo: () => environment.regionInfo?.() ?? null,
    regionFrame: (eye: T.Vector3) => environment.updateRegion?.(eye),
  };
}
