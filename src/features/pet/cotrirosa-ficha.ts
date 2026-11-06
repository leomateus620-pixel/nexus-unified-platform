/**
 * Catálogo da ficha PET Cotrirosa (papel de referência), compartilhado por demo e operação.
 * Rótulos espelham a ficha; adequação de cada equipamento e limites atmosféricos dependem
 * do modelo aprovado e da verificação de campo. Nenhum limite de H₂S/CO/LIE é definido aqui.
 */
import type { DemoPerigoCat } from "./demo/catalogo";

export const FICHA_VERSAO = "cotrirosa-ficha-1";
export type Estado = "S" | "N" | "NA" | "NV";
export const ESTADO_LABEL: Record<Estado, string> = {
  S: "Sim",
  N: "Não",
  NA: "Não se aplica",
  NV: "Não verificado",
};
export type FichaItem = {
  id: string;
  label: string;
  grupo: string;
  fase: "controle" | "antes" | "durante";
  estados: Estado[];
  detalhe?: string[];
};
const SNNA: Estado[] = ["S", "N", "NA"];
const SN: Estado[] = ["S", "N"];

export const FICHA_PERIGOS: DemoPerigoCat[] = [
  ["Químicos", ["Poeiras", "Fumos", "Gases tóxicos", "Vapores", "Névoas", "Derivados de petróleo"]],
  ["Físicos", ["Ruído", "Calor", "Frio", "Umidade", "Radiação ionizante", "Radiação não ionizante"]],
  ["Ergonômicos", ["Esforço intenso", "Manuseio de carga", "Repetitividade", "Monotonia", "Deficiência de luz", "Trabalho noturno"]],
  ["Biológicos", ["Vírus", "Bactérias", "Fungos", "Parasitas"]],
  ["Acidentes", ["Queda", "Queimaduras", "Corte", "Choque elétrico", "Intempéries", "Animais peçonhentos"]],
].map(([grupo, itens]) => ({
  grupo: grupo as string,
  itens: (itens as string[]).map((perigo) => ({ perigo, medidas: [] as string[] })),
}));

const g = (grupo: string, fase: FichaItem["fase"], list: [string, string, Estado[]?, string[]?][]) =>
  list.map(([id, label, estados, detalhe]) => ({
    id, label, grupo, fase, estados: estados ?? SNNA, ...(detalhe ? { detalhe } : {}),
  }));

export const FICHA_ITENS: FichaItem[] = [
  ...g("EPC · isolamento e proteção", "controle", [
    ["epc_barreira", "Isolamento com barreira física (guarda-corpo)"],
    ["epc_sinalizacao", "Isolamento com sinalização (placas/fitas/cones)"],
    ["epc_lanterna", "Lanterna intrinsecamente segura"],
    ["epc_extintor", "Proteção contra incêndio (extintores)"],
  ]),
  ...g("EPC · resgate e acesso", "controle", [
    ["epc_resgate_4x1", "Sistema de resgate 4×1 (sujeito ao plano de resgate)"],
    ["epc_corda", "Corda de segurança"],
    ["epc_iluminacao_fixa", "Iluminação geral fixa"],
    ["epc_escada_movel", "Escada móvel"],
    ["epc_radio_ex", "Comunicação por rádio adequado a área potencialmente explosiva"],
    ["epc_mov_vertical", "Equipamentos de movimentação vertical/suportes externos"],
  ]),
  ...g("EPI · proteção básica e quedas", "controle", [
    ["epi_basico", "Capacete, calçado/botas, luvas e óculos de proteção"],
    ["epi_cinturao", "Cinturão de segurança", ["S", "N"]],
    ["epi_talabarte", "Talabarte"],
    ["epi_trava_quedas", "Trava-quedas"],
  ]),
  ...g("EPI · respiradores e proteção pessoal", "controle", [
    ["epi_respirador", "Máscara/respirador", SNNA, ["PFF1", "PFF2", "Respirador semifacial"]],
    ["epi_auricular", "Protetor auricular"],
    ["epi_creme", "Creme de proteção"],
    ["epi_roupa", "Roupa de proteção (risco químico, biológico ou solda)"],
  ]),
  ...g("EPI · proteção respiratória e adequação", "controle", [
    ["epi_resp_trabalho", "Autônomo ou ar mandado c/ cilindro de escape — equipe de trabalho"],
    ["epi_resp_resgate", "Autônomo ou ar mandado c/ cilindro de escape — equipe de resgate"],
    ["epi_eletrico_ex", "Equipamentos elétricos/eletrônicos adequados a área potencialmente explosiva"],
  ]),
  ...g("Antes da entrada · procedimentos", "antes", [
    ["pre_bloqueio", "Bloqueios, travamento e etiquetagem de equipamentos"],
    ["pre_purga", "Purga e/ou lavagem"],
    ["pre_ventilacao", "Ventilação/exaustão"],
    ["pre_comunicacao", "Procedimentos de comunicação"],
    ["pre_resgate", "Procedimentos de resgate"],
    ["pre_mov_vertical", "Procedimentos e proteção de movimentação vertical"],
    ["pre_treinamento", "Treinamento de todos os trabalhadores conferido?", SN],
    ["pre_treinamento_valido", "Treinamentos válidos?", SN],
    ["pre_monitor_continuo", "Monitor contínuo de gases adequado (leitura direta, alarmes, área Ex)", SN],
  ]),
  ...g("Durante o trabalho", "durante", [
    ["dur_trabalho_quente", "Permissão de trabalho a quente"],
  ]),
];

