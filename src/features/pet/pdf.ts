import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { Json } from "./schemas";

export type PetPdfImagem = {
  nome: string;
  mime: string;
  bytes: Uint8Array;
  legenda?: string;
};

type Row = Record<string, Json>;
const object = (v: Json | undefined): Row =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
const records = (v: Json | undefined): Row[] => (Array.isArray(v) ? v.map(object) : []);
const value = (v: Json | undefined): string => {
  if (v === null || v === undefined || v === "") return "Não informado";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.map(value).join("; ");
  if (typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => `${label(k)}: ${value(x)}`)
      .join("; ");
  return String(v);
};
const LABELS: Record<string, string> = {
  supervisor: "Supervisor de entrada",
  vigia: "Vigia",
  substituto_vigia: "Substituto de vigia",
  trabalhador: "Trabalhador autorizado",
  resgate: "Emergência e resgate",
  nao_aplicavel: "Não se aplica",
  nao_verificado: "Ainda não verificado",
  sim: "Sim",
  nao: "Não",
  rascunho: "Rascunho",
  em_conferencia: "Em conferência",
  aguardando_assinaturas: "Aguardando assinaturas",
  emitida: "Emitida",
  encerramento_pendente: "Encerramento pendente",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
  nao_liberada: "Não liberada",
  liberada: "Liberada",
  em_atividade: "Em atividade",
  interrompida: "Interrompida",
  emergencia: "Emergência",
  terminada: "Terminada",
  expirada: "Expirada",
  vigente: "Vigente",
  nao_emitida: "Não emitida",
  entrada: "Entrada",
  saida: "Saída",
  retificacao: "Retificação",
  online: "Online",
  offline: "Offline",
  informado_posteriormente: "Informado posteriormente",
  contingencia_fisica: "Contingência física",
  coletada_tela: "Assinatura coletada na tela",
  aceite_autenticado: "Aceite autenticado",
  certificada_icp_brasil: "Certificada ICP-Brasil",
  pendente: "Pendente",
  coletada: "Coletada na tela",
  aceite_registrado: "Aceite registrado",
  validada: "Validada",
  falha: "Falha",
  emissao: "Emissão",
  encerramento: "Encerramento",
  aditamento: "Aditamento",
  relatorio_derivado: "Relatório derivado",
  original_assinado: "Original assinado",
  inicial: "Inicial",
  apos_ventilacao: "Após ventilação/isolamento",
  reavaliacao: "Reavaliação",
  bloqueio: "Bloqueio, travamento e etiquetagem",
  purga: "Purga / lavagem",
  ventilacao_tipo: "Ventilação: tipo",
  ventilacao_equipamento: "Ventilação: equipamento",
  ventilacao_minutos: "Ventilação: duração (min)",
  comunicacao: "Procedimento de comunicação",
  treinamentos: "Treinamentos e qualificações",
  dispositivo_adequado: "Adequação do dispositivo ao ambiente",
  interno: "Interno",
  terceirizado: "Terceirizado",
  conferencia: "Conferência",
  interrupcao: "Interrupção",
  solicitado: "Solicitado",
  gerando: "Gerando",
  disponivel: "Disponível",
  isolamento: "Isolamento com barreira física / guarda-corpo",
  sinalizacao: "Sinalização de segurança: placas, fitas e cones",
  lanterna: "Lanterna intrinsecamente segura",
  incendio: "Proteção contra incêndio e extintores",
  iluminacao: "Iluminação geral e escada móvel",
  movimentacao_vertical: "Movimentação vertical e suportes externos",
  epi_basico: "Capacete, calçado, luvas e óculos de proteção",
  quedas: "Cinturão, talabarte e trava-quedas",
  respirador: "Máscara e respirador selecionados para o risco",
  auditiva: "Proteção auditiva e creme de proteção",
  roupa: "Roupa de proteção aplicável",
  ar_trabalho: "Proteção respiratória / ar mandado para a equipe de trabalho",
  ar_resgate: "Proteção respiratória / ar mandado para o resgate",
  eletronicos: "Equipamentos elétricos e eletrônicos adequados à classificação do local",
};
const label = (v: string): string => LABELS[v] ?? v.replaceAll("_", " ");

