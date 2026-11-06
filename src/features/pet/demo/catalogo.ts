/**
 * Catálogo de DEMONSTRAÇÃO — não validado tecnicamente.
 * Serve apenas para exercitar o preenchimento por toque na PET demo.
 * A PET operacional usa somente o modelo aprovado da unidade.
 * Nenhum limite ou valor de medição é definido aqui.
 */
export const DEMO_CATALOGO_AVISO = "Catálogo de demonstração — não validado tecnicamente";

export type DemoPerigoCat = { grupo: string; itens: { perigo: string; medidas: string[] }[] };

export const DEMO_PERIGOS: DemoPerigoCat[] = [
  {
    grupo: "Atmosfera",
    itens: [
      { perigo: "Deficiência de oxigênio", medidas: ["Ventilação", "Avaliação atmosférica antes da entrada", "Monitoramento contínuo"] },
      { perigo: "Atmosfera inflamável / poeira combustível", medidas: ["Ventilação", "Avaliação atmosférica antes da entrada", "Controle de fontes de ignição"] },
      { perigo: "Gases tóxicos (CO, H₂S)", medidas: ["Ventilação", "Avaliação atmosférica antes da entrada", "Monitoramento contínuo"] },
    ],
  },
  {
    grupo: "Energias perigosas",
    itens: [
      { perigo: "Partida de transportadores / roscas", medidas: ["Bloqueio e etiquetagem", "Teste de partida após bloqueio"] },
      { perigo: "Energia elétrica", medidas: ["Bloqueio e etiquetagem", "Teste de ausência de tensão"] },
    ],
  },
  {
    grupo: "Engolfamento / soterramento",
    itens: [
      { perigo: "Engolfamento por produto", medidas: ["Bloqueio da alimentação e descarga", "Controle de movimentação de produto", "Linha de vida com resgate"] },
      { perigo: "Produto aderido nas paredes", medidas: ["Inspeção visual prévia", "Remoção a partir de posição segura"] },
    ],
  },
  {
    grupo: "Acesso e queda",
    itens: [
      { perigo: "Queda na abertura de acesso", medidas: ["Isolamento e sinalização", "Proteção coletiva na abertura"] },
      { perigo: "Queda durante descida", medidas: ["Sistema de proteção contra quedas", "Ancoragem cadastrada"] },
    ],
  },
  {
    grupo: "Temperatura e agentes físicos",
    itens: [
      { perigo: "Calor", medidas: ["Pausas e hidratação", "Ventilação"] },
      { perigo: "Ruído", medidas: ["Proteção auditiva"] },
    ],
  },
  { grupo: "Outros", itens: [{ perigo: "Iluminação insuficiente", medidas: ["Iluminação adequada à classificação da área"] }] },
];

/** Agentes da demo: unidade fixa por agente, sem conversão e sem limites. */
export const DEMO_AGENTES = [
  { agente: "O₂", unidade: "% vol" },
  { agente: "Inflamáveis", unidade: "% LIE" },
  { agente: "CO", unidade: "ppm" },
  { agente: "H₂S", unidade: "ppm" },
] as const;

export const DEMO_INSTRUMENTOS = ["Detector multigás — demonstração A", "Detector multigás — demonstração B"];
export const DEMO_PONTOS = ["Boca de visita superior", "Meio do silo", "Fundo / cone"];

export const DEMO_PROCEDIMENTOS: { grupo: string; opcoes: string[] }[] = [
  { grupo: "Controle de energias", opcoes: ["PO-BLQ Bloqueio e etiquetagem · rev. demo"] },
  { grupo: "Ventilação e monitoramento", opcoes: ["PO-VEN Ventilação exaustora · rev. demo", "PO-VEN Ventilação insuflada · rev. demo"] },
  { grupo: "Comunicação", opcoes: ["Rádio canal operacional · demo", "Contato visual e sonoro · demo"] },
  { grupo: "Emergência e resgate", opcoes: ["Plano de resgate do silo · rev. demo"] },
];
