import type { CruzLine, CruzPart, GroundPoint } from "./scene-types";

/** Conjunto 67/68/69, rev. 01: três faixas em perfis sobrepostos, com a queda para o mesmo beiral. */
const crestHeights = { "cobertura-67": 26, "cobertura-68": 21.03, "cobertura-69": 16.6 };

export function receivingRoofSections(parts: CruzPart[], lines: CruzLine[]) {
  const datum = parts.find(({ id }) => id === "cobertura-67");
  if (!datum?.axis) return;
  const axis = datum.axis;
  const slope: GroundPoint = [axis[1], -axis[0]];
  const frames = Object.entries(crestHeights).map(([id, high]) => {
    const part = parts.find((p) => p.id === id)!;
    const guide = lines.find((l) => l.id === id.replace("cobertura-", "lvhf-"))!;
    const points = guide.points
      .map(([x, z]) => ({
        alongside: x * axis[0] + z * axis[1],
        run: x * slope[0] + z * slope[1],
      }))
      .sort((a, b) => a.alongside - b.alongside);
    const a = points[0]!,
      b = points[points.length - 1]!;
    return {
      part,
      high,
      crest: (a.run + b.run) / 2,
      alongside: (a.alongside + b.alongside) / 2,
      a,
      b,
    };
  });
  const rear = frames[0]!.crest - 8.5;
  const eaves = rear + 40;
  const eave = 6;
  // The photographed traces and the assembly do not close exactly. Fit continuous
  // seams between the registered cables so that their plan anchors remain over the roof.
  frames.sort((a, b) => a.alongside - b.alongside);
  const clearance = 0.2;
  const seams = frames.slice(0, -1).map((left, i) => {
    const right = frames[i + 1]!;
    return [
      { s: left.b.alongside + clearance, d: left.b.run },
      { s: right.a.alongside - clearance, d: right.a.run },
    ].sort((a, b) => a.d - b.d);
  });
  const point = (alongside: number, run: number): GroundPoint => [
    alongside * axis[0] + run * slope[0],
    alongside * axis[1] + run * slope[1],
  ];
  for (const [i, frame] of frames.entries()) {
    const { part, high, crest } = frame;
    const start = part.id === "cobertura-69" ? rear + 10 : rear;
    function edge(seam: { s: number; d: number }[] | undefined, outer: number) {
      if (!seam) return [point(outer, start), point(outer, eaves)];
      const [a, b] = seam as [{ s: number; d: number }, { s: number; d: number }];
      const at = (d: number) => {
        const u = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d)));
        return point(a.s + (b.s - a.s) * u, d);
      };
      return [
        at(start),
        ...seam.filter(({ d }) => d > start && d < eaves).map(({ s, d }) => point(s, d)),
        at(eaves),
      ];
    }
    const t = (distance: number) => (eaves - distance) / (eaves - start);
    const rearControl =
      part.id === "cobertura-68"
        ? ([
            [t(rear + 9.5), 10.9],
            [t(rear + 2.4), 9.2],
          ] as const)
        : [];
    part.footprint = [
      ...edge(seams[i - 1], frame.a.alongside - clearance),
      ...edge(seams[i], frame.b.alongside + clearance).reverse(),
    ];
    part.axis = axis;
    part.eave = eave;
    part.rise = high - eave;
    part.roofSection = [[0, eave], [t(crest), high], ...rearControl, [1, eave]];
  }
}
