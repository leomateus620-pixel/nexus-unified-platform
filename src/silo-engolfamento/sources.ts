/** Local evidence registry. Links open only after an explicit user action. */
export const SOURCE_REVIEW_DATE = "2026-10-14";

export interface EvidenceSource {
  readonly id: string;
  readonly institution: string;
  readonly title: string;
  readonly url: string;
  readonly edition: string;
  readonly locator: string;
  readonly purpose: string;
  readonly limitation: string;
  readonly accessedOn: string;
}

const mteBase =
  "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/";
const purdueBase = "https://www.purdue.edu/engineering/abe/agconfinespaces/wp-content/uploads/";

export const SILO_SOURCES: readonly EvidenceSource[] = Object.freeze(
  [
    {
      id: "lvhf-presentation",
      institution: "Referência LVHF interna de silo fornecida para o upgrade Nexus",
      title: "LVHF interna — visualizador, componentes e cotas publicadas",
      url: "https://lvhfinternsilo.pplx.app/#visualizador",
      edition: "Referência de apresentação; configuração Nexus nexus-lvhf-2.0.0",
      locator:
        "Visualizador; Componentes do sistema; Cotas do silo e do anel; descrições da estrutura",
      purpose:
        "Origem dos valores publicados: raio interno 11 m, costado 24,88 m, topo 30,403 m, anel R10,926 m na cota 24,375 m, cabo Ø8 mm e onze pontos principais.",
      limitation:
        "Página de apresentação não é projeto executivo. CAD original, resistência das fixações, capacidade, pré-tensão e passagem mecânica exata não foram validados. Fundação, materiais, postura, conexão de 0,95 m e colapso local são hipóteses Nexus, identificadas em SiloConfig.ts.",
      accessedOn: "2026-10-15",
    },
    {
      id: "kepler-elevated",
      institution: "Kepler Weber",
      title: "Silos elevados",
      url: "https://kepler.com.br/solucoes/fazendas/silos-elevados",
      edition: "Página do fabricante consultada em outubro de 2026",
      locator: "Base cônica; Escada interna com cabo de vida; imagens do conjunto",
      purpose:
        "Referência histórica da PR #11 para a composição elevada anterior. Não define a geometria do silo de fundo plano deste upgrade.",
      limitation:
        "A aparência não fornece cotas nem dimensiona a ancoragem. Tremonha suspensa e pilares desse modelo não integram o silo atual; a cena não é produto comercial do fabricante.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "mte-nr31",
      institution: "Ministério do Trabalho e Emprego — Brasil",
      title: "NR-31 — Secadores, silos e espaços confinados",
      url: `${mteBase}normas-regulamentadora/normas-regulamentadoras-vigentes/nr-31-atualizada-2024-2.pdf`,
      edition: "Texto oficial atualizado pela Portaria MTE nº 342, de 21/03/2024",
      locator: "31.2.1–31.2.2; 31.13.5–31.13.6 e 31.13.13.2; pp. 2 e 40–42 do PDF",
      purpose:
        "Aplicação rural, acessos, entrada sem operação, trabalhador externo, riscos e medidas de proteção.",
      limitation:
        "A aplicação depende da atividade e do estabelecimento. O desenho não constitui verificação de conformidade nem substitui avaliação técnica.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "mte-nr33",
      institution: "Ministério do Trabalho e Emprego — Brasil",
      title: "NR-33 — Trabalho em espaços confinados",
      url: `${mteBase}arquivos/normas-regulamentadoras/nr-33-atualizada-2022-_retificada.pdf`,
      edition: "Texto de 2022 retificado; vigência informada em 03/10/2022",
      locator: "33.2.2.2; 33.3.4; 33.5.5, 33.5.14, 33.5.15 e 33.5.20; pp. 1, 3, 5 e 7–10",
      purpose:
        "PET, vigia, controle de energias perigosas, avaliação/monitoramento atmosférico e plano de resgate.",
      limitation:
        "Confirmar o campo de aplicação, inclusive as regras setoriais da NR-31. A simulação não emite PET nem habilita uma entrada real.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "osha-alert",
      institution: "OSHA — Estados Unidos",
      title: "Dangers of Engulfment and Suffocation in Grain Bins",
      url: "https://www.osha.gov/sites/default/files/publications/HAZARD-ALERT_GRAIN_BINS.pdf",
      edition: "Hazard Alert, agosto de 2011",
      locator: "p. 1: três mecanismos e exemplo temporal; pp. 2–3: prevenção e resgate",
      purpose:
        "Explicar fluxo pela descarga, colapso de ponte e queda de massa aderida como mecanismos distintos.",
      limitation:
        "O exemplo de 5/11 s considera trabalhador de 6 pés (aprox. 1,83 m) e uma vazão média referida pela fonte. Não é prazo de sobrevivência nem calibração para soja.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "osha-standard",
      institution: "OSHA — Estados Unidos",
      title: "29 CFR 1910.272 — Grain Handling Facilities",
      url: "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.272",
      edition: "Texto oficial disponível na consulta de 14/10/2026",
      locator: "1910.272(g)(1)–(6), especialmente (g)(1)(ii), (iv) e (g)(2)",
      purpose:
        "Bloqueio, proibição de caminhar em grãos em movimento e configuração de linha/cinturão que limite o afundamento.",
      limitation:
        "Referência internacional. Não substitui a regulamentação brasileira nem certifica o sistema ilustrado.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "purdue-2022",
      institution: "Purdue University — Agricultural Safety and Health Program",
      title: "2022 Summary of U.S. Agricultural Confined Space-Related Injuries and Fatalities",
      url: `${purdueBase}2023/06/2022-Summary-of-US-Ag-Confined-Space-5-26-23.pdf`,
      edition: "Maio de 2023",
      locator: "p. 1, nota 1; pp. 8–9: Grain Entrapments e figura 6; p. 3: subnotificação",
      purpose: "42 casos em grãos; 35,7% fatais corresponde a 15; 27 não fatais.",
      limitation:
        "Casos documentados nos EUA, uma vítima por caso segundo a fonte. Não é censo, série brasileira, recorte exclusivo de soja ou de silos elevados.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "purdue-2023",
      institution: "Purdue University — Agricultural Safety and Health Program",
      title: "2023 Summary of U.S. Agricultural Confined Space-Related Injuries and Fatalities",
      url: `${purdueBase}2024/12/2023-Summary-of-US-Ag-Confined-Space_v2-edited9.5.24.pdf`,
      edition: "Versão v2, arquivo edited9.5.24",
      locator:
        "pp. 8–9: Grain Entrapments e figura 6; figura 6 do relatório 2024 confirma a distribuição",
      purpose: "27 casos em grãos; 59,3% fatais corresponde a 16; 11 não fatais.",
      limitation:
        "A figura 6 de 2023 traz o total anual, sem barras separadas de fatais e não fatais. A fatalidade é informada no texto.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "purdue-2024",
      institution: "Purdue University — Agricultural Safety and Health Program",
      title: "2024 Summary of U.S. Agricultural Confined Space-related Injuries and Fatalities",
      url: `${purdueBase}2025/05/2024-Summary-of-U.S.-Agricultural-Confined-Space-related-Injuries-and-Fatalities-Report.pdf`,
      edition: "03/05/2025, conforme data impressa",
      locator: "pp. 8–9: Grain Entrapments e figura 6; p. 10: limites da documentação",
      purpose:
        "34 casos em grãos, 14 fatais e 20 não fatais; gráfico também corrobora a distribuição de 2022 e 2023.",
      limitation:
        "A contagem de aprisionamento em grãos é distinta do total de casos de todos os espaços confinados agrícolas.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "purdue-2025",
      institution: "Purdue University — Agricultural Safety and Health Program",
      title: "2025 Summary of U.S. Agricultural Confined Space-related Injuries and Fatalities",
      url: `${purdueBase}2026/07/2025-Summary-of-Confined-Spaces.pdf`,
      edition: "Julho de 2026",
      locator: "p. 1, nota 1; pp. 5 e 7–8: 21 casos, 28,6% fatais e figura 5",
      purpose: "21 casos em grãos; 28,6% fatais corresponde a 6; 15 não fatais.",
      limitation:
        "A figura 5 combina contagens de grãos/outros casos e percentuais. Não trata da eficácia de uma linha específica; históricos podem ser revisados.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
    {
      id: "fda-oximetry",
      institution: "U.S. Food and Drug Administration",
      title: "Pulse Oximeter Basics",
      url: "https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics",
      edition: "Página oficial consultada em outubro de 2026",
      locator: "What is a pulse oximeter?; Using a pulse oximeter; limitações de precisão",
      purpose:
        "Distinguir SpO₂, pulso e oxigênio ambiental; indicar limites e possível indisponibilidade da leitura.",
      limitation:
        "Não fornece curva clínica de engolfamento nem permite calcular tempo até morte ou possibilidade de resgate.",
      accessedOn: SOURCE_REVIEW_DATE,
    },
  ].map((source) => Object.freeze(source)),
);

export const PREVENTION_CONTROLS = Object.freeze([
  "Evitar a entrada. Se necessária, avaliar os riscos e impedir a entrada enquanto não estiverem controlados.",
  "Parar a movimentação de grãos, isolar e bloquear energias perigosas; verificar o isolamento.",
  "Emitir PET conforme a aplicabilidade, com trabalhadores autorizados e vigia externo em comunicação.",
  "Avaliar a atmosfera antes da entrada e monitorá-la continuamente; prever ventilação adequada.",
  "Planejar proteção, ancoragem, comunicação e resgate compatíveis com os riscos; disponibilizar equipe e meios.",
]);
