import {
  LayoutDashboard,
  Handshake,
  Building2,
  Package,
  ClipboardList,
  Ruler,
  FolderKanban,
  ShoppingCart,
  Wrench,
  FileText,
  ShieldCheck,
  Wallet,
  BarChart3,
  Boxes,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  hint: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        hint: "Indicadores e pendências",
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      { to: "/comercial", label: "Comercial", icon: Handshake, hint: "Oportunidades e propostas" },
      { to: "/clientes", label: "Clientes", icon: Building2, hint: "Cadastro e histórico" },
      {
        to: "/produtos",
        label: "Produtos e Soluções",
        icon: Package,
        hint: "Códigos, NCM e custos",
      },
    ],
  },
  {
    label: "Técnico",
    items: [
      {
        to: "/levantamentos",
        label: "Levantamentos Técnicos",
        icon: ClipboardList,
        hint: "Coleta em campo",
      },
      { to: "/engenharia", label: "Engenharia", icon: Ruler, hint: "Normas e dimensionamentos" },
      { to: "/mapas-3d", label: "Mapas 3D das Unidades", icon: Boxes, hint: "Unidades em 3D" },
      {
        to: "/escada-lc02",
        label: "Escada LC-02",
        icon: Boxes,
        hint: "Acesso externo e circulação",
      },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/projetos", label: "Projetos", icon: FolderKanban, hint: "Prazos e materiais" },
      {
        to: "/compras",
        label: "Compras e Produção",
        icon: ShoppingCart,
        hint: "Fornecedores e fabricação",
      },
      { to: "/execucao", label: "Execução / OS", icon: Wrench, hint: "Equipes e horas" },
    ],
  },
  {
    label: "Conformidade",
    items: [
      {
        to: "/documentacao",
        label: "Documentação Técnica",
        icon: FileText,
        hint: "Laudos e dossiês",
      },
      { to: "/inspecoes", label: "Inspeções", icon: ShieldCheck, hint: "Validades e revisões" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/financeiro", label: "Financeiro", icon: Wallet, hint: "Custos e margens" },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, hint: "Desempenho" },
      {
        to: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        hint: "Usuários e parâmetros",
      },
    ],
  },
];

export const flowSteps = [
  "Cliente",
  "Oportunidade",
  "Proposta",
  "Levantamento",
  "Engenharia",
  "Dimensionamento",
  "Custos",
  "Aprovação",
  "Projeto",
  "Compras/Produção",
  "Execução",
  "Documentação",
  "Inspeções",
  "Histórico",
];

/**
 * Visibilidade de menus e etapas por papel (somente navegação; ações seguem a matriz do servidor).
 * Papéis ausentes aqui veem tudo. O acesso do usuário é a união dos seus papéis.
 */
type Acesso = { menus: string[]; rotasExtras?: string[]; etapasOcultas?: string[] };
const ACESSO_POR_PAPEL: Record<string, Acesso> = {
  engenharia: {
    menus: ["/", "/comercial", "/produtos", "/engenharia", "/configuracoes"],
    // abertas a partir das etapas Compras/Produção da proposta
    rotasExtras: ["/compras/ordens-compra", "/compras/ordens-producao"],
    etapasOcultas: ["resumo-executivo", "parametros", "historico"],
  },
};

function acessos(roles: string[]): Acesso[] | null {
  if (!roles.length) return null;
  const lista = roles.map((r) => ACESSO_POR_PAPEL[r]);
  return lista.some((a) => !a) ? null : (lista as Acesso[]);
}

const casa = (p: string, base: string) =>
  base === "/" ? p === "/" : p === base || p.startsWith(base + "/");

export function podeVerRota(roles: string[], pathname: string) {
  const a = acessos(roles);
  if (!a) return true;
  return a.some((x) => {
    const etapa = pathname.match(/\/revisoes\/[^/]+\/([^/]+)/)?.[1];
    if (etapa && x.etapasOcultas?.includes(etapa)) return false;
    return [...x.menus, ...(x.rotasExtras ?? [])].some((b) => casa(pathname, b));
  });
}

export function podeVerEtapa(roles: string[], etapa: string) {
  const a = acessos(roles);
  return !a || a.some((x) => !x.etapasOcultas?.includes(etapa));
}

export function menusVisiveis(roles: string[]) {
  const a = acessos(roles);
  if (!a) return navGroups;
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => a.some((x) => x.menus.includes(i.to))) }))
    .filter((g) => g.items.length);
}
