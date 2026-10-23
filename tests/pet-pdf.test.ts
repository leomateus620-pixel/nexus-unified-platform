import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { gerarPetPdf } from "../src/features/pet/pdf";
import type { Json } from "../src/features/pet/schemas";
import { petPdfFixture } from "./fixtures/pet-pdf.fixture";

async function pdfText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const decoder = new TextDecoder("windows-1252");
  const streams = doc.context
    .enumerateIndirectObjects()
    .filter(([, obj]) => obj instanceof PDFRawStream)
    .map(([, obj]) => {
      try {
        return new TextDecoder().decode(decodePDFRawStream(obj as PDFRawStream).decode());
      } catch {
        return "";
      }
    });
  const text = streams
    .flatMap((stream) =>
      [...stream.matchAll(/<([a-fA-F0-9]+)>\s*Tj/g)].map((match) =>
        decoder.decode(
          Uint8Array.from((match[1] ?? "").match(/.{2}/g) ?? [], (x) => parseInt(x, 16)),
        ),
      ),
    )
    .join("\n");
  return { doc, text };
}

describe("PET PDF de consulta", () => {
  it("gera A4 multipágina com seções, cabeçalhos repetidos e classificação derivada", async () => {
    const { doc, text } = await pdfText(await gerarPetPdf(petPdfFixture(45)));
    expect(doc.getPageCount()).toBeGreaterThan(4);
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
    expect(doc.getTitle()).toContain("Relatório derivado");
    expect(text.match(/RELATÓRIO DERIVADO DE CONSULTA/g)?.length).toBe(doc.getPageCount());
    expect(text.match(/Justificativa \/ conferência/g)?.length).toBeGreaterThan(1);
    for (const heading of [
      "1. Identificação",
      "2. Equipe",
      "3. Perigos",
      "4. EPC",
      "5. Procedimentos",
      "6. Avaliações",
      "7. Entradas",
      "8. Permanência",
      "9. Ocorrências",
      "10. Assinaturas",
      "11. Revisões",
      "12. Evidências",
      "13. Pendências",
    ])
      expect(text).toContain(heading);
    expect(text).toContain("Não autoriza entrada");
    expect(text).toContain("Integração não configurada");
  });

  it("usa snapshot, fuso e durações oficiais, preservando saída com assinatura pendente", async () => {
    const { text } = await pdfText(await gerarPetPdf(petPdfFixture(1)));
    expect(text).toContain("Cliente preservado na revisão");
    expect(text).toContain("Localização preservada na revisão");
    expect(text).not.toContain("Nome cadastral alterado");
    expect(text).toContain("22/10/2026, 23:40:00");
    expect(text).toContain("0h 00min 17s");
    expect(text).not.toContain("1h 00min 00s");
    expect(text).toContain("Assinatura pendente");
    expect(text).toContain("vigia-registrante-teste");
    expect(text).toContain("20,9");
    expect(text).toContain("%vol");
    expect(text).toContain("Assinatura coletada na tela");
    expect(text).toContain("Originais certificados separados");
  });

  it("não perde o documento por glifo não suportado, texto longo ou imagem inválida", async () => {
    const detail = petPdfFixture(1);
    detail["pendencias"] = ["⚠️ Conferência de teste: H₂S ≤ critério; " + "x".repeat(1400)];
    const { doc, text } = await pdfText(
      await gerarPetPdf(detail, [
        { nome: "arquivo-inválido", mime: "image/png", bytes: new Uint8Array([1, 2]) },
      ]),
    );
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(text).toContain("H2S <= critério");
    expect(text).toContain("não foi possível incorporar");
    expect(text).not.toContain("SEM SAÍDA REGISTRADA");
    expect(text).toContain("Pendências");
  });

  it("incorpora fotografia com legenda e preserva identificação antiga quando o snapshot é textual", async () => {
    const detail = petPdfFixture(1);
    const pet = detail["pet"] as Record<string, Json>;
    const snapshot = pet["snapshot_identificacao"] as Record<string, Json>;
    snapshot["espaco"] = "EC histórico textual";
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const { doc, text } = await pdfText(
      await gerarPetPdf(detail, [
        {
          nome: "Foto controlada",
          legenda: "Isolamento - evidência de teste",
          mime: "image/png",
          bytes: png,
        },
      ]),
    );
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(
        ([, obj]) =>
          obj instanceof PDFRawStream &&
          obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
      );
    expect(images.length).toBeGreaterThan(0);
    expect(text).toContain("Foto controlada - Isolamento");
    expect(text).toContain("EC histórico textual");
    expect(text).not.toContain("Nome cadastral alterado");
  });

  it("distingue horários retificados, eventos originais e integridade do job derivado", async () => {
    const detail = petPdfFixture(1);
    detail["intervalos"] = [
      {
        pessoa_id: "pessoa-1",
        entrada_em: "2026-10-23T02:41:00Z",
        entrada_original_em: "2026-10-23T02:40:00Z",
        saida_em: "2026-10-23T03:40:00Z",
        segundos: 3540,
        retificacao_entrada_id: "correcao-teste",
      },
    ];
    detail["retificacoes"] = [
      {
        id: "correcao-teste",
        evento_id: "entrada-original",
        momento_original: "2026-10-23T02:40:00Z",
        momento_corrigido: "2026-10-23T02:41:00Z",
        motivo: "Correção independente de teste",
        evidencia_id: "evidencia-da-correcao",
        solicitado_por: "solicitante-teste",
        solicitado_em: "2026-10-23T04:00:00Z",
      },
    ];
    detail["retificacao_decisoes"] = [
      {
        decisao: "aprovada",
        responsavel_id: "tecnico-independente",
        decidido_em: "2026-10-23T04:10:00Z",
        revisao_id: "revisao-decisao",
        retificacao_id: "correcao-teste",
        motivo: "Fundamento técnico controlado",
      },
    ];
    detail["relatorio_contexto"] = {
      documento_id: "documento-derivado-job",
      revisao_relatorio_id: "revisao-job",
      pet_version: 3,
    };
    detail["relatorio_snapshot_sha256"] = "d".repeat(64);
    const { text } = await pdfText(await gerarPetPdf(detail));
    expect(text).toContain("Entrada após retificação");
    expect(text).toContain("Entrada original");
    expect(text).toContain("evidencia-da-correcao");
    expect(text).toContain("tecnico-independente");
    expect(text).toContain("documento-derivado-job");
    expect(text.replaceAll("\n", " ")).toContain(
      "assinatura original não certifica automaticamente",
    );
  });
});
