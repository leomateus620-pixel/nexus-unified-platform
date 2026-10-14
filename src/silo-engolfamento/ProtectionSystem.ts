import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SILO } from "./GrainField";

const UP = new THREE.Vector3(0, 1, 0);
const SEGMENTS = 16;
const SIDES = 5;

function beam(a: readonly number[], b: readonly number[], width: number, depth: number) {
  const start = new THREE.Vector3().fromArray(a),
    end = new THREE.Vector3().fromArray(b);
  const geometry = new THREE.BoxGeometry(width, start.distanceTo(end), depth);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(UP, end.clone().sub(start).normalize()),
  );
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  return geometry;
}
function merge(parts: THREE.BufferGeometry[], material: THREE.Material) {
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error("Falha ao montar suporte da proteção");
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Presentation only: the simulation applies the geometric displacement limit first.
 * This separate floor-supported frame is an illustrative engineered solution,
 * without manufacturer, certification, rated load or an automatic rescue function.
 */
export function createProtection(
  anchorTuple: readonly [number, number, number],
  lineLength: number,
  options: { roofTop: number } = { roofTop: SILO.roofTop },
) {
  const root = new THREE.Group();
  root.name = "Sistema_de_restricao_ilustrativo";
  const anchor = new THREE.Vector3().fromArray(anchorTuple);
  const supportMat = new THREE.MeshStandardMaterial({
    color: "#344d50",
    roughness: 0.67,
    metalness: 0.48,
  });
  const deviceMat = new THREE.MeshStandardMaterial({
    color: "#c78325",
    roughness: 0.61,
    metalness: 0.35,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: "#acb9bc",
    roughness: 0.34,
    metalness: 0.68,
  });
  const ropeMat = new THREE.MeshStandardMaterial({ color: "#f5ddb2", roughness: 0.96 });
  const parts: THREE.BufferGeometry[] = [];
  const frameY = options.roofTop + 0.45;
  const innerSupportY = anchor.y + 0.3;
  // The load path visibly reaches foundations rather than assigning the roof,
  // galvanized shell or guardrail an unverified structural anchorage function.
  for (const x of [-3.4, 3.4]) {
    parts.push(beam([x, 0.12, -0.8], [x, frameY, -0.8], 0.16, 0.18));
    parts.push(beam([x, frameY - 1.4, -0.8], [x > 0 ? x - 0.8 : x + 0.8, frameY, -0.8], 0.1, 0.1));
    const foundation = new THREE.BoxGeometry(0.5, 0.1, 0.48);
    foundation.translate(x, 0.11, -0.8);
    parts.push(foundation);
  }
  parts.push(beam([-3.4, frameY, -0.8], [3.4, frameY, -0.8], 0.19, 0.24));
  parts.push(beam([0, frameY, -0.8], [0, frameY, 0], 0.15, 0.15));
  // A centred hanger passes through the model's inspection collar, above the
  // roof and within its existing central opening. No wall/roof bears this frame.
  parts.push(beam([0, frameY, 0], [0, innerSupportY, 0], 0.1, 0.1));
  parts.push(beam([0, innerSupportY, 0], [anchor.x, innerSupportY, anchor.z], 0.15, 0.15));
  const support = merge(parts, supportMat);
  support.name = "Estrutura_independente_ancoragem";
  root.add(support);
  const deviceBody = new THREE.CylinderGeometry(0.11, 0.11, 0.19, 12);
  deviceBody.rotateX(Math.PI / 2);
  deviceBody.translate(anchor.x, anchor.y + 0.13, anchor.z);
  const deviceBracket = beam(
    [anchor.x, innerSupportY, anchor.z],
    [anchor.x, anchor.y + 0.12, anchor.z],
    0.08,
    0.1,
  );
  const device = merge([deviceBody, deviceBracket], deviceMat);
  device.name = "Dispositivo_comprimento_preajustado";
  root.add(device);
  const anchorRing = new THREE.TorusGeometry(0.045, 0.009, 6, 14);
  anchorRing.translate(anchor.x, anchor.y, anchor.z);
  // Exterior rescue means remain stowed. No animation lifts a buried worker.
  const winch = new THREE.CylinderGeometry(0.13, 0.13, 0.17, 12);
  winch.rotateZ(Math.PI / 2);
  winch.translate(-3.4, 1.2, -0.8);
  const crank = beam([-3.5, 1.2, -0.8], [-3.5, 1.03, -0.8], 0.023, 0.023);
  const fittings = merge([anchorRing, winch, crank], metalMat);
  fittings.name = "Ancoragem_e_meio_resgate_recolhido";
  root.add(fittings);
  const positions = new Float32Array((SEGMENTS + 1) * SIDES * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++)
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k,
        b = i * SIDES + ((k + 1) % SIDES);
      const c = a + SIDES,
        d = b + SIDES;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const normalAttribute = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("normal", normalAttribute);
  geometry.setIndex(indices);
  const line = new THREE.Mesh(geometry, ropeMat);
  line.name = "Linha_ancoragem_ao_ponto_dorsal";
  line.frustumCulled = false;
  root.add(line);
  const direction = new THREE.Vector3(),
    tangent = new THREE.Vector3();
  const radialX = new THREE.Vector3(),
    radialY = new THREE.Vector3();
  const center = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    bend = new THREE.Vector3();
  let disposed = false;
  let endpointDistance = 0;
  return {
    root,
    update(harness: THREE.Vector3, tension: number, enabled = true) {
      if (disposed) return;
      line.visible = enabled;
      device.visible = enabled;
      if (!enabled) return;
      direction.copy(harness).sub(anchor);
      endpointDistance = direction.length();
      const slack = Math.max(0, lineLength - endpointDistance);
      const sag =
        Math.min(0.36, Math.sqrt(slack * Math.max(0.01, endpointDistance)) * 0.43) *
        (1 - Math.min(1, Math.max(0, tension)));
      // Project gravity perpendicular to the line. A nearly vertical line
      // needs a lateral bow, otherwise a vertical offset still looks taut.
      // This curve depicts controlled slack; it is not a catenary or rope solver.
      bend.set(0, -1, 0);
      if (endpointDistance > 1e-5)
        bend.addScaledVector(direction, direction.y / (endpointDistance * endpointDistance));
      if (bend.lengthSq() < 0.04) {
        bend.set(0, 0, 1);
        if (endpointDistance > 1e-5)
          bend.addScaledVector(direction, -direction.z / (endpointDistance * endpointDistance));
      }
      bend.normalize();
      // Reuse an 85-vertex tube. Both exact endpoints are sampled in this same frame.
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        center.copy(anchor).addScaledVector(direction, t);
        center.addScaledVector(bend, Math.sin(Math.PI * t) * sag);
        tangent.copy(direction).addScaledVector(bend, Math.PI * Math.cos(Math.PI * t) * sag);
        tangent.normalize();
        radialX
          .crossVectors(tangent, Math.abs(tangent.y) > 0.98 ? normal.set(1, 0, 0) : UP)
          .normalize();
        radialY.crossVectors(tangent, radialX).normalize();
        for (let k = 0; k < SIDES; k++) {
          const angle = (k / SIDES) * Math.PI * 2;
          normal
            .copy(radialX)
            .multiplyScalar(Math.cos(angle))
            .addScaledVector(radialY, Math.sin(angle));
          const offset = (i * SIDES + k) * 3;
          positions[offset] = center.x + normal.x * 0.01;
          positions[offset + 1] = center.y + normal.y * 0.01;
          positions[offset + 2] = center.z + normal.z * 0.01;
          normals[offset] = normal.x;
          normals[offset + 1] = normal.y;
          normals[offset + 2] = normal.z;
        }
      }
      positionAttribute.needsUpdate = true;
      normalAttribute.needsUpdate = true;
    },
    setHighlight(part: "anchor" | "line" | "harness" | "gate" | null) {
      supportMat.emissive.set(part === "anchor" ? "#527778" : "#000000");
      deviceMat.emissive.set(part === "anchor" ? "#705126" : "#000000");
      ropeMat.emissive.set(part === "line" ? "#655633" : "#000000");
    },
    get endpointDistance() {
      return endpointDistance;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      [support.geometry, device.geometry, fittings.geometry, geometry].forEach((item) =>
        item.dispose(),
      );
      [supportMat, deviceMat, metalMat, ropeMat].forEach((item) => item.dispose());
      root.removeFromParent();
      root.clear();
    },
  };
}
export type ProtectionSystem = ReturnType<typeof createProtection>;
