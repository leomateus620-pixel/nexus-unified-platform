import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { gerarPetPdf } from "../src/features/pet/pdf";
import { gerarPetPdfV2 } from "../src/features/pet/pdf-v2";
import { chaveRelatorio } from "../src/features/pet/relatorio-version";
import { petPdfFixture } from "./fixtures/pet-pdf.fixture";
import type { Json } from "../src/features/pet/schemas";

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false });
  const reader = await task.promise;
  const pages = [];
  const overflows: string[] = [];
  for (let i = 1; i <= reader.numPages; i++) {
    const page = await reader.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform;
      if (x < 41 || x + item.width > 555 || y < 21 || y > 820)
        overflows.push(`page ${i}: ${item.str}`);
    }
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return { doc, pages, text: pages.join(" "), overflows };
}
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
    "base64",
  ),
);

describe("PET: relatório V2 e preservação de formato", () => {
  it("mantém a chave legada e separa formatos sem incluir a versão operacional", async () => {
    const request = "b7330000-0000-4000-8000-000000000004";
    expect(await chaveRelatorio(request, "1")).toBe(request);
    const v2 = await chaveRelatorio(request, "2");
    expect(v2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(v2).not.toBe(request);
    expect(await chaveRelatorio(request, "2")).toBe(v2);
    expect(await chaveRelatorio("b7330000-0000-4000-8000-000000000005", "2")).not.toBe(v2);
  });

  it("preserva os bytes do renderer V1 para o snapshot de referência", async () => {
    const bytes = await gerarPetPdf(petPdfFixture(18));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "a0d94179a00aab7a9589162f3d61c790aa5ba5aca71a012f3d7b058dc829717f",
    );
  });

  it("gera bytes V2 idênticos, com fontes locais incorporadas e registros completos", async () => {
    const detail = petPdfFixture(45);
    detail["relatorio_contexto"] = {
      documento_id: "documento-v2",
      revisao_relatorio_id: "revisao-v2",
      pet_version: 3,
    };
    detail["relatorio_snapshot_sha256"] = "d".repeat(64);
    const reviewPhoto = process.env["PET_PDF_REVIEW_PHOTO"];
    const picture = reviewPhoto ? new Uint8Array(readFileSync(reviewPhoto)) : png;
    const images = [
      {
        nome: "Foto controlada",
        legenda: "Evidência privada verificada",
        mime: picture[0] === 0xff && picture[1] === 0xd8 ? "image/jpeg" : "image/png",
        bytes: picture,
      },
    ];
    const first = await gerarPetPdfV2(detail, images);
    const second = await gerarPetPdfV2(detail, images);
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      createHash("sha256").update(second).digest("hex"),
    );
    const { doc, pages, text, overflows } = await inspect(first);
    expect(overflows).toEqual([]);
    expect(doc.getProducer()).toContain("formato 2");
    expect(doc.getCreator()).toContain("renderer 2");
    expect(doc.getCreationDate()?.toISOString()).toBe(
      new Date(String(detail["servidor_em"])).toISOString(),
    );
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.every((page) => page.includes("RELATÓRIO DERIVADO DE CONSULTA"))).toBe(true);
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28);
      expect(page.getHeight()).toBeCloseTo(841.89);
    }
    const fonts = doc.context
      .enumerateIndirectObjects()
      .flatMap(([, object]) => {
        if (!(object instanceof PDFDict)) return [];
        return String(object.get(PDFName.of("BaseFont")) ?? "");
      })
      .join(" ");
    expect(fonts).toContain("Barlow-Regular");
    expect(fonts).toContain("Barlow-SemiBold");
    expect(fonts).toContain("Saira-SemiBold");
    expect(
      doc.context
        .enumerateIndirectObjects()
        .some(
          ([, object]) =>
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
        ),
    ).toBe(true);
    for (const term of [
      "MARCOS DO REGISTRO",
      "Cliente preservado na revisão",
      "PESSOAS SEM SAÍDA",
      "13. Pendências",
      "Foto controlada",
      "documento-v2",
      "SHA-256 do snapshot",
      "Originais certificados separados",
      "0h 00min 17s",
      "22/10/2026, 23:40:00",
      "20,9",
      "%vol",
    ])
      expect(text).toContain(term);
    expect(text).not.toContain("Nome cadastral alterado");
    expect(text).not.toContain("1h 00min 00s");
    const output = process.env["PET_PDF_REVIEW_DIR"];
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, "pet-v2-review.pdf"), first);
    }
  }, 30_000);

  it("apresenta encerramento e correções sem confundir o original com a projeção efetiva", async () => {
    const detail = petPdfFixture(1);
    const pet = detail["pet"] as Record<string, Json>;
    pet["estado_documental"] = "encerrada";
    pet["condicao_operacional"] = "terminada";
    pet["encerrada_em"] = "2026-10-23T03:40:17Z";
    detail["pendencias"] = ["⚠️ Conferência de teste: H₂S ≤ critério; " + "x".repeat(1400)];
    detail["intervalos"] = [
      {
        pessoa_id: "pessoa-1",
        entrada_em: "2026-10-23T02:41:00Z",
        entrada_original_em: "2026-10-23T02:40:00Z",
        saida_em: "2026-10-23T03:40:00Z",
        segundos: 3540,
        retificacao_entrada_id: "retificacao-preservada",
      },
    ];
    const bytes = await gerarPetPdfV2(detail, [
      { nome: "Imagem inválida", mime: "image/png", bytes: new Uint8Array([1, 2]) },
    ]);
    const { text, overflows } = await inspect(bytes);
    expect(overflows).toEqual([]);
    for (const term of [
      "DOSSIÊ DE ENCERRAMENTO",
      "Histórico preservado.",
      "Entrada após retificação",
      "Entrada original",
      "não foi possível incorporar",
      "Assinatura pendente",
    ])
      expect(text).toContain(term);
    const output = process.env["PET_PDF_REVIEW_DIR"];
    if (output) writeFileSync(join(output, "pet-v2-encerrada-review.pdf"), bytes);
  }, 30_000);
});
