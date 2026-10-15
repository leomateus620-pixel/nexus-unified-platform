/** Technical reference values are presentation inputs, never a structural design. */
export type ParameterStatus = "published" | "presentation-assumption" | "mesh-verified";
export interface TechnicalParameter<Unit extends string = string> {
  readonly value: number;
  readonly unit: Unit;
  readonly source: string;
  readonly status: ParameterStatus;
  readonly note?: string;
  readonly resourceSha256?: string;
}
const reference = "https://lvhfinternsilo.pplx.app/#visualizador";
const published = <U extends string>(
  value: number,
  unit: U,
  note?: string,
): TechnicalParameter<U> =>
  Object.freeze({ value, unit, source: reference, status: "published", ...(note ? { note } : {}) });
const assumed = <U extends string>(value: number, unit: U, note: string): TechnicalParameter<U> =>
  Object.freeze({
    value,
    unit,
    source: "Nexus parametric presentation v2",
    status: "presentation-assumption",
    note,
  });
const measured = <U extends string>(
  value: number,
  unit: U,
  note: string,
  source = "https://lvhfinternsilo.pplx.app/assets/trole_passante.glb",
  resourceSha256 = "8aa8c3393152958b511144be59363ace48b564118ddc3c1a1747a25ba0c4505c",
): TechnicalParameter<U> =>
  Object.freeze({
    value,
    unit,
    source,
    resourceSha256,
    status: "mesh-verified",
    note,
  });

export const SILO_CONFIG = Object.freeze({
  version: "nexus-lvhf-2.0.0",
  coordinates: Object.freeze({
    units: "m",
    up: "Y",
    origin: "foundation-centre",
    zeroAngle: "+Z",
    positiveAngle: "+Z toward +X",
    expression: "x=R*sin(theta); z=R*cos(theta)",
  }),
  radius: published(11, "m"),
  externalEnvelope: published(11.32, "m", "Envelope, not a 320 mm sheet thickness."),
  bodyTop: published(24.88, "m"),
  roofTop: published(30.403, "m"),
  roofEaveRadius: measured(
    11.103,
    "m",
    "Roof-only source triangles meet the eave at radius 11.10299952–11.10300037m, Y24.875m. Nexus retains published base Y24.88m (+5mm); this is not the 11.32m external component envelope.",
    "https://lvhfinternsilo.pplx.app/assets/silo_com_chapeu.glb",
    "14751cbdfe7953b0f901334ddbc5dead248159be1446572f8aaaad6cf247dc96",
  ),
  collarRadius: published(1, "m"),
  ringRadius: published(10.926, "m"),
  ringY: published(24.375, "m"),
  cableDiameter: published(0.008, "m"),
  supportCount: published(
    11,
    "count",
    "One anchor at zero plus ten pass-through supports; tensioner is not a twelfth support.",
  ),
  tensionerAngle: published((10.3 * Math.PI) / 180, "rad"),
  manholeAngle: published((8.4 * Math.PI) / 180, "rad"),
  manholeX: published(1.548, "m"),
  manholeY: published(25.207, "m"),
  manholeZ: published(10.486, "m"),
  initialSurface: published(22.6, "m"),
  trolleyWidth: published(0.105, "m", "Envelope axes need original CAD confirmation."),
  trolleyDepth: published(0.062, "m"),
  trolleyHeight: published(0.1, "m"),
  wheelDiameter: published(0.034, "m"),
  trolleyEyeOffset: measured(
    0.094,
    "m",
    "Measured reference GLB and its published mount transform: eye datum 90 mm plus 4 mm cable-offset placement. Source CAD and manufacturer mechanical approval remain unavailable.",
  ),
  trolleyEyeRadialOffset: measured(
    0.0155,
    "m",
    "Reference GLB eye after the published mount transform; radially outside nominal cable centreline.",
  ),
  trolleyEyeHoleOffset: measured(
    0.086,
    "m",
    "Source inner hole centre Z=-.082m, radius .0085m, mounted with -4mm vertical offset. The -94mm connection datum is the lower bearing point, not the hole centre.",
  ),
  trolleyEyeHoleRadius: measured(
    0.0085,
    "m",
    "Source inner hole centreline extrema are Z=-.0735m and -.0905m: centre -.082m and radius8.5mm.",
  ),
  floorY: assumed(0.18, "m", "Flat internal floor on presentation foundation."),
  groundY: assumed(-0.177, "m", "Presentation apron surface; external workers sole datum."),
  workerRadius: assumed(
    10.15,
    "m",
    "Human clearance from the corrugated wall; perimeter demonstration.",
  ),
  connectionLength: assumed(
    0.95,
    "m",
    "Fixed illustrative eye-to-dorsal connection, not a prescribed equipment length.",
  ),
  connectorReach: assumed(
    0.052,
    "m",
    "Vertical Nexus visual connector assembly from true trolley bearing datum to rope centre attachment, including 5mm rope tangent offset. Deducted from the fixed0.95m total; not a published manufacturer dimension.",
  ),
  collapseRadius: assumed(
    0.75,
    "m",
    "Two mirrored local crust-collapse patches, contained inside the wall; kinematic educational scenario, not calibrated granular physics.",
  ),
  collapseDepth: assumed(
    0.42,
    "m",
    "Mass-conserving local depression with visible surrounding redistribution.",
  ),
  nominalRedistribution: assumed(
    0.65,
    "m3/s",
    "Internal visual motion scale. No grain leaves the scene in the crust-collapse scenario.",
  ),
  entrapmentDepth: assumed(
    2.02,
    "m",
    "Illustrative unconnected support loss, not a granular material prediction.",
  ),
  demonstrationDuration: assumed(80, "s", "One full circuit; this is not a safe entry procedure."),
  sheetPresentationThickness: assumed(
    0.002,
    "m",
    "Visual cut edge only; no verified manufacturer sheet thickness.",
  ),
});

export const SUPPORT_ANGLES = Object.freeze(
  Array.from({ length: 11 }, (_, index) => (index * 2 * Math.PI) / 11),
);
export const INCIDENT_ANGLES = Object.freeze({ A: Math.PI + 0.12, B: Math.PI - 0.12 });
export const INCIDENT_CENTRES = Object.freeze(
  Object.values(INCIDENT_ANGLES).map((angle) =>
    Object.freeze({
      x: SILO_CONFIG.workerRadius.value * Math.sin(angle),
      z: SILO_CONFIG.workerRadius.value * Math.cos(angle),
    }),
  ),
);
