// Fixed lab identity, never imported by the production build.
export const ORG = "a0300000-0000-4000-8000-000000000001";
export const USER = "a0300000-0000-4000-8000-000000000002";
export function useOrg() {
  return {
    data: {
      orgId: ORG,
      userId: USER,
      orgNome: "DEMONSTRAÇÃO · Homologação local",
      roles: ["admin"],
      capabilities: [],
      canSeeCosts: true,
      isAdmin: true,
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: async () => {},
  };
}
export const useSessionUser = () => ({ id: USER, email: "demonstracao@example.invalid" });
