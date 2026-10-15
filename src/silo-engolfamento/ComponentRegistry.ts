/** Technical index, independent of React and Three. Metres, Y up; 0° is +Z,
 * positive angles run towards +X. Published dimensions are not a structural design. */
import { SILO_CONFIG } from "./SiloConfig";
export type ComponentCategory = "system" | "structure";
export type ComponentFidelity =
  | "dado publicado · geometria aproximada"
  | "malha de referência medida · reconstrução aproximada"
  | "hipótese de apresentação";
export interface ComponentRecord {
  id: string;
  name: string;
  category: ComponentCategory;
  function: string;
  quantity: number | null;
  dimensions: readonly {
    label: string;
    value: string;
    unit: string;
    source: "published" | "presentation" | "mesh-measured";
  }[];
  source: string;
  fidelity: ComponentFidelity;
  related: readonly string[];
  /** Optional visible companions for isolation; relationships stay factual even
   * when an opaque neighbour would conceal the inspected component. */
  isolationContext?: readonly string[];
  selectionPoint: readonly [number, number, number];
  /** Nominal selection box; render binding supplies the exact current box. */
  bounds: readonly [number, number, number];
  camera: { distance: number; elevation: number };
  operation?: string;
  limitation: string;
}
const SOURCE = "https://lvhfinternsilo.pplx.app/#visualizador";
const approx = "dado publicado · geometria aproximada" as const;
const visual = "hipótese de apresentação" as const;
const measured = "malha de referência medida · reconstrução aproximada" as const;
const manholeRadius = Math.hypot(SILO_CONFIG.manholeX.value, SILO_CONFIG.manholeZ.value);
const manholeProjectedY =
  SILO_CONFIG.bodyTop.value +
  ((SILO_CONFIG.roofTop.value - SILO_CONFIG.bodyTop.value) *
    (SILO_CONFIG.roofEaveRadius.value - manholeRadius)) /
    (SILO_CONFIG.roofEaveRadius.value - SILO_CONFIG.collarRadius.value);
