import { scenario } from "./data";
const inspection = new URLSearchParams(location.search).get("page") === "inspecoes";
const operational = [
  "nr-33",
  "nr-35",
  "agenda-equipe",
  "almoxarifado",
  "engenharia",
  "levantamentos",
  "equipe",
  "seguranca",
  "clientes",
  "configuracoes",
  "projetos-engenharia",
  "mapas-library",
].includes(new URLSearchParams(location.search).get("page") || "");
const org = inspection
  ? "41000000-0000-4000-8000-000000000001"
  : operational
    ? "10000000-0000-4000-8000-000000000001"
    : "org-fixture";
export const useOrgId = () => org;
export const useOrg = () => ({
  data: {
    orgId: org,
    userId: inspection
      ? scenario === "insp-tst"
        ? "41000000-0000-4000-8000-000000000007"
        : "41000000-0000-4000-8000-000000000008"
      : operational
        ? "00000000-0000-4000-8000-000000000001"
        : "user-fixture",
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