// Helvetica's built-in WinAnsi font keeps Portuguese accents. Unsupported glyphs
// are transliterated instead of causing an otherwise valid report to fail.
function printable(raw: string, font: PDFFont): string {
  const normalized = [...raw]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code !== 127 && (code >= 32 || char === "\n" || char === "\r" || char === "\t");
    })
    .join("")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/₂/g, "2")
    .replace(/₀/g, "0")
    .replace(/₃/g, "3")
    .replace(/→/g, " -> ")
    .replace(/≤/g, " <= ")
    .replace(/≥/g, " >= ")
    .replace(/✓/g, "Sim")
    .replace(/×/g, "x");
  return [...normalized]
    .map((char) => {
      if (char === "\n" || char === "\t") return char;
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrap(raw: string, width: number, font: PDFFont, size: number): string[] {
  const output: string[] = [];
  for (const paragraph of printable(raw, font).replaceAll("\t", " ").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) {
        line = line ? `${line} ${word}` : word;
        continue;
      }
      if (line) {
        output.push(line);
        line = "";
      }
      let part = "";
      for (const char of word) {
        if (part && font.widthOfTextAtSize(part + char, size) > width) {
          output.push(part);
          part = "";
        }
        part += char;
      }
      line = part;
    }
    output.push(line);
  }
  return output.length ? output : [""];
}

function duration(v: Json | undefined): string {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return "Não informado pelo servidor";
  const seconds = Math.max(0, Math.floor(n));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}min ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Generates a derived consultation report, never a replacement for a signed
 * original. All official durations come from pet_obter's server projections. */