const manholeProjectionDifference = SILO_CONFIG.manholeY.value - manholeProjectedY;
const decimal = (value: number) => value.toFixed(3).replace(".", ",");
const D = (
  label: string,
  value: string,
  unit = "m",
  source: "published" | "presentation" | "mesh-measured" = "published",
) => ({ label, value, unit, source });
const record = (
  id: string,
  name: string,
  category: ComponentCategory,
  fn: string,
  point: [number, number, number],
  bounds: [number, number, number],
  dimensions: ComponentRecord["dimensions"],
  related: string[],
  extra: Partial<ComponentRecord> = {},
): ComponentRecord => ({
  id,
  name,
  category,
  function: fn,
  quantity: 1,
  dimensions,
  source: SOURCE,
  fidelity: approx,
  related,
  selectionPoint: point,
  bounds,
  camera: { distance: Math.max(...bounds) * 1.7, elevation: 0.5 },
  limitation:
    "Reconstrução paramétrica. GLBs públicos auditados, sem redistribuição; STEP original e compatibilidade mecânica exata não conferidos. Capacidade e pré-tensão não especificadas.",
  ...extra,
});
export const COMPONENTS: readonly ComponentRecord[] = Object.freeze([
  record(
    "lvhf.cable",
    "Cabo de aço Ø8 mm",
    "system",
    "Percurso circular interno que conecta os pontos do sistema LVHF.",
    [0, 24.375, -10.926],
    [22, 0.3, 22],
    [
      D("Raio do percurso", "10,926"),
      D("Cota do eixo", "24,375"),
      D("Diâmetro nominal", "8", "mm"),
      D("Desenvolvimento nominal", "68,6"),
    ],
    ["lvhf.anchor", "lvhf.tensioner", "lvhf.trolley"],
    {
      operation:
        "Acompanhar o trole no circuito completo, sem desconexão cinemática. Terminais e passagem mecânica exata dependem dos desenhos do fabricante.",
    },
  ),
  record(
    "lvhf.anchor",
    "Ancoragem Ancopro",
    "system",
    "Região de início e fechamento do circuito, visualmente fixada ao costado.",
    [0, 24.375, 10.95],
    [0.45, 0.38, 0.4],
    [
      D("Posição angular", "0", "°"),
      D("Pontos principais", "11", "un"),
      D("Envelope medido da referência", "97 × 40 × 74,8", "mm", "mesh-measured"),
    ],
    ["lvhf.cable", "lvhf.tensioner", "structure.stiffeners"],
    {
      operation:
        "Inspecionar a ligação do cabo e os terminais. O suporte representado não comprova a resistência da chapa.",
    },
  ),
  record(
    "lvhf.tensioner",
    "Esticador Dois Dez",
    "system",
    "Ajuste geométrico do circuito; não é retrátil, guincho ou absorvedor.",
    [1.953, 24.375, 10.75],
    [0.52, 0.22, 0.3],
    [D("Posição angular", "10,3", "°"), D("Pré-tensão", "não especificada", "")],
    ["lvhf.anchor", "lvhf.cable"],
    {
      operation:
        "Observar corpo roscado e terminais. A animação não atribui força, curso admissível ou tensão ao ajuste.",
    },
  ),
  record(
    "lvhf.trolley",
    "Trole passante 1501",
    "system",
    "Acompanha o técnico tangencialmente ao cabo e oferece o olhal de conexão.",
    [-1.2, 24.375, -10.86],
    [0.18, 0.22, 0.16],
    [
      D("Envelope medido do GLB", "105 × 62 × 100", "mm", "mesh-measured"),
      D("Roldanas tandem", "2 × Ø34", "mm", "mesh-measured"),
      D("Ponto de apoio abaixo do cabo", "94", "mm", "mesh-measured"),
      D("Afastamento radial do olhal", "15,5", "mm", "mesh-measured"),
      D("Centro da abertura abaixo do cabo", "86", "mm", "mesh-measured"),
      D("Raio da abertura", "8,5", "mm", "mesh-measured"),
    ],
    ["lvhf.cable", "lvhf.connector", "lvhf.rope"],
    {
      fidelity: measured,
      source: "https://lvhfinternsilo.pplx.app/assets/trole_passante.glb",
      operation:
        "Seguir a volta completa e a região dos onze pontos. Roldanas sob o cabo, pivôs e olhal reconciliados com o GLB e montagem da página.",
      camera: { distance: 0.55, elevation: 0.22 },
      limitation:
        "GLB público de 14 peças medido; recursos originais não redistribuídos. Os 90 mm publicados referem-se ao datum do corpo; a montagem desloca o olhal 94 mm abaixo do cabo. Guias e terminais são aproximações cinemáticas; passagem mecânica do produto e capacidade não certificadas.",
    },
  ),
  record(
    "lvhf.connector",
    "Conector / mosquetão",
    "system",
    "Liga o olhal do trole à conexão individual.",
    [-1.2, 24.255, -10.86],
    [0.1, 0.1, 0.1],
    [
      D("Dimensão visual", "≈58 × 30", "mm", "presentation"),
      D("Alcance vertical até a corda", "52", "mm", "presentation"),
    ],
    ["lvhf.trolley", "lvhf.rope"],
    { fidelity: visual, camera: { distance: 0.36, elevation: 0.1 } },
  ),
  record(
    "lvhf.rope",
    "Corda de conexão",
    "system",
    "Conexão de comprimento configurado entre olhal móvel e ponto dorsal.",
    [-1.2, 23.9, -10.5],
    [0.9, 1.1, 0.9],
    [
      D("Conector + corda: comprimento total", "0,95", "m", "presentation"),
      D("Trecho máximo de corda", "0,898", "m", "presentation"),
    ],
    ["lvhf.trolley", "lvhf.connector", "lvhf.harness"],
    {
      fidelity: visual,
      operation:
        "Folga e retenção são calculadas pelo domínio antes da renderização. Distância até o cabo não equivale a zona livre de queda.",
    },
  ),
  record(
    "lvhf.harness",
    "Cinturão paraquedista",
    "system",
    "Fitas, fivelas e ponto dorsal acompanham o esqueleto do técnico A.",
    [-1.2, 24, -10.1],
    [0.8, 1.8, 0.8],
    [],
    ["lvhf.rope", "lvhf.connector"],
    {
      fidelity: visual,
      limitation:
        "Representação didática do cinturão no rig. Não demonstra ajuste, certificação ou procedimento operacional.",
    },
  ),
  ...Array.from({ length: 10 }, (_, i) => {
    const angle = ((i + 1) * Math.PI * 2) / 11;
    return record(
      `lvhf.passant.${String(i + 1).padStart(2, "0")}`,
      `Passante curva 30G · ${String(i + 1).padStart(2, "0")}`,
      "system",
      "Guia intermediária do percurso circular, orientada radialmente ao costado.",
      [Math.sin(angle) * 10.926, 24.375, Math.cos(angle) * 10.926],
      [0.3, 0.25, 0.3],
      [
        D("Posição angular", (((i + 1) * 360) / 11).toFixed(3), "°"),
        D("Quantidade de passantes", "10", "un"),
        D("Envelope local medido", "274,25 × 55 × 110,09", "mm", "mesh-measured"),
      ],
      ["lvhf.cable", "lvhf.trolley", "structure.stiffeners"],
      {
        operation:
          "Aproximar a guia superior e acompanhar a transposição da reconstrução cinemática. A forma mecânica exata do fabricante não é reproduzida.",
        camera: { distance: 0.72, elevation: 0.22 },
      },
    );
  }),
  record(
    "structure.shell",
    "Costado corrugado",
    "structure",
    "Envelope metálico cilíndrico, apoiado na fundação e separado dos reforços.",
    [0, 12.5, 11],
    [22.64, 24.88, 22.64],
    [
      D("Raio interno nominal", "11,00"),
      D("Envelope externo publicado", "11,32"),
      D("Altura do costado", "24,88"),
    ],
    ["structure.foundation", "structure.stiffeners", "structure.roof"],
    {
      limitation:
        "A diferença entre raios não foi interpretada como espessura de chapa. Corrugação e paginação são aproximações de apresentação.",
    },
  ),
  record(
    "structure.stiffeners",
    "Montantes e anéis",
    "structure",
    "Repetição visual de enrijecedores, emendas e fixações do costado.",
    [0, 13, -11.07],
    [22.4, 24.7, 22.4],
    [],
    ["structure.shell", "lvhf.anchor"],
    { fidelity: visual },
  ),
  record(
    "structure.roof",
    "Chapéu segmentado",
    "structure",
    "Cobertura cônica fechada por padrão; remoção é somente inspeção.",
    [0, 27.5, 0],
    [22.206, 5.523, 22.206],
    [
      D("Topo nominal", "30,403"),
      D("Raio do colar", "1,00"),
      D("Raio do beiral medido", "11,103", "m", "mesh-measured"),
    ],
    ["structure.shell", "structure.manhole"],
    {
      limitation:
        "Beiral da malha pública medido em R11,103 m / Y24,875 m; a reconstrução mantém a cota publicada arredondada de24,88 m (+5 mm). Nervuras acrescentam até38 mm ao envelope visual. Não é o raio externo11,32 m do conjunto.",
    },
  ),
  record(
    "structure.manhole",
    "Boca de visita e tampa",
    "structure",
    "Abertura real na triangulação da cobertura, com aro e tampa de apresentação.",
    [1.548, manholeProjectedY, 10.486],
    [1.1, 0.7, 1.1],
    [
      D("Ângulo publicado", "8,4", "°"),
      D("Centro publicado Y", "25,207"),
      D("Centro projetado no cone", decimal(manholeProjectedY), "m", "presentation"),
    ],
    ["structure.roof", "structure.access"],
    {
      limitation: `O centro publicado diverge cerca de ${decimal(manholeProjectionDifference)} m da superfície cônica com beiral medido. O recorte foi projetado no cone; forma e ferragens são aproximações.`,
    },
  ),
  record(
    "structure.access",
    "Acesso externo e patamares",
    "structure",
    "Escada e transição contínua até o patamar junto à boca de visita.",
    [1.76, 13, 11.88],
    [2.5, 26.3, 2.5],
    [],
    ["structure.manhole", "structure.foundation"],
    {
      fidelity: visual,
      limitation:
        "Acesso de composição visual, sem desenho executivo ou validação normativa. Não é uma orientação de entrada.",
    },
  ),
  record(
    "structure.foundation",
    "Fundação e plinto",
    "structure",
    "Contato do silo com o terreno, base de concreto e fixações visíveis.",
    [0, 0, 0],
    [23.6, 0.36, 23.6],
    [
      D("Raio visual da base", "11,80", "m", "presentation"),
      D("Cota do piso", "0,18", "m", "presentation"),
    ],
    ["structure.shell", "structure.floor"],
    { fidelity: visual },
  ),
  record(
    "structure.floor",
    "Piso interno plano",
    "structure",
    "Fundo plano usado na formulação do volume de grãos.",
    [0, 0.18, 0],
    [22, 0.06, 22],
    [D("Cota", "0,18", "m", "presentation")],
    ["structure.foundation", "structure.grain", "structure.extraction"],
    { fidelity: visual, isolationContext: ["structure.extraction"] },
  ),
  record(
    "structure.grain",
    "Massa de soja",
    "structure",
    "Volume contínuo e detalhe milimétrico local; colapso localizado ilustrativo no incidente.",
    [0, 22.6, 0],
    [22, 22.42, 22],
    [D("Nível inicial", "22,60")],
    ["structure.floor", "lvhf.harness"],
    {
      limitation:
        "Campo granular cinemático com conservação de volume. Não é DEM, previsão calibrada ou procedimento de resgate.",
    },
  ),
  record(
    "structure.extraction",
    "Canal e saída de inspeção",
    "structure",
    "Representação de saída junto ao piso; não define o mecanismo do colapso localizado.",
    [0, 0.28, 11.7],
    [0.8, 0.45, 1.8],
    [],
    ["structure.floor"],
    {
      fidelity: visual,
      limitation:
        "Canal/saída sem CAD: hipótese de visualização. O incidente usa colapso localizado, não esta saída.",
    },
  ),
]);
const index = new Map(COMPONENTS.map((item) => [item.id, item]));
const aliases: Record<string, string> = {
  anchor: "lvhf.anchor",
  line: "lvhf.rope",
  harness: "lvhf.harness",
  gate: "structure.extraction",
};
export function getComponent(id: string | null | undefined): ComponentRecord | undefined {
  return id ? index.get(aliases[id] ?? id) : undefined;
}
export function canonicalComponentId(id: string) {
  return aliases[id] ?? id;
}
export const COMPONENT_CATEGORIES = [
  { id: "system" as const, name: "Componentes do sistema" },
  { id: "structure" as const, name: "Estrutura do silo" },
];
