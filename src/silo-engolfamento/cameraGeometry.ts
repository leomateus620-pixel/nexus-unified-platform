import * as T from "three";

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const NO_INSETS: Readonly<ViewportInsets> = Object.freeze({
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

/** Inspection offset in metres: tangent +0.65, inward -0.90, vertical +0.30.
 * A fixed world-Z offset crosses the opaque shell on half of the ring. */
export function trolleyCameraOffset(point: { x: number; z: number }, out = new T.Vector3()) {
  const r = Math.hypot(point.x, point.z),
    x = r > 1e-8 ? point.x / r : 0,
    z = r > 1e-8 ? point.z / r : 1;
  return out.set(z * 0.65 - x * 0.9, 0.3, -x * 0.65 - z * 0.9);
}

/** CSS-pixel panel budgets become angular margins, never world-unit padding. */
export function fitBoxDistance(
  box: T.Box3,
  direction: T.Vector3,
  fov: number,
  aspect: number,
  width: number,
  height: number,
  insets: Readonly<ViewportInsets> = NO_INSETS,
  margin = 1.14,
) {
  const forward = direction.clone().normalize();
  const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), forward).normalize();
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  const up = new T.Vector3().crossVectors(forward, right).normalize();
  const center = box.getCenter(new T.Vector3());
  const tangent = Math.tan(T.MathUtils.degToRad(fov) / 2);
  const freeX = Math.max(0.2, (width - insets.left - insets.right) / width);
  const freeY = Math.max(0.2, (height - insets.top - insets.bottom) / height);
  let distance = 0.08;
  const corner = new T.Vector3();
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      )
      .sub(center);
    const depth = corner.dot(forward);
    distance = Math.max(
      distance,
      depth + (margin * Math.abs(corner.dot(right))) / (tangent * aspect * freeX),
      depth + (margin * Math.abs(corner.dot(up))) / (tangent * freeY),
    );
  }
  return distance;
}

/** Conservative opaque exterior envelope; cut/inspection and rig views opt out. */
export function constrainExterior(
  position: T.Vector3,
  radius: number,
  bodyTop: number,
  roofTop: number,
  collarRadius: number,
) {
  position.y = Math.max(0.35, position.y);
  const radial = Math.hypot(position.x, position.z);
  const roofHeight =
    bodyTop +
    (roofTop - bodyTop) * T.MathUtils.clamp((radius - radial) / (radius - collarRadius), 0, 1);
  if (radial < radius + 0.3 && position.y < roofHeight + 0.3) {
    if (radial > 0.0001) {
      const scale = (radius + 0.3) / radial;
      position.x *= scale;
      position.z *= scale;
    } else position.z = radius + 0.3;
  }
  return position;
}
