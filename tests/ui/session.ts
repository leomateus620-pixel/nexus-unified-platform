import { scenario } from "./data";
export const useOrgId = () => "org-fixture";
export const useOrg = () => ({
  data: {
    orgId: "org-fixture",
    orgNome: "Ambiente isolado de apresentação",
    roles: [scenario === "restricted" ? "comercial" : "admin"],
    isAdmin: scenario !== "restricted",
    canSeeCosts: scenario !== "restricted",
  },
  isPending: false,
  isError: false,
});
export const useSessionUser = () => ({ id: "user-fixture", email: "revisao-ui@example.invalid" });
