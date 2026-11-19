import { lazy } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";

const load = () =>
  import("@/features/nr/NrOriginalPreview").then((module) => ({
    default: module.NrOriginalPreview,
  }));

export const CruzAltaPdf = lazy(load);

const loadPdfRenderer = createClientOnlyFn(
  () => import("@/features/projetos-engenharia/leitor/renderer.client"),
);

export function prepareCruzAltaPdf() {
  void Promise.all([
    load(),
    loadPdfRenderer().then((renderer) => renderer.preparePdfEngine()),
  ]).catch(() => undefined);
}
