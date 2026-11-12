import type { ClienteMarca } from "@/features/clientes/schemas";

export const inspecoesRecursos = [
  "documentos",
  "ativos",
  "inspecoes",
  "pendencias",
  "importacoes",
  "plantas",
  "equipamentos",
  "servicos",
  "familias",
  "tipos",
  "pacotes",
  "matrizes",
  "regras",
  "parametros",
  "textos",
  "listas",
  "registro",
  "avisos",
  "contratos",
  "ensaios",
  "os",
  "configuracoes",
  "vencimentos",
] as const;

export type InspecoesJson =
  string | number | boolean | null | InspecoesJson[] | { [key: string]: InspecoesJson | undefined };
export type InspecoesObjeto = { [key: string]: InspecoesJson | undefined };

export type InspecoesRecurso = (typeof inspecoesRecursos)[number];

export type InspecoesAtribuicao = {
  id: string;
  perfil: "EST" | "TST";
  pessoa_id: string;
  nome?: string | undefined;
  cliente_id: string | null;
  unidade_id: string | null;
  ensaios: boolean;
  biblioteca: boolean;
  importacao: boolean;
};

export type InspecoesUnidade = {
  cliente_id: string;
  unidade_id: string;
  cliente_nome: string;
  unidade_nome: string;
  segmento: string | null;
  marca?: ClienteMarca | null | undefined;
  cidade?: string | undefined | null;
  uf?: string | undefined | null;
  snapshot?: InspecoesObjeto | undefined;
};

export type InspecoesContexto = {
  atribuicoes: InspecoesAtribuicao[];
  unidades: InspecoesUnidade[];
};

export type InspecoesEscopo = {
  organizationId: string;
  clienteId?: string | undefined;
  unidadeId?: string | undefined;
};

export type InspecoesFiltro = InspecoesEscopo & {
  recurso: InspecoesRecurso;
  busca: string;
  estado: string;
  pagina: number;
  ordem: "recente" | "nome";
};

export type InspecoesRegistro = {
  id: string;
  cliente_id: string | null;
  unidade_id: string | null;
  colecao: InspecoesRecurso;
  source_id: string;
  titulo: string;
  codigo: string | null;
  familia: string | null;
  situacao: string | null;
  data_ref: string | null;
  vigente: boolean;
  existente: boolean;
  resumo?: InspecoesObjeto | undefined;
};

export type InspecoesLista = {
  items: InspecoesRegistro[];
  total: number;
  pageSize: number;
};

export type InspecoesArquivo = {
  id: string;
  nome: string;
  papel: string;
  mime: string | null;
  estado: string;
  bytes: number | null;
  sha256: string | null;
  legenda?: string | undefined | null;
  miniaturaUrl?: string | undefined | null;
  previaUrl?: string | undefined | null;
  originalUrl?: string | undefined | null;
};

export type InspecoesDetalhe = {
  registro: InspecoesRegistro & {
    snapshot: InspecoesObjeto;
    origem_autor?: string | undefined | null;
    origem_data?: string | undefined | null;
    importado_em?: string | undefined;
  };
  relacionados: InspecoesRegistro[];
  arquivos: InspecoesArquivo[];
};

export type InspecoesPainel = {
  indicadores: { recurso: InspecoesRecurso; estado: string; label: string; total: number }[];
  recentes: InspecoesRegistro[];
};

export const tiposLevantamento = ["T1", "T2", "T3", "T4", "T5", "T6"] as const;
export const respostasLevantamento = ["C", "CR", "NC", "NA"] as const;
export const pareceresLevantamento = [
  "apto",
  "apto_restricao",
  "nao_apto",
  "nao_inspecionado",
] as const;

export type InspecoesConteudoLevantamento = {
  data_inspecao?: string | undefined;
  respostas?: Record<string, (typeof respostasLevantamento)[number]>;
  observacoes?: string | undefined;
  limitacao_impeditiva?: string | undefined;
  protocolo?: string | undefined;
  codigo_documento?: string | undefined;
  revisao_documento?: string | undefined;
  art?: string | undefined;
  art_inicio?: string | undefined;
  prazo_restricao?: string | undefined;
};

export type InspecoesLevantamento = {
  id: string;
  organization_id: string;
  cliente_id: string;
  unidade_id: string;
  ativo_id: string;
  tipo: (typeof tiposLevantamento)[number];
  estado: "rascunho" | "em_revisao" | "aprovado" | "emitido" | "cancelado";
  version: number;
  atribuido_a: string | null;
  created_by: string;
  data_inspecao: string | null;
  conteudo: InspecoesConteudoLevantamento;
  checklist: { id: string; item: string; critico?: boolean }[];
  resultado_calculado?: string | undefined | null;
  parecer_est?: string | undefined | null;
  devolucao?: string | undefined | null;
  calculo_justificativa?: string | undefined | null;
  justificativa_est?: string | undefined | null;
  alertas?: string[];
  prazo_restricao?: string | undefined | null;
  validade_tecnica?: string | undefined | null;
  bloqueios?: string[];
};

export type InspecoesLevantamentos = {
  items: InspecoesLevantamento[];
  candidatos?: { user_id: string; nome: string; perfil?: "EST" | "TST" }[] | undefined;
};

type ComandoVersionado = { id: string; expected_version: number };

export type InspecoesComando = { chave: string; atribuicaoId?: string | undefined } & (
  | {
      comando: "criar";
      dados: {
        ativo_id: string;
        tipo: (typeof tiposLevantamento)[number];
        atribuido_a?: string | undefined;
      };
    }
  | (ComandoVersionado & { comando: "salvar"; dados: InspecoesConteudoLevantamento })
  | (ComandoVersionado & { comando: "submeter" | "emitir"; dados: Record<string, never> })
  | (ComandoVersionado & { comando: "devolver"; dados: { motivo: string } })
  | (ComandoVersionado & {
      comando: "aprovar";
      dados: { parecer: (typeof pareceresLevantamento)[number]; motivo: string };
    })
);