export async function gerarPetPdf(
  detalhe: Record<string, Json>,
  imagens: PetPdfImagem[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = object(detalhe["pet"]);
  const os = object(detalhe["os"]);
  const snapshot = object(p["snapshot_identificacao"]);
  const space = object(snapshot["espaco"]);
  const currentSpace = object(detalhe["espaco"]);
  const content = object(p["conteudo"]);
  const numero = value(p["numero"]);
  const timezone = typeof p["timezone"] === "string" ? p["timezone"] : "America/Sao_Paulo";
  const at = (v: Json | undefined): string => {
    if (typeof v !== "string" || !v) return "Não informado";
    const parsed = new Date(v);
    if (!Number.isFinite(parsed.getTime())) return v;
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: timezone,
      }).format(parsed);
    } catch {
      return parsed.toISOString();
    }
  };
  const authorNames = new Map(
    records(detalhe["participantes"]).map((x) => [
      value(x["pessoa_id"]),
      value(x["nome_snapshot"] ?? x["pessoa_nome"] ?? x["nome"]),
    ]),
  );
  const person = (id: Json | undefined): string => authorNames.get(value(id)) ?? value(id);
  const ink = rgb(0.13, 0.16, 0.17),
    muted = rgb(0.37, 0.41, 0.42),
    green = rgb(0.13, 0.34, 0.25);
  const gray = rgb(0.94, 0.95, 0.95),
    white = rgb(1, 1, 1),
    line = rgb(0.82, 0.85, 0.84);
  const width = 595.28,
    height = 841.89,
    margin = 42,
    usable = width - margin * 2,
    bottom = 52;
  let page!: PDFPage;
  let y = 0;
  const draw = (text: string, x: number, baseline: number, size = 9, isBold = false, color = ink) =>
    page.drawText(printable(text, isBold ? bold : regular), {
      x,
      y: baseline,
      size,
      font: isBold ? bold : regular,
      color,
    });
  const newPage = () => {
    page = doc.addPage([width, height]);
    y = height - 91;
    draw("NEXUS", margin, height - 35, 15, true, green);
    draw("PET Digital | Permissão de Entrada e Trabalho", margin + 78, height - 33, 10, true);
    draw(`${numero}  |  RELATÓRIO DERIVADO DE CONSULTA`, margin, height - 56, 9, true, muted);
    page.drawLine({
      start: { x: margin, y: height - 68 },
      end: { x: width - margin, y: height - 68 },
      thickness: 0.7,
      color: line,
    });
  };
  const ensure = (needed: number) => {
    if (y - needed < bottom) newPage();
  };
  const paragraph = (text: string, size = 9, isBold = false) => {
    for (const textLine of wrap(text, usable, isBold ? bold : regular, size)) {
      ensure(size + 5);
      draw(textLine, margin, y, size, isBold);
      y -= size + 4;
    }
    y -= 5;
  };
  const section = (title: string) => {
    ensure(115);
    y -= 8;
    page.drawRectangle({ x: margin, y: y - 5, width: usable, height: 23, color: gray });
    draw(title, margin + 8, y + 2, 11, true, green);
    y -= 24;
  };
  const table = (headers: string[], rows: string[][], fractions: number[]) => {
    const widths = fractions.map((fraction) => fraction * usable);
    const fontSize = 8.3,
      leading = 11.6,
      padding = 6;
    const headerLines = headers.map((h, i) =>
      wrap(h, (widths[i] ?? 50) - padding * 2, bold, fontSize),
    );
    const headerHeight = Math.max(...headerLines.map((x) => x.length)) * leading + padding * 2;
    const header = () => {
      ensure(headerHeight + 26);
      page.drawRectangle({
        x: margin,
        y: y - headerHeight,
        width: usable,
        height: headerHeight,
        color: green,
      });
      let x = margin;
      headerLines.forEach((lines, i) => {
        lines.forEach((textLine, n) =>
          draw(textLine, x + padding, y - padding - fontSize - n * leading, fontSize, true, white),
        );
        x += widths[i] ?? 0;
      });
      y -= headerHeight;
    };
    header();
    const actualRows = rows.length
      ? rows
      : [headers.map((_, i) => (i === 0 ? "Nenhum registro nesta consulta." : ""))];
    actualRows.forEach((row, index) => {
      const cells = headers.map((_, i) =>
        wrap(row[i] ?? "", (widths[i] ?? 50) - padding * 2, regular, fontSize),
      );
      let offset = 0;
      const totalLines = Math.max(...cells.map((x) => x.length));
      const completeHeight = totalLines * leading + padding * 2;
      if (y - completeHeight < bottom && completeHeight <= height - 91 - bottom - headerHeight) {
        newPage();
        header();
      }
      while (offset < totalLines) {
        let room = Math.floor((y - bottom - padding * 2) / leading);
        if (room < 1) {
          newPage();
          header();
          room = Math.floor((y - bottom - padding * 2) / leading);
        }
        const take = Math.min(room, totalLines - offset);
        const rowHeight = take * leading + padding * 2;
        if (index % 2 === 0)
          page.drawRectangle({
            x: margin,
            y: y - rowHeight,
            width: usable,
            height: rowHeight,
            color: gray,
          });
        let x = margin;
        cells.forEach((lines, i) => {
          lines
            .slice(offset, offset + take)
            .forEach((textLine, n) =>
              draw(textLine, x + padding, y - padding - fontSize - n * leading, fontSize),
            );
          x += widths[i] ?? 0;
        });
        y -= rowHeight;
        page.drawLine({
          start: { x: margin, y },
          end: { x: width - margin, y },
          thickness: 0.4,
          color: line,
        });
        offset += take;
        if (offset < totalLines) {
          newPage();
          header();
        }
      }
    });
    y -= 9;
  };
  const pairs = (items: [string, string][]) => table(["Campo", "Registro"], items, [0.3, 0.7]);
  const snapshotName = (key: string, fallback?: Json): string => {
    const item = snapshot[key];
    if (typeof item === "string") return item;
    const obj = object(item);
    return value(
      obj["nome"] ??
        obj["nome_exibicao"] ??
        obj["razao_social"] ??
        obj["identificacao"] ??
        fallback,
    );
  };

  doc.setTitle(`PET Digital Nexus - ${numero} - Relatório derivado`);
  doc.setAuthor("Nexus - consulta autorizada de registros");
  doc.setSubject("Relatório derivado; não substitui os originais assinados nem autoriza entrada.");
  const serverAt =
    typeof detalhe["servidor_em"] === "string" ? new Date(detalhe["servidor_em"]) : null;
  if (serverAt && Number.isFinite(serverAt.getTime())) {
    doc.setCreationDate(serverAt);
    doc.setModificationDate(serverAt);
  }
  newPage();
  paragraph(
    "RELATÓRIO DERIVADO. Não autoriza entrada e não substitui o documento de emissão ou os originais certificados. Um rascunho permanece sem liberação, mesmo quando exportado.",
    10,
    true,
  );
  paragraph(
    `Fonte: registros autorizados retornados pelo servidor. Consulta: ${at(detalhe["servidor_em"])}. Fuso preservado: ${timezone}.`,
    8.5,
  );
  section("1. Identificação e período");
  pairs([
    ["PET / versão de trabalho", `${numero} / ${value(p["version"])}`],
    ["Identificador", value(p["id"])],
    ["Organização responsável", snapshotName("organizacao", p["organization_id"])],
    [
      "Cliente / unidade",
      `${snapshotName("cliente", p["cliente_id"])} / ${snapshotName("unidade", p["unidade_id"])}`,
    ],
    ["OS vinculada", `${value(os["numero"] ?? p["os_id"])} - ${value(os["titulo"])}`],
    [
      "Espaço confinado",
      value(
        (typeof snapshot["espaco"] === "string" ? snapshot["espaco"] : undefined) ??
          space["identificacao"] ??
          currentSpace["identificacao"] ??
          snapshot["espaco_identificacao"] ??
          p["espaco_id"],
      ),
    ],
    [
      "Localização preservada",
      value(space["localizacao"] ?? snapshot["localizacao"] ?? currentSpace["localizacao"]),
    ],
    ["Atividade / objetivo", value(p["atividade"])],
    ["Situação documental", label(value(p["estado_documental"]))],
    [
      "Condição / validade",
      `${label(value(p["condicao_operacional"]))} / ${label(value(p["validade_temporal"]))}`,
    ],
    ["Emissão / término previsto", `${at(p["emitida_em"])} / ${at(p["termino_previsto"])}`],
    ["Término operacional", at(p["termino_operacional_em"])],
    ["Conclusão documental", at(p["encerrada_em"])],
    [
      "Modelo aprovado / revisão atual",
      `${value(p["modelo_versao_id"])} / ${value(p["revisao_atual_id"])}`,
    ],
  ]);
  section("2. Equipe e vigências");
  table(
    ["Pessoa / função", "Vínculo / empresa", "Vigência / contato"],
    records(detalhe["participantes"]).map((x) => [
      `${value(x["nome_snapshot"] ?? x["pessoa_nome"] ?? x["nome"])}\n${label(value(x["funcao"]))}`,
      `${label(value(x["classificacao"]))}\n${value(x["empresa"])}`,
      `${at(x["inicio"] ?? x["inicio_vigencia"])}\nAté: ${x["fim"] || x["fim_vigencia"] ? at(x["fim"] ?? x["fim_vigencia"]) : "Vigência sem fim registrado"}\n${value(x["contato"])}`,
    ]),
    [0.35, 0.25, 0.4],
  );
  pairs([["Emergência e resgate / contatos", value(content["contatos_emergencia"])]]);
  section("3. Perigos e medidas preventivas");
  table(
    ["Grupo / perigo", "Medida preventiva", "Evidência / referência"],
    records(content["perigos"]).map((x) => [
      `${value(x["grupo"])}\n${value(x["perigo"] ?? x["descricao"])}`,
      value(x["medida"]),
      value(x["evidencia"]),
    ]),
    [0.28, 0.43, 0.29],
  );
  section("4. EPC, EPI e verificações");
  table(
    ["Item", "Resposta", "Justificativa / conferência"],
    records(detalhe["respostas"]).map((x) => [
      label(value(x["rotulo"] ?? x["item"])),
      label(value(x["resposta"])),
      `${value(x["justificativa"])}\nConferência: ${at(x["conferido_em"])}\nRegistrante: ${value(x["conferido_por"])}`,
    ]),
    [0.37, 0.2, 0.43],
  );
  section("5. Procedimentos e monitoramento");
  pairs(Object.entries(object(content["procedimentos"])).map(([k, v]) => [label(k), value(v)]));
  const monitoring = object(content["monitoramento_continuo"]);
  pairs([
    ["Verificação declarada", value(monitoring["confirmado"])],
    ["Equipamento / identificação", value(monitoring["equipamento"])],
    ["Procedimento / registro contínuo", value(monitoring["registro"])],
    ["Outras informações", value(content["outras_informacoes"])],
  ]);
  paragraph(
    "Leituras manuais pontuais não comprovam monitoramento atmosférico contínuo. Esta consulta reproduz os registros e suas origens; não declara, por si, que o ambiente é seguro.",
    8.5,
  );
  section("6. Avaliações atmosféricas e instrumentos");
  const assessments = records(detalhe["avaliacoes"]);
  if (!assessments.length) paragraph("Nenhuma avaliação atmosférica registrada nesta consulta.");
  for (const assessment of assessments) {
    pairs([
      ["Etapa / momento", `${label(value(assessment["etapa"]))} / ${at(assessment["momento"])}`],
      [
        "Avaliação / responsável",
        `${value(assessment["id"])} / ${person(assessment["responsavel_id"])}`,
      ],
      [
        "Instrumento / série",
        `${value(assessment["instrumento"])} / ${value(assessment["numero_serie"])}`,
      ],
      ["Calibração / verificação", value(assessment["calibracao"])],
      [
        "Contexto / recebimento",
        `${value(assessment["contexto"])}\nRecebida em: ${at(assessment["recebido_em"])}`,
      ],
    ]);
    const readings = [
      ...records(detalhe["leituras"]).filter((x) => x["avaliacao_id"] === assessment["id"]),
      ...records(assessment["leituras"]),
    ];
    table(
      ["Agente", "Valor", "Unidade", "Origem"],
      readings.map((x) => [
        value(x["agente"]),
        value(x["valor"]).replace(".", ","),
        value(x["unidade"]),
        value(x["origem"]),
      ]),
      [0.25, 0.2, 0.2, 0.35],
    );
  }
  section("7. Entradas, saídas e retificações");
  table(
    ["Pessoa / evento", "Declarado / recebido", "Origem / assinatura / autoria"],
    records(detalhe["presencas"]).map((x) => [
      `${person(x["pessoa_id"])}\n${label(value(x["tipo"]))}\nEvento: ${value(x["id"])}`,
      `${at(x["momento_declarado"] ?? x["momento"])}\nRecebido: ${at(x["recebido_em"])}`,
      `${label(value(x["origem"]))}\n${x["assinatura_pendente"] === true ? "Assinatura pendente" : x["assinatura_id"] ? `Assinatura: ${value(x["assinatura_id"])}` : "Sem assinatura vinculada"}\nRegistrante: ${value(x["created_by"])}${x["retifica_id"] ? `\nRetifica: ${value(x["retifica_id"])}\nMotivo: ${value(x["motivo"])}` : ""}`,
    ]),
    [0.32, 0.3, 0.38],
  );
  section("8. Permanência e medidas de tempo");
  table(
    ["Pessoa", "Entrada / saída", "Permanência (servidor)"],
    records(detalhe["intervalos"]).map((x) => [
      value(x["pessoa_nome"] ?? x["nome"] ?? person(x["pessoa_id"])),
      `${x["retificacao_entrada_id"] ? "Entrada após retificação: " : "Entrada: "}${at(x["entrada_em"])}\n${x["retificacao_saida_id"] ? "Saída após retificação: " : "Saída: "}${x["saida_em"] ? at(x["saida_em"]) : "SEM SAÍDA REGISTRADA"}${x["retificacao_entrada_id"] ? `\nEntrada original: ${at(x["entrada_original_em"])}` : ""}${x["retificacao_saida_id"] ? `\nSaída original: ${at(x["saida_original_em"])}` : ""}`,
      duration(x["segundos"]),
    ]),
    [0.34, 0.38, 0.28],
  );
  const metrics = object(detalhe["metricas"]);
  pairs([
    ["Duração documental", duration(metrics["duracao_documental_segundos"])],
    ["Horas-pessoa", duration(metrics["horas_pessoa_segundos"])],
    ["Presenças ainda abertas", value(metrics["presentes"])],
    [
      "Apontamento da OS",
      "Fonte independente. A permanência PET não é lançada automaticamente em cobrança, folha ou horas da OS.",
    ],
  ]);
  paragraph(
    "Os intervalos abertos refletem a consulta do servidor indicada no início. Vencimento e interrupção não inventam saídas nem interrompem a permanência.",
    8.5,
  );
  section("9. Ocorrências, passagens e prorrogações");
  table(
    ["Evento / responsável", "Momento", "Motivo / dados registrados"],
    records(detalhe["eventos"]).map((x) => [
      `${label(value(x["tipo"]))}\n${value(x["created_by"])}`,
      at(x["momento"] ?? x["created_at"]),
      `${value(x["motivo"])}\n${value(x["dados"])}`,
    ]),
    [0.26, 0.23, 0.51],
  );
  for (const extension of records(detalhe["prorrogacoes"]))
    pairs([
      [
        "Prorrogação / decisão",
        `${value(extension["id"])} / ${label(value(extension["decisao"]))}`,
      ],
      [
        "Período anterior / novo",
        `${at(extension["termino_anterior"])} / ${at(extension["termino_novo"])}`,
      ],
      [
        "Supervisor / condições / motivo",
        `${person(extension["supervisor_id"])}\n${value(extension["condicoes"])}\n${value(extension["motivo"])}`,
      ],
    ]);
  const corrections = records(detalhe["retificacoes"]);
  if (corrections.length) {
    paragraph("Retificações formais e decisões relacionadas", 10, true);
    table(
      ["Solicitação / evento", "Original / proposto", "Motivo / evidência / autoria"],
      corrections.map((x) => [
        `${value(x["id"])}\nEvento: ${value(x["evento_id"])}`,
        `${at(x["momento_original"])}\nProposto: ${at(x["momento_corrigido"])}`,
        `${value(x["motivo"])}\nEvidência: ${value(x["evidencia_id"])}\nSolicitante: ${value(x["solicitado_por"])}\n${at(x["solicitado_em"])}`,
      ]),
      [0.28, 0.27, 0.45],
    );
    table(
      ["Decisão / responsável", "Momento / revisão", "Solicitação / justificativa"],
      records(detalhe["retificacao_decisoes"]).map((x) => [
        `${label(value(x["decisao"]))}\n${person(x["responsavel_id"])}`,
        `${at(x["decidido_em"])}\nRevisão: ${value(x["revisao_id"])}`,
        `${value(x["retificacao_id"])}\n${value(x["motivo"])}`,
      ]),
      [0.28, 0.29, 0.43],
    );
    paragraph(
      "Os eventos e as assinaturas originais preservam seus horários originais. Uma decisão de retificação aprovada altera a projeção em revisão própria; a assinatura original não certifica automaticamente o horário corrigido.",
      8.5,
    );
  }
  section("10. Assinaturas e informações de verificação");
  paragraph(
    "Assinatura coletada na tela e aceite autenticado são distintos de assinatura certificada ICP-Brasil. A imagem de uma assinatura não comprova certificação. Consulte os originais e a validação do provedor.",
    8.5,
  );
  table(
    ["Signatário / finalidade", "Método / situação", "Vínculo / provedor / momento"],
    records(detalhe["assinaturas"]).map((x) => [
      `${person(x["pessoa_id"])}\n${label(value(x["finalidade"]))}\n${value(x["declaracao"])}`,
      `${label(value(x["metodo"]))}\n${label(value(x["estado"]))}`,
      `ID: ${value(x["id"])}\nRevisão: ${value(x["revisao_id"])}\nConteúdo SHA-256: ${value(x["conteudo_sha256"] ?? x["conteudo_hash"])}\nProvedor: ${value(x["provedor"])} / ${value(x["provedor_id"])}\nEvento: ${at(x["evento_em"])}\nAssinatura: ${at(x["assinada_em"])}\nIdentidade verificada: ${x["identidade_verificada"] ? "Evidência registrada no servidor" : "Não informada"}\nValidação: ${value(object(x["validacao"])["resultado"] ?? object(x["validacao"])["status"])}`,
    ]),
    [0.3, 0.22, 0.48],
  );
  section("11. Revisões, documentos e integridade");
  const reportContext = object(detalhe["relatorio_contexto"]);
  if (reportContext["documento_id"])
    pairs([
      ["Documento desta consulta", value(reportContext["documento_id"])],
      [
        "Revisão própria / versão PET",
        `${value(reportContext["revisao_relatorio_id"])} / ${value(reportContext["pet_version"])}`,
      ],
      ["SHA-256 do snapshot desta consulta", value(detalhe["relatorio_snapshot_sha256"])],
    ]);
  table(
    ["Revisão / finalidade", "Momento", "Identificador / SHA-256"],
    records(detalhe["revisoes"]).map((x) => [
      `${value(x["versao"] ?? x["numero"])} / ${label(value(x["finalidade"]))}`,
      at(x["created_at"] ?? x["criada_em"]),
      `${value(x["id"])}\n${value(x["sha256"] ?? x["hash"])}`,
    ]),
    [0.25, 0.25, 0.5],
  );
  table(
    ["Documento / tipo / situação", "Relação ao original", "SHA-256 / arquivo"],
    records(detalhe["documentos"]).map((x) => [
      `${value(x["id"])}\n${label(value(x["tipo"]))} / ${label(value(x["estado"]))}`,
      `${value(x["original_documento_id"])}\nRevisão: ${value(x["revisao_id"])}`,
      `${value(x["sha256"])}\nAnexo: ${value(x["anexo_id"])}`,
    ]),
    [0.34, 0.28, 0.38],
  );
  paragraph(
    "Os artefatos originalmente assinados devem ser preservados integralmente. Este relatório derivado relaciona seus identificadores e hashes; sua geração não preserva nem recria a certificação dos originais.",
    8.5,
  );
  section("12. Evidências e fotografias");
  if (detalhe["nota_imagens"]) paragraph(value(detalhe["nota_imagens"]));
  table(
    ["Arquivo / contexto", "Autoria / momento / situação", "Integridade / legenda"],
    records(detalhe["anexos"] ?? detalhe["arquivos"]).map((x) => [
      `${value(x["nome"])}\n${value(x["pet_item"] ?? x["pet_contexto"] ?? x["contexto"] ?? x["item"])}`,
      `${value(x["created_by"])}\n${at(x["created_at"])}\n${label(value(x["estado"]))}`,
      `${value(x["sha256"])}\n${value(x["legenda"])}`,
    ]),
    [0.3, 0.3, 0.4],
  );
  for (const picture of imagens) {
    try {
      const embedded =
        picture.mime === "image/png"
          ? await doc.embedPng(picture.bytes)
          : picture.mime === "image/jpeg"
            ? await doc.embedJpg(picture.bytes)
            : null;
      if (!embedded) {
        paragraph(`${picture.nome}: formato não incorporado; consultar o original privado.`);
        continue;
      }
      const scale = Math.min(usable / embedded.width, 190 / embedded.height, 1);
      const imgWidth = embedded.width * scale,
        imgHeight = embedded.height * scale;
      const caption = wrap(
        `${picture.nome}${picture.legenda ? ` - ${picture.legenda}` : ""}`,
        usable,
        regular,
        8.5,
      );
      ensure(imgHeight + Math.min(caption.length, 3) * 13 + 18);
      page.drawImage(embedded, { x: margin, y: y - imgHeight, width: imgWidth, height: imgHeight });
      y -= imgHeight + 13;
      paragraph(`${picture.nome}${picture.legenda ? ` - ${picture.legenda}` : ""}`, 8.5);
    } catch {
      paragraph(
        `${picture.nome}: não foi possível incorporar a imagem; consultar o original privado e conferir sua integridade.`,
      );
    }
  }
  section("13. Pendências e conferência final");
  const pending = Array.isArray(detalhe["pendencias"]) ? detalhe["pendencias"] : [];
  if (pending.length)
    pending.forEach((item) => {
      const entry = object(item);
      paragraph(
        `- ${typeof item === "string" ? item : value(entry["mensagem"] ?? entry["descricao"] ?? entry["codigo"])}`,
      );
    });
  else
    paragraph(
      "Nenhuma pendência retornada nesta consulta. Este resultado não substitui a conferência atual nem autoriza entrada.",
    );
  paragraph(
    "Conferir separadamente presença, término operacional, condição final, ocorrências, evidências e assinaturas. Uma pendência documental não pode ocultar pessoa sem saída registrada.",
    9,
    true,
  );
  paragraph(
    "Referências: NR-33, itens 33.5.5 a 33.5.12.1.1 e 33.5.15; NR-01, itens 1.6.2 a 1.6.5.1. Modelo, critérios e procedimento requerem aprovação do responsável técnico da organização.",
    8,
  );
  const pages = doc.getPages();
  pages.forEach((pdfPage, i) => {
    pdfPage.drawLine({
      start: { x: margin, y: 37 },
      end: { x: width - margin, y: 37 },
      thickness: 0.5,
      color: line,
    });
    pdfPage.drawText(
      printable(
        "Consulta privada | Relatório derivado | Originais certificados separados",
        regular,
      ),
      { x: margin, y: 24, font: regular, size: 7.3, color: muted },
    );
    const pagination = `${i + 1} / ${pages.length}`;
    pdfPage.drawText(pagination, {
      x: width - margin - regular.widthOfTextAtSize(pagination, 8),
      y: 24,
      font: regular,
      size: 8,
      color: muted,
    });
  });
  return doc.save();
}
