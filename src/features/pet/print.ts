import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

export const petPrintProcedure = z.object({
  impressao: z.object({
    layout: z.literal("nexus-v2-3p"),
    trabalhadores: z.number().int().min(1).max(10),
    vigias: z.number().int().min(1).max(4),
  }),
  itens: z
    .array(z.object({ id: z.string(), rotulo: z.string().min(1).max(130) }))
    .min(1)
    .max(18),
  agentes: z
    .array(
      z.object({
        agente: z.string().min(1).max(50),
        unidade: z.string().max(20),
        minimo: z.number().nullable().optional(),
        maximo: z.number().nullable().optional(),
      }),
    )
    .min(1)
    .max(6),
});

/** Blank, unissued form. The exact layout must be part of the RT-approved model version. */
export async function petBlankPdf(
  model: { nome: string; versao: number; procedimento: unknown },
  copies: 1 | 2,
) {
  const p = petPrintProcedure.parse(model.procedimento);
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (s: string) =>
    [...s.replace(/[\u2010-\u2015]/g, "-")]
      .map((c) => {
        try {
          regular.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  for (let copy = 1; copy <= copies; copy++) {
    for (let section = 1; section <= 3; section++) {
      const page = pdf.addPage([595.28, 841.89]);
      let y = 731;
      const text = (s: string, size = 10, strong = false) => {
        page.drawText(clean(s), { x: 36, y, size, font: strong ? bold : regular });
        y -= size + 9;
      };
      const line = (s: string, h = 34) => {
        text(s, 9);
        page.drawLine({
          start: { x: 36, y: y - h + 18 },
          end: { x: 559, y: y - h + 18 },
          color: rgb(0.55, 0.55, 0.55),
          thickness: 0.5,
        });
        y -= h;
      };
      page.drawText("PERMISSÃO DE ENTRADA E TRABALHO - NR-33", {
        x: 36,
        y: 799,
        size: 14,
        font: bold,
      });
      page.drawText(`FORMULÁRIO EM BRANCO | Via ${copy}/${copies} | Página ${section}/3`, {
        x: 36,
        y: 777,
        size: 10,
        font: bold,
      });
      page.drawText(
        clean(`${model.nome.slice(0, 65)} - versão ${model.versao} - layout nexus-v2-3p`),
        { x: 36, y: 758, size: 9, font: regular },
      );
      if (section === 1) {
        text("1. IDENTIFICAÇÃO E PREPARAÇÃO", 12, true);
        line("Unidade / local / TAG / identificação da PET");
        line("Atividade / prestador / supervisor / início e término previstos");
        line("Procedimento aplicável / resgate / comunicações / isolamento e ventilação");
        text("2. VERIFICAÇÕES DO PROCEDIMENTO", 12, true);
        text("Registrar S / N / NA, justificativas e evidências. Não presumir condições.", 8);
        for (const item of p.itens) {
          const label = clean(item.rotulo);
          const size = Math.min(9, 490 / Math.max(1, regular.widthOfTextAtSize(label, 1)));
          text(`[   ] ${label}`, size);
        }
      } else if (section === 2) {
        text("3. EQUIPE AUTORIZADA E VIGILÂNCIA", 12, true);
        text("Trabalhadores: nome / função / qualificação / assinatura", 9, true);
        for (let n = 0; n < p.impressao.trabalhadores; n++) line(`${n + 1}.`, 12);
        text("Vigias e substituições: nome / intervalo / assinatura", 9, true);
        for (let n = 0; n < p.impressao.vigias; n++) line(`${n + 1}.`, 12);
        text("4. AVALIAÇÕES ATMOSFÉRICAS", 12, true);
        text("Agente | unidade | faixa do procedimento | leitura / hora / responsável", 8);
        for (const a of p.agentes)
          text(
            `${a.agente} | ${a.unidade} | ${a.minimo ?? "—"} a ${a.maximo ?? "—"} | __________________`,
            9,
          );
        line("Instrumento / identificação / calibração / teste de resposta", 18);
      } else {
        text("5. ENTRADAS, SAÍDAS E MONITORAMENTO", 12, true);
        for (let n = 0; n < 7; n++)
          line(`${n + 1}. Pessoa / entrada / saída / vigia / leitura ou ocorrência`, 16);
        text("6. CONTINUIDADE E ENCERRAMENTO", 12, true);
        line("Reavaliação / prorrogação: início, fim, condições e responsáveis", 24);
        line("Motivo e horário de encerramento / conferência de todas as saídas", 24);
        line("Condição final / ocorrências / evidências / responsável / assinaturas", 24);
        text("Arquivar conforme a política aplicável e vincular o original à PET correta.", 9);
      }
      if (y < 67)
        throw new Error("Conteúdo excede o layout aprovado. Revise o modelo antes de imprimir.");
      page.drawText(
        "Não emitido. Este download não libera entrada nem registra assinatura ou operação.",
        { x: 36, y: 44, size: 8, font: regular },
      );
      page.drawText(
        "Preencher conforme o procedimento aprovado; preservar e arquivar o original.",
        { x: 36, y: 30, size: 8, font: regular },
      );
    }
  }
  return pdf.save();
}