export type Resposta = { estado: Estado; justificativa?: string; detalhe?: string };
export type Outro = { id: string; grupo: "EPC" | "EPI"; descricao: string; estado: Estado };
export type TesteMeta = {
  responsavel?: string;
  aparelho_filial?: "S" | "NA";
  instrumento?: string;
  serie?: string;
  confirmado?: boolean;
};
export type Ficha = {
  versao: string;
  respostas: Record<string, Resposta>;
  outros?: Outro[];
  testes?: { inicial?: TesteMeta; pos_ventilacao?: TesteMeta };
  ventilacao?: { tipo?: "Natural" | "Mecânica"; equipamento?: "Insuflador móvel" | "Insuflador fixo"; tempo_min?: string };
  quente?: { referencia?: string };
};
export const emptyFicha = (): Ficha => ({ versao: FICHA_VERSAO, respostas: {} });

/** Every item starts "Não verificado"; legacy keys never answer new independent IDs. */
export function estadoDe(f: Ficha | undefined, id: string): Estado {
  return f?.respostas?.[id]?.estado ?? "NV";
}

export type Momento = "inicial" | "pos_ventilacao";
type Leitura = { agente: string; valor: string; momento?: string | undefined };
/** Legacy "pre_entrada" readings are shown under the initial test. */
export const leiturasDe = <T extends Leitura>(list: T[], m: Momento) =>
  list.filter((r) => (r.momento === "pre_entrada" || !r.momento ? "inicial" : r.momento) === m);

/** NR-33 33.5.15.2: 19,5–23 % vol only with known and controlled cause; outside blocks. */
export function o2Status(valor: string): "ok" | "atencao" | "bloqueio" {
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 19.5 || v > 23) return "bloqueio";
  return v === 20.9 ? "ok" : "atencao";
}

export type Pendencia = { id: string; texto: string; tipo: "pendente" | "impeditiva" };
export function fichaPendencias(f: Ficha | undefined, leituras: Leitura[] = []): Pendencia[] {
  const out: Pendencia[] = [];
  for (const it of FICHA_ITENS) {
    const r = f?.respostas?.[it.id];
    const e = r?.estado ?? "NV";
    if (e === "NV") out.push({ id: it.id, texto: `${it.label}: não verificado`, tipo: "pendente" });
    else if (e === "N") out.push({ id: it.id, texto: `${it.label}: marcado como Não — entrada proibida`, tipo: "impeditiva" });
    else if (e === "NA" && (r?.justificativa ?? "").trim().length < 3)
      out.push({ id: it.id, texto: `${it.label}: justifique o "Não se aplica"`, tipo: "pendente" });
  }
  for (const o of f?.outros ?? []) {
    if (o.descricao.trim().length < 2) out.push({ id: o.id, texto: `Outros (${o.grupo}): descreva o item`, tipo: "pendente" });
    if (o.estado === "NV") out.push({ id: o.id, texto: `Outros (${o.grupo}) ${o.descricao}: não verificado`, tipo: "pendente" });
    if (o.estado === "N") out.push({ id: o.id, texto: `Outros (${o.grupo}) ${o.descricao}: marcado como Não`, tipo: "impeditiva" });
  }
  if (estadoDe(f, "dur_trabalho_quente") === "S" && !(f?.quente?.referencia ?? "").trim())
    out.push({ id: "dur_trabalho_quente", texto: "Trabalho a quente aplicável: vincule a permissão autorizada", tipo: "pendente" });
  const vent = estadoDe(f, "pre_ventilacao");
  if (vent === "S" && (!f?.ventilacao?.tipo || !(f?.ventilacao?.tempo_min ?? "").trim()))
    out.push({ id: "pre_ventilacao", texto: "Ventilação: informe tipo e tempo real", tipo: "pendente" });
  for (const m of ["inicial", "pos_ventilacao"] as Momento[]) {
    const nome = m === "inicial" ? "Teste inicial" : "Teste após ventilação/isolamento";
    if (m === "pos_ventilacao" && vent !== "S") continue;
    const ls = leiturasDe(leituras, m);
    for (const a of ["H₂S", "CO", "Inflamáveis", "O₂"])
      if (!ls.some((l) => l.agente === a)) out.push({ id: `teste_${m}`, texto: `${nome}: falta ${a}`, tipo: "pendente" });
    for (const l of ls.filter((x) => x.agente === "O₂"))
      if (o2Status(l.valor) === "bloqueio")
        out.push({ id: `teste_${m}`, texto: `${nome}: O₂ ${l.valor} % fora de 19,5–23 % — entrada bloqueada`, tipo: "impeditiva" });
    const meta = f?.testes?.[m];
    if (ls.length && !(meta?.responsavel ?? "").trim())
      out.push({ id: `teste_${m}`, texto: `${nome}: informe o supervisor dos testes`, tipo: "pendente" });
  }
  return out;
}

/** Test that supports entry: the latest collected test. */
export const testeDaEntrada = (f: Ficha | undefined): Momento =>
  estadoDe(f, "pre_ventilacao") === "S" ? "pos_ventilacao" : "inicial";

export const CONTATOS_FIXOS = [
  { nome: "SAMU", numero: "192" },
  { nome: "Bombeiros", numero: "193" },
];
