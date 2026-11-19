import { PDFJS_VERSION } from "../projetos-engenharia/leitor/domain";
import { openOriginalDocument } from "../projetos-engenharia/leitor/renderer.client";

const references: Record<string, string> = {
  "6357e8e205dfcc3d8f12ca2004cdc04fe2cb95dbc0a7b3b361b14a7e5343cb50": "43",
  b19e61ba80bea843ff024c1c2dad73ea00bf5aaaa4a1eb1a6255303819f61fad: "56",
};
/** The two verified sheets have identical aerial imagery, page size and crop. Only the supplied file is opened. */
export async function readComparison(file: File, signal: AbortSignal) {
  if (file.size > 25 * 1024 * 1024)
    throw Error("Selecione o layout A1 conferido ou a foto DJI 0044.");
  const bytes = await file.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  signal.throwIfAborted();
  if (digest === "bcfe8cdeaef51492b3cbc627b2862d264cca56ab2b9837147422244d520ff0bf")
    return { kind: "drone", file } as const;
  const revision = references[digest];
  if (!revision)
    throw Error("A origem e o enquadramento deste arquivo ainda não foram conferidos.");
  signal.throwIfAborted();
  const doc = await openOriginalDocument(
    new Uint8Array(bytes),
    "application/pdf",
    signal,
    `/pdfjs/${PDFJS_VERSION}/`,
  );
  const page = document.createElement("canvas");
  try {
    await doc.render(
      1,
      page,
      {
        availableWidth: 2850,
        availableHeight: 2200,
        rotation: 0,
        zoom: 1,
        dpr: 1,
        mobile: false,
        fit: "width",
      },
      signal,
    );
    const sx = page.width / 2383.937,
      sy = page.height / 1683.7796;
    const crop = document.createElement("canvas");
    crop.width = Math.round(1703.622 * sx);
    crop.height = Math.round(1240.0208 * sy);
    const context = crop.getContext("2d");
    if (!context) throw Error("A prévia da folha ficou indisponível.");
    context.drawImage(
      page,
      55.27708 * sx,
      53.85742 * sy,
      1703.622 * sx,
      1240.0208 * sy,
      0,
      0,
      crop.width,
      crop.height,
    );
    signal.throwIfAborted();
    return { kind: "planta", crop, revision } as const;
  } finally {
    await doc.close();
    page.width = page.height = 0;
  }
}
