import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DemoDetail } from "./domain";
import { demoStateLabel } from "./domain";
import { csvCell, downloadCsv } from "../csv";
import { petDate } from "../ui-types";
export function downloadDemoCsv(d: DemoDetail) {
  const rows = [
    ["DEMONSTRAÇÃO — SEM VALIDADE OPERACIONAL", d.sessao.numero],
    ["Unidade", d.sessao.identificacao.unidade],
    ["Silo", d.sessao.identificacao.tag],
    ["Atividade", d.sessao.conteudo.atividade],
    ["Estado", demoStateLabel[d.sessao.estado]],
    [
      "Período",
      petDate(d.sessao.conteudo.inicio_previsto),
      petDate(d.sessao.conteudo.termino_previsto),
    ],
    ["Perigos", d.sessao.conteudo.perigos],
    ["Medidas", d.sessao.conteudo.medidas],
    ["Procedimentos", d.sessao.conteudo.procedimentos],
    ...d.sessao.conteudo.equipe.map((p) => ["Participante", p.nome, p.funcao]),
    ...d.sessao.conteudo.leituras.map((l) => ["Leitura manual", l.agente, l.valor, l.unidade]),
    ...d.presencas.map((p) => [
      "Presença demonstrativa",
      p.nome,
      petDate(p.entrada_em),
      p.saida_em ? petDate(p.saida_em) : "Em aberto",
    ]),
    ["Evento", "Data", "Detalhes"],
    ...d.eventos.map((e) => [e.tipo, petDate(e.created_at), JSON.stringify(e.dados)]),
  ];
  downloadCsv(
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
    `${d.sessao.numero}-demonstracao.csv`,
  );
}
export async function downloadDemoReport(d: DemoDetail) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage(),
    y = 790;
  const line = (text: string, size = 11) => {
    const clean = text.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, " ");
    for (let i = 0; i < clean.length || i === 0; i += 85) {
      if (y < 60) {
        page = pdf.addPage();
        y = 790;
        page.drawText("DEMONSTRACAO - SEM VALIDADE OPERACIONAL", {
          x: 40,
          y,
          size: 10,
          font,
          color: rgb(0.4, 0.45, 0.4),
        });
        y -= 28;
      }
      page.drawText(clean.slice(i, i + 85), { x: 40, y, size, font });
      y -= 17;
    }
  };
  line("DEMONSTRAÇÃO — SEM VALIDADE OPERACIONAL", 13);
  y -= 14;
  line(`${d.sessao.numero} · ${demoStateLabel[d.sessao.estado]}`, 16);
  y -= 12;
  line(d.sessao.identificacao.unidade);
  line(`${d.sessao.identificacao.tag} · ${d.sessao.identificacao.titulo}`);
  const c = d.sessao.conteudo;
  for (const [title, value] of [
    ["Atividade", c.atividade],
    ["Período", `${petDate(c.inicio_previsto)} até ${petDate(c.termino_previsto)}`],
    ["Equipe", c.equipe.map((p) => `${p.nome}: ${p.funcao}`).join("; ")],
    ["Perigos", c.perigos],
    ["Medidas", c.medidas],
    ["Leituras", c.leituras.map((l) => `${l.agente}: ${l.valor} ${l.unidade}`).join("; ")],
    ["Procedimentos", c.procedimentos],
  ]) {
    y -= 12;
    line(title!);
    line(value! || "Não informado");
  }
  y -= 12;
  line("Entradas e saídas");
  for (const p of d.presencas)
    line(
      `${p.nome}: ${petDate(p.entrada_em)} até ${p.saida_em ? petDate(p.saida_em) : "Em aberto"}`,
    );
  line("Histórico");
  for (const e of d.eventos) {
    line(`${petDate(e.created_at)} · ${e.tipo}`);
    line(JSON.stringify(e.dados));
  }
  line(`Anexos: ${d.anexos.map((a) => a.nome).join("; ") || "Nenhum"}`);
  const bytes = await pdf.save(),
    url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${d.sessao.numero}-demonstracao.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
