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
