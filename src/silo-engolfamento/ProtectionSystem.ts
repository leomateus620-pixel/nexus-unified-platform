import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SILO_CONFIG, SUPPORT_ANGLES } from "./SiloConfig";
import { canonicalComponentId } from "./ComponentRegistry";

const UP = new T.Vector3(0, 1, 0),
  SEGMENTS = 24,
  SIDES = 6;
// Nexus visual connector assembly (not a manufacturer dimension). The domain's
// fixed length covers the whole chain; this reach is deducted from the rope.
const CONNECTOR_REACH = SILO_CONFIG.connectorReach.value;
/** Circular LVHF parametric representation. The domain is sole authority for the
 * moving eye and restraint. Guides and trolley are illustrative, not certified CAD. */
export function createProtection(
  anchorTuple: readonly [number, number, number],
  lineLength: number,
  _options: { roofTop: number } = { roofTop: SILO_CONFIG.roofTop.value },
) {
  const root = new T.Group();
  root.name = "LVHF_interna_circular_parametrica";
  const bindings = new Map<string, T.Object3D[]>(),
    geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const steel = new T.MeshStandardMaterial({ color: "#b5c2c6", metalness: 0.84, roughness: 0.32 });
  const charcoal = new T.MeshStandardMaterial({
    color: "#384d48",
    metalness: 0.64,
    roughness: 0.52,
  });
  const green = new T.MeshStandardMaterial({ color: "#829c3d", metalness: 0.42, roughness: 0.49 });
  const yellow = new T.MeshStandardMaterial({ color: "#ba9336", metalness: 0.59, roughness: 0.43 });
  const rubber = new T.MeshStandardMaterial({ color: "#263731", metalness: 0.1, roughness: 0.77 });
  const ropeMat = new T.MeshStandardMaterial({ color: "#e1d6ad", roughness: 0.93 });
  [steel, charcoal, green, yellow, rubber, ropeMat].forEach((mat) => materials.add(mat));
  const bind = (id: string, object: T.Object3D) => {
    object.userData["componentId"] = id;
    const list = bindings.get(id) ?? [];
    list.push(object);
    bindings.set(id, list);
  };
  const mesh = (
    group: T.Group,
    id: string,
    geometry: T.BufferGeometry,
    material: T.Material,
    position?: T.Vector3,
  ) => {
    geometries.add(geometry);
    const item = new T.Mesh(geometry, material);
    if (position) item.position.copy(position);
    item.receiveShadow = true;
    group.add(item);
    bind(id, item);
    return item;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    new T.BoxGeometry(w, h, d).translate(x, y, z);
  const beam = (a: number[], b: number[], radius: number) => {
    const p = new T.Vector3().fromArray(a),
      end = new T.Vector3().fromArray(b);
    const g = new T.CylinderGeometry(radius, radius, p.distanceTo(end), 8);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, end.clone().sub(p).normalize()));
    g.translate((p.x + end.x) / 2, (p.y + end.y) / 2, (p.z + end.z) / 2);
    return g;
  };
  const merged = (group: T.Group, id: string, parts: T.BufferGeometry[], material: T.Material) => {
    const g = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!g) throw new Error("Falha ao montar LVHF");
    return mesh(group, id, g, material);
  };
  const ringRadius = SILO_CONFIG.ringRadius.value,
    ringY = SILO_CONFIG.ringY.value;
  const cable = mesh(
    root,
    "lvhf.cable",
    new T.TorusGeometry(ringRadius, SILO_CONFIG.cableDiameter.value / 2, 6, 384).rotateX(
      Math.PI / 2,
    ),
    steel,
    new T.Vector3(0, ringY, 0),
  );
  cable.name = "Cabo_8mm_raio_10_926m";
  // Eleven main positions: Ancopro at zero, ten intermediate guides. Tensioner
  // is a separate adjacent fitting at 10.3°, not a twelfth equidistant support.
  for (let i = 0; i < SUPPORT_ANGLES.length; i++) {
    const angle = SUPPORT_ANGLES[i]!,
      id = i === 0 ? "lvhf.anchor" : `lvhf.passant.${String(i).padStart(2, "0")}`;
    const support = new T.Group();
    support.position.set(Math.sin(angle) * ringRadius, ringY, Math.cos(angle) * ringRadius);
    support.rotation.y = angle;
    root.add(support);
    const plate = box(0, 0.0015, 0.069, 0.16, 0.055, 0.01);
    // Outboard bracket leaves the nominal trolley travel plane visible.
    const bracket = beam([0, 0.019, 0.069], [0, 0.014, 0.016], 0.005);
    const bolts = [-0.054, 0.054].flatMap((x) =>
      [-0.014, 0.017].map((y) =>
        new T.CylinderGeometry(0.006, 0.006, 0.008, 6).rotateX(Math.PI / 2).translate(x, y, 0.062),
      ),
    );
    merged(support, id, [plate, bracket, ...bolts], charcoal);
    if (i === 0) {
      merged(
        support,
        id,
        [
          box(0, 0.02, 0.047, 0.097, 0.04, 0.018),
          new T.TorusGeometry(0.013, 0.004, 6, 16).rotateY(Math.PI / 2).translate(0, 0.023, 0.025),
        ],
        yellow,
      );
      // Termination sleeves beside the zero point, all in centimetre scale.
      for (const x of [-0.08, 0.08])
        mesh(
          support,
          id,
          new T.CylinderGeometry(0.008, 0.008, 0.04, 8)
            .rotateZ(Math.PI / 2)
            .translate(x, 0.016, 0.05),
          steel,
        );
    } else {
      // Upper guide and outboard plate leave the audited below-cable wheel/body
      // corridor clear. This is a declared kinematic cutaway, not original CAD.
      const points = Array.from({ length: 17 }, (_, j) => {
        const t = j / 16;
        return new T.Vector3(
          -0.137 + t * 0.274,
          0.012 + Math.sin(t * Math.PI) * 0.008,
          0.018 + Math.cos(t * Math.PI * 2) * 0.017,
        );
      });
      mesh(
        support,
        id,
        new T.TubeGeometry(new T.CatmullRomCurve3(points), 16, 0.004, 5, false),
        yellow,
      );
    }
  }
  const tensioner = new T.Group(),
    ta = SILO_CONFIG.tensionerAngle.value;
  tensioner.position.set(Math.sin(ta) * ringRadius, ringY, Math.cos(ta) * ringRadius);
  tensioner.rotation.y = ta;
  root.add(tensioner);
  merged(
    tensioner,
    "lvhf.tensioner",
    [
      box(0, 0.018, 0.05, 0.19, 0.028, 0.028),
      beam([-0.16, 0.018, 0.05], [-0.095, 0.018, 0.05], 0.009),
      beam([0.095, 0.018, 0.05], [0.16, 0.018, 0.05], 0.009),
    ],
    steel,
  );
  merged(
    tensioner,
    "lvhf.tensioner",
    [box(-0.074, 0.018, 0.05, 0.012, 0.038, 0.038), box(0.074, 0.018, 0.05, 0.012, 0.038, 0.038)],
    yellow,
  );
  // Visible threads, without inventing pretension, force or admissible travel.
  const threadParts: T.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++)
    for (const side of [-1, 1])
      threadParts.push(
        new T.TorusGeometry(0.009, 0.0013, 4, 8)
          .rotateY(Math.PI / 2)
          .translate(side * (0.103 + i * 0.006), 0.018, 0.05),
      );
  merged(tensioner, "lvhf.tensioner", threadParts, charcoal);

  const trolley = new T.Group();
  trolley.name = "Trole_1501_olhal_menos90mm";
  root.add(trolley);
  // Audited reference transform: local X tangent, +Y up, +Z radial outwards.
  // Source GLB has +Z vertical before Rx(-90°). Rollers run UNDER the cable;
  // their tops touch its lower surface (−4 mm), rather than passing through it.
  const wheelRadius = SILO_CONFIG.wheelDiameter.value / 2,
    wheels: T.Mesh[] = [];
  for (const x of [-0.0355, 0.0355]) {
    const wheel = mesh(
      trolley,
      "lvhf.trolley",
      new T.CylinderGeometry(wheelRadius, wheelRadius, 0.021, 20).rotateX(Math.PI / 2),
      steel,
      new T.Vector3(x, -0.021, 0),
    );
    wheels.push(wheel);
    mesh(
      trolley,
      "lvhf.trolley",
      new T.TorusGeometry(0.012, 0.003, 5, 16),
      rubber,
      new T.Vector3(x, -0.021, -0.011),
    );
  }
  // One outboard side plate, with a genuine opening around the eye. Bounds and
  // pivots are reconstructed from measurements, never copied mesh vertices.
  const plateShape = new T.Shape();
  plateShape.moveTo(-0.0475, -0.004);
  plateShape.lineTo(0.0475, -0.004);
  plateShape.lineTo(0.0475, -0.066);
  plateShape.lineTo(0.023, -0.104);
  plateShape.lineTo(-0.023, -0.104);
  plateShape.lineTo(-0.0475, -0.066);
  plateShape.closePath();
  const eyeHole = new T.Path();
  eyeHole.absarc(
    0,
    -SILO_CONFIG.trolleyEyeHoleOffset.value,
    SILO_CONFIG.trolleyEyeHoleRadius.value,
    0,
    Math.PI * 2,
    true,
  );
  plateShape.holes.push(eyeHole);
  const bodyPlate = new T.ExtrudeGeometry(plateShape, {
    depth: 0.01,
    bevelEnabled: false,
    curveSegments: 16,
  });
  bodyPlate.translate(0, 0, 0.0105);
  mesh(trolley, "lvhf.trolley", bodyPlate, green);
  merged(
    trolley,
    "lvhf.trolley",
    [
      box(0, -0.029, -0.0175, 0.044, 0.05, 0.006),
      beam([-0.0355, -0.021, -0.0325], [-0.0355, -0.021, 0.0295], 0.005),
      beam([0.0355, -0.021, -0.0325], [0.0355, -0.021, 0.0295], 0.005),
    ],
    steel,
  );
  const connector = new T.Group();
  trolley.add(connector);
  connector.position.set(
    0,
    -SILO_CONFIG.trolleyEyeOffset.value,
    SILO_CONFIG.trolleyEyeRadialOffset.value,
  );
  const carabiner = mesh(
    connector,
    "lvhf.connector",
    new T.TorusGeometry(0.017, 0.003, 8, 32).scale(0.72, 1.45, 1),
    yellow,
    new T.Vector3(0, -0.018, 0),
  );
  carabiner.rotation.y = Math.PI / 2;
  mesh(connector, "lvhf.connector", beam([0, -0.014, -0.012], [0, -0.035, -0.012], 0.0038), steel);

  const positions = new Float32Array((SEGMENTS + 1) * SIDES * 3),
    normals = new Float32Array(positions.length),
    indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++)
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k,
        b = i * SIDES + ((k + 1) % SIDES);
      indices.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  const geometry = new T.BufferGeometry(),
    pa = new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
    na = new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("position", pa);
  geometry.setAttribute("normal", na);
  geometry.setIndex(indices);
  const line = mesh(root, "lvhf.rope", geometry, ropeMat);
  line.frustumCulled = false;
  // Rounded visual finish of the same rope, not an additional certified fitting.
  // Its upper point contacts the lower bow at bearingY−47mm; the rope centre
  // remains at bearingY−52mm, preserving the domain's fixed connection length.
  const ropeTermination = mesh(root, "lvhf.rope", new T.SphereGeometry(0.005, 8, 6), ropeMat);
  ropeTermination.name = "Terminacao_arredondada_aproximada_da_corda";
  const anchor = new T.Vector3().fromArray(anchorTuple),
    ropeStart = new T.Vector3().fromArray(anchorTuple),
    direction = new T.Vector3(),
    tangent = new T.Vector3(),
    radialX = new T.Vector3(),
    radialY = new T.Vector3(),
    center = new T.Vector3(),
    normal = new T.Vector3(),
    bend = new T.Vector3();
  const originals = new Map<T.Mesh, T.Material | T.Material[]>();
  let endpointDistance = 0,
    disposed = false;
  const clearHighlight = () => {
    for (const [object, original] of originals) {
      const current = object.material;
      object.material = original;
      (Array.isArray(current) ? current : [current]).forEach((mat) => mat.dispose());
    }
    originals.clear();
  };
  return {
    root,
    bindings,
    update(
      harness: T.Vector3,
      tension: number,
      enabled = true,
      movingAnchor?: { x: number; y: number; z: number },
      distance?: number,
    ) {
      if (disposed) return;
      line.visible = enabled;
      ropeTermination.visible = enabled;
      trolley.visible = true;
      if (movingAnchor) anchor.set(movingAnchor.x, movingAnchor.y, movingAnchor.z);
      const angle = Math.atan2(anchor.x, anchor.z);
      trolley.position.set(
        anchor.x - Math.sin(angle) * SILO_CONFIG.trolleyEyeRadialOffset.value,
        anchor.y + SILO_CONFIG.trolleyEyeOffset.value,
        anchor.z - Math.cos(angle) * SILO_CONFIG.trolleyEyeRadialOffset.value,
      );
      trolley.rotation.y = angle;
      // These rollers contact the cable above their centres. Positive local X
      // travel requires positive Z spin: omega × (+Y radius) opposes that travel.
      const wheelRotation = (distance ?? angle * ringRadius) / wheelRadius;
      wheels.forEach((wheel) => {
        wheel.rotation.z = wheelRotation;
      });
      if (!enabled) return;
      direction.copy(harness).sub(anchor);
      endpointDistance = direction.length();
      // The eye datum is its lower bearing point. A vertical oval passes through
      // the measured hole and around the lower metal bridge. Tilting it towards
      // the rope would push its bow through that bridge. Rope bends at the
      // independent lower attachment; the domain uses this same vertical reach.
      ropeStart.copy(anchor);
      ropeStart.y -= CONNECTOR_REACH;
      ropeTermination.position.copy(ropeStart);
      direction.copy(harness).sub(ropeStart);
      const ropeDistance = direction.length();
      const slack = Math.max(0, lineLength - CONNECTOR_REACH - ropeDistance),
        sag =
          Math.min(
            0.12,
            ropeDistance * 0.2,
            Math.sqrt(slack * Math.max(0.01, ropeDistance)) * 0.3,
          ) *
          (1 - Math.min(1, Math.max(0, tension)));
      bend.set(0, -1, 0);
      if (ropeDistance > 1e-5)
        bend.addScaledVector(direction, direction.y / (ropeDistance * ropeDistance));
      if (bend.lengthSq() < 0.04) {
        bend.set(-Math.sin(angle), 0, -Math.cos(angle));
        if (ropeDistance > 1e-5)
          bend.addScaledVector(direction, -bend.dot(direction) / (ropeDistance * ropeDistance));
      }
      bend.normalize();
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        center
          .copy(ropeStart)
          .addScaledVector(direction, t)
          .addScaledVector(bend, Math.sin(Math.PI * t) ** 2 * sag);
        tangent
          .copy(direction)
          // Zero derivative at either connection keeps the tube normal to the
          // connector's lower tangent plane and clear of its solid bow.
          .addScaledVector(bend, Math.PI * Math.sin(Math.PI * t * 2) * sag)
          .normalize();
        radialX
          .crossVectors(tangent, Math.abs(tangent.y) > 0.98 ? normal.set(1, 0, 0) : UP)
          .normalize();
        radialY.crossVectors(tangent, radialX).normalize();
        for (let k = 0; k < SIDES; k++) {
          const a = (k / SIDES) * Math.PI * 2;
          normal.copy(radialX).multiplyScalar(Math.cos(a)).addScaledVector(radialY, Math.sin(a));
          const offset = (i * SIDES + k) * 3;
          positions[offset] = center.x + normal.x * 0.005;
          positions[offset + 1] = center.y + normal.y * 0.005;
          positions[offset + 2] = center.z + normal.z * 0.005;
          normals[offset] = normal.x;
          normals[offset + 1] = normal.y;
          normals[offset + 2] = normal.z;
        }
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
    },
    setHighlight(part: string | null) {
      clearHighlight();
      if (!part) return;
      for (const object of bindings.get(canonicalComponentId(part)) ?? [])
        object.traverse((node) => {
          if (!(node instanceof T.Mesh)) return;
          originals.set(node, node.material);
          const list = (Array.isArray(node.material) ? node.material : [node.material]).map(
            (material) => {
              const copy = material.clone();
              if (copy instanceof T.MeshStandardMaterial) {
                copy.emissive.set("#92c83e");
                copy.emissiveIntensity = 0.3;
              }
              return copy;
            },
          );
          node.material = Array.isArray(node.material) ? list : list[0]!;
        });
    },
    get endpointDistance() {
      return endpointDistance;
    },
    get ropeAttachment() {
      return ropeStart;
    },
    get connectorReach() {
      return CONNECTOR_REACH;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearHighlight();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      root.removeFromParent();
      root.clear();
      bindings.clear();
    },
  };
}
export type ProtectionSystem = ReturnType<typeof createProtection>;
