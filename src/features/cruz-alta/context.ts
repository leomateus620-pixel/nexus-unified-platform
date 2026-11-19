// Chaves conferidas na relação organizations → clientes → unidades do banco do Nexus.
export const cruzAlta = {
  org: "abab473b-8baa-4781-aed2-c1243338af65",
  cliente: "c3d779b6-c407-8ab4-8545-6bdfd6068013",
  unidade: "a9f6603b-6497-8e9e-822a-dfc860510c1a",
  rota: "/mapas-3d/tres-tentos-cruz-alta",
} as const;

export function isCruzAlta(org: string, cliente: string, unidade: string) {
  return org === cruzAlta.org && cliente === cruzAlta.cliente && unidade === cruzAlta.unidade;
}
