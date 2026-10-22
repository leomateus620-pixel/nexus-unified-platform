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
  Users,
  ShieldAlert,
  DraftingCompass,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Papel } from "@/features/auth/autorizacao";

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
      {
        to: "/projetos-engenharia",
        label: "Projetos de Engenharia",
        icon: DraftingCompass,
        hint: "Acervo, versões e cenários",
      },
      {
        to: "/mapas-3d/unidades",
        label: "Mapas 3D das Unidades",
        icon: Boxes,
        hint: "Biblioteca de unidades em 3D",
      },
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
    label: "Recursos",
    items: [
      {
        to: "/almoxarifado",
        label: "Almoxarifado e Ferramentas",
        icon: Warehouse,
        hint: "Saldo físico, reservas e custódia",
      },
      {
        to: "/equipe",
        label: "Pessoas e Competências",
        icon: Users,
        hint: "Pessoas e vínculos profissionais",
      },
    ],
  },
  {
    label: "Conformidade",
    items: [
      {
        to: "/seguranca",
        label: "Ações operacionais",
        icon: ShieldAlert,
        hint: "Responsáveis, prazos e verificação",
      },
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
 * O acesso do usuário é a união somente dos seus papéis conhecidos.
 * Novos menus exigem concessão explícita; papéis ausentes/desconhecidos não concedem acesso.
 */
export type DestinoInicial = "/" | "/comercial" | "/auth";
type Acesso = {
  menus: readonly string[];
  inicio?: DestinoInicial;
  rotasExtras?: string[];
  etapasOcultas?: string[];
};
// Concessões explícitas aos módulos existentes; novos domínios entram quando implementados.
const MENUS_EXISTENTES = [
  "/",
  "/comercial",
  "/clientes",
  "/produtos",
  "/levantamentos",
  "/engenharia",
  "/mapas-3d",
  "/mapas-3d/unidades",
  "/escada-lc02",
  "/projetos",
  "/compras",
  "/execucao",
  "/documentacao",
  "/inspecoes",
  "/financeiro",
  "/relatorios",
  "/configuracoes",
  "/equipe",
  "/seguranca",
  "/projetos-engenharia",
  "/almoxarifado",
] as const;
export const ACESSO_POR_PAPEL: Record<Papel, Acesso> = {
  admin: { menus: MENUS_EXISTENTES },
  comercial: { menus: ["/", "/clientes", "/comercial", "/produtos"] },
  compras: { menus: ["/", "/clientes", "/produtos", "/compras", "/projetos", "/almoxarifado"] },
  financeiro: { menus: ["/", "/financeiro", "/relatorios", "/projetos"] },
  campo: {
    menus: [
      "/",
      "/almoxarifado",
      "/levantamentos",
      "/execucao",
      "/documentacao",
      "/inspecoes",
      "/equipe",
      "/seguranca",
    ],
  },
  engenharia: {
    menus: [
      "/",
      "/almoxarifado",
      "/clientes",
      "/comercial",
      "/produtos",
      "/levantamentos",
      "/engenharia",
      "/mapas-3d",
      "/mapas-3d/unidades",
      "/escada-lc02",
      "/projetos",
      "/execucao",
      "/documentacao",
      "/inspecoes",
      "/equipe",
      "/seguranca",
      "/projetos-engenharia",
    ],
    inicio: "/comercial",
    // abertas a partir das etapas Compras/Produção da proposta
    rotasExtras: ["/compras/ordens-compra", "/compras/ordens-producao"],
    etapasOcultas: ["resumo-executivo", "parametros", "historico"],
  },
};

function acessos(roles: string[], capabilities: string[] = []): Acesso[] {
  const a = roles.flatMap((role) =>
    Object.hasOwn(ACESSO_POR_PAPEL, role) ? [ACESSO_POR_PAPEL[role as Papel]] : [],
  );
  if (capabilities.includes("coordenar_operacao"))
    a.push({
      menus: ["/", "/levantamentos", "/equipe", "/seguranca", "/execucao", "/almoxarifado"],
    });
  return a;
}

const casa = (p: string, base: string) =>
  base === "/" ? p === "/" : p === base || p.startsWith(base + "/");

export function podeVerRota(roles: string[], pathname: string, capabilities: string[] = []) {
  const a = acessos(roles, capabilities);
  return a.some((x) => {
    const etapa = pathname.match(/\/revisoes\/[^/]+\/([^/]+)/)?.[1];
    if (etapa && x.etapasOcultas?.includes(etapa)) return false;
    return [...x.menus, ...(x.rotasExtras ?? [])].some((b) => casa(pathname, b));
  });
}

export function podeVerEtapa(roles: string[], etapa: string) {
  const a = acessos(roles);
  return a.some((x) => !x.etapasOcultas?.includes(etapa));
}

export function menusVisiveis(roles: string[], capabilities: string[] = []) {
  const a = acessos(roles, capabilities);
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => a.some((x) => x.menus.includes(i.to))) }))
    .filter((g) => g.items.length);
}

export function destinoInicial(roles: string[], capabilities: string[] = []): DestinoInicial {
  const a = acessos(roles, capabilities);
  if (!a.length) return "/auth";
  if (a.some((x) => x.menus.includes("/") && !x.inicio)) return "/";
  return a[0]?.inicio ?? "/";
}
