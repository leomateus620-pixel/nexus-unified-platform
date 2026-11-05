/** Visual terracing only. Earth elevations are coarse observations, not a DTM.
 * The equipment terrace stays level; the north field descends and arrival rises.
 * Never used by technical geometry or any operational command. */
export function visualGroundHeight(_x: number, z: number) {
  const smooth = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };
  return -28 * smooth((-z - 120) / 250) + 8 * smooth((z - 70) / 185);
}
