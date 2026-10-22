import { scenario } from "./data";
const operational = [
  "engenharia",
  "levantamentos",
  "equipe",
  "seguranca",
  "clientes",
  "configuracoes",
  "projetos-engenharia",
  "mapas-library",
].includes(new URLSearchParams(location.search).get("page") || "");
const org = operational ? "10000000-0000-4000-8000-000000000001" : "org-fixture";
export const useOrgId = () => org;
export const useOrg = () => ({
  data: {
    orgId: org,
    userId: operational ? "00000000-0000-4000-8000-000000000001" : "user-fixture",
    orgNome: "Ambiente isolado de apresentação",
    roles: [scenario === "restricted" ? "comercial" : "admin"],
    isAdmin: scenario !== "restricted",
    canSeeCosts: scenario !== "restricted",
  },
  isPending: false,
  isError: false,
});
export const useSessionUser = () => ({
  id: operational ? "00000000-0000-4000-8000-000000000001" : "user-fixture",
  email: "revisao-ui@example.invalid",
});
