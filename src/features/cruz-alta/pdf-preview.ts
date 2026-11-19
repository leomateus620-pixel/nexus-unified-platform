import { lazy } from "react";

const load = () =>
  import("@/features/nr/NrOriginalPreview").then((module) => ({
    default: module.NrOriginalPreview,
  }));

export const CruzAltaPdf = lazy(load);

export function prepareCruzAltaPdf() {
  void load().catch(() => undefined);
}
