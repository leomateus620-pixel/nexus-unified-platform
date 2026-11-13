import { z } from "zod";
import { inspecoesRecursos, type InspecoesRecurso } from "./ui-contract";

export const inspecoesMenus = [
  { id: "painel", label: "Painel", areas: [] },
  { id: "clientes", label: "Clientes", areas: [] },
  {
    id: "catalogo",
    label: "Catálogo",
    areas: [
      { id: "servicos", label: "Serviços", recurso: "servicos" },
      { id: "tipos", label: "Tipos T1 a T6", recurso: "tipos" },
      { id: "familias", label: "Famílias e checklists", recurso: "familias" },
      { id: "matrizes", label: "Matriz família × segmento", recurso: "matrizes" },
      { id: "pacotes", label: "Pacotes", recurso: "pacotes" },
    ],
  },
  {
    id: "laudos",
    label: "Laudos",
    areas: [
      { id: "documentos", label: "Documentos", recurso: "documentos" },
      { id: "ativos", label: "Ativos", recurso: "ativos" },
      { id: "plantas", label: "Plantas", recurso: "plantas" },
      { id: "equipamentos", label: "Equipamentos de ensaio", recurso: "equipamentos" },
      { id: "pendencias", label: "Pendências", recurso: "pendencias" },
      { id: "importacoes", label: "Importações", recurso: "importacoes" },
    ],
  },
  {
    id: "avisos",
    label: "Avisos",
    areas: [
      { id: "avisos", label: "Avisos", recurso: "avisos" },
      { id: "vencimentos", label: "Vencimentos", recurso: "vencimentos" },
      { id: "contatos", label: "Contatos dos clientes", recurso: null },
      { id: "envio", label: "Envio e destinatários", recurso: null },
    ],
  },
  {
    id: "biblioteca",
    label: "Regras e biblioteca",
    areas: [
      { id: "regras", label: "Regras", recurso: "regras" },
      { id: "textos", label: "Textos-padrão", recurso: "textos" },
      { id: "parametros", label: "Parâmetros", recurso: "parametros" },
      { id: "listas", label: "Listas fechadas", recurso: "listas" },
      { id: "registro", label: "Registro", recurso: "registro" },
    ],
  },
  {
    id: "fases",
    label: "Próximas fases",
    areas: [
      { id: "f1", label: "F1", recurso: null },
      { id: "f2", label: "F2", recurso: null },
      { id: "f3", label: "F3", recurso: null },
      { id: "f4", label: "F4", recurso: null },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  areas: readonly {
    id: string;
    label: string;
    recurso: InspecoesRecurso | null;
  }[];
}[];

export type InspecoesMenu = (typeof inspecoesMenus)[number]["id"];

const menus = [
  "painel",
  "clientes",
  "catalogo",
  "laudos",
  "avisos",
  "biblioteca",
  "fases",
] as const;
const optionalId = z.string().uuid().optional().catch(undefined);
const recordSchema = z.object({ recurso: z.enum(inspecoesRecursos), id: z.string().uuid() });

export const inspecoesSearchSchema = z.object({
  menu: z.enum(menus).default("painel").catch("painel"),
  area: z.string().max(30).optional().catch(undefined),
  cliente: optionalId,
  unidade: optionalId,
  atribuicao: optionalId,
  visualizacao: z.enum(["est", "tst"]).optional().catch(undefined),
  escopo: z.enum(["todos", "cliente", "unidade"]).optional().catch(undefined),
  busca: z.string().max(100).default("").catch(""),
  estado: z.string().max(50).default("").catch(""),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0).catch(0),
  ordem: z.enum(["recente", "nome"]).default("recente").catch("recente"),
  trilha: z.array(recordSchema).max(12).optional().catch(undefined),
});

export type InspecoesSearch = z.infer<typeof inspecoesSearchSchema>;
export type InspecoesFicha = z.infer<typeof recordSchema>;

export function destinoRecurso(recurso: InspecoesRecurso): Partial<InspecoesSearch> {
  for (const menu of inspecoesMenus) {
    const area = menu.areas.find((entry) => entry.recurso === recurso);
    if (area) return { menu: menu.id, area: area.id };
  }
  return { menu: "laudos", area: "documentos" };
}

export function limparConsulta(search: unknown): InspecoesSearch {
  return {
    ...inspecoesSearchSchema.parse(search),
    area: undefined,
    busca: "",
    estado: "",
    pagina: 0,
    ordem: "recente",
    trilha: undefined,
  };
}
