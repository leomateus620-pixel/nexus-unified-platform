import fs from "node:fs";
import { PerspectiveCamera, Vector3 } from "three";
const file = "src/industrial/data/site.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ground = (x, z) => [(x - 616) * 0.16, 0, (z - 539) * 0.16];
const silo = (i) => {
  const e = data.elements[i],
    g = e.geometry;
  return [e.position[0], g.bodyHeight + g.baseHeight + g.coneHeight, e.position[2]];
};
// Hand-picked correspondences; fitting residuals are NOT independent validation.
const landmarks = {
  A: [
    { id: "ground-upper-left", point: ground(190, 155), pixel: [173, 145] },
    { id: "ground-upper-right", point: ground(1190, 155), pixel: [1290, 211] },
    { id: "ground-lower-right", point: ground(1190, 947), pixel: [1364, 930] },
    { id: "ground-lower-left", point: ground(190, 931), pixel: [27, 857] },
    ...[
      [546, 347],
      [716, 351],
      [536, 462],
      [708, 466],
    ].map((pixel, i) => ({ id: `SILO-0${i + 1}-roof-apex`, point: silo(i), pixel })),
  ],
  C: [
    { id: "ground-upper-left", point: ground(190, 155), pixel: [1390, 884] },
    { id: "ground-upper-right", point: ground(1190, 155), pixel: [44, 849] },
    { id: "ground-lower-right", point: ground(1190, 947), pixel: [202, 95] },
    { id: "ground-lower-left", point: ground(190, 931), pixel: [1210, 83] },
    ...[
      [846, 432],
      [681, 434],
      [848, 323],
      [691, 326],
    ].map((pixel, i) => ({ id: `SILO-0${i + 1}-roof-apex`, point: silo(i), pixel })),
  ],
};
function project(params, point) {
  const [x, y, z, tx, tz, fov] = params;
  const camera = new PerspectiveCamera(fov, 1448 / 1086, 0.1, 5000);
  camera.position.set(x, y, z);
  camera.lookAt(tx, 0, tz);
  camera.updateMatrixWorld(true);
  const p = new Vector3(...point).project(camera);
  return [(p.x + 1) * 724, (1 - p.y) * 543];
}
function optimize(fn, initial) {
  const n = initial.length;
  let simplex = [
    initial,
    ...initial.map((_, i) => initial.map((v, j) => v + (i === j ? (i === 5 ? 3 : 12) : 0))),
  ];
  for (let step = 0; step < 1800; step++) {
    simplex.sort((a, b) => fn(a) - fn(b));
    const best = simplex[0],
      worst = simplex[n];
    const center = initial.map((_, i) => simplex.slice(0, n).reduce((s, p) => s + p[i], 0) / n);
    const r = center.map((v, i) => v + (v - worst[i])),
      fr = fn(r);
    if (fr < fn(best)) {
      const e = center.map((v, i) => v + 2 * (r[i] - v));
      simplex[n] = fn(e) < fr ? e : r;
    } else if (fr < fn(simplex[n - 1])) simplex[n] = r;
    else {
      const c = center.map((v, i) => v + 0.5 * (worst[i] - v));
      if (fn(c) < fn(worst)) simplex[n] = c;
      else
        simplex = simplex.map((p, i) => (i ? p.map((v, j) => best[j] + 0.5 * (v - best[j])) : p));
    }
  }
  return simplex.sort((a, b) => fn(a) - fn(b))[0];
}
const report = {
  method:
    "Least-squares camera-only adjustment to 8 manual correspondences per oblique photo. Geometry fixed. No metric accuracy or independent validation.",
  views: {},
};
for (const id of ["A", "C"]) {
  const c = data.cameras[id],
    initial = [...c.position, c.target[0], c.target[2], c.fov];
  const score = (p) => {
    if (
      p[1] < 50 ||
      p[1] > 1500 ||
      p[5] < 18 ||
      p[5] > 70 ||
      Math.abs(p[0]) > 500 ||
      (id === "A" ? p[2] < 40 : p[2] > -40)
    )
      return 1e12;
    return landmarks[id].reduce((sum, l) => {
      const xy = project(p, l.point);
      return sum + Math.hypot(xy[0] - l.pixel[0], xy[1] - l.pixel[1]) ** 2;
    }, 0);
  };
  const result = optimize(score, initial);
  data.cameras[id] = {
    ...c,
    position: result.slice(0, 3).map((v) => +v.toFixed(5)),
    target: [+result[3].toFixed(5), 0, +result[4].toFixed(5)],
    fov: +result[5].toFixed(5),
  };
  const points = landmarks[id].map((l) => ({
    ...l,
    projected: project(result, l.point),
    errorPixels: Math.hypot(...project(result, l.point).map((v, i) => v - l.pixel[i])),
  }));
  report.views[id] = {
    camera: data.cameras[id],
    rmsPixels: Math.sqrt(points.reduce((s, p) => s + p.errorPixels ** 2, 0) / points.length),
    points,
  };
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
fs.writeFileSync("docs/industrial/evidence/camera-fitting.json", JSON.stringify(report, null, 2));
console.log(
  Object.fromEntries(
    Object.entries(report.views).map(([id, v]) => [
      id,
      { rmsPixels: v.rmsPixels, camera: v.camera },
    ]),
  ),
);
