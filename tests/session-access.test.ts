import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { orgQueryKey, reconcileAccessCache, type OrgContext } from "../src/features/org/session";

const previous: OrgContext = {
  userId: "user-a",
  orgId: "org-a",
  orgNome: "Organização teste",
  roles: ["admin", "engenharia"],
  isAdmin: true,
  canSeeCosts: true,
};

function clientWithPrivateData() {
  const client = new QueryClient();
  client.setQueryData(orgQueryKey, previous);
  client.setQueryData(["projetos", "org-a"], [{ custo: 10 }]);
  client.setQueryData(["arquivo", "url-temporaria"], "https://example.invalid/private");
  return client;
}

describe("cache em mudanças de autorização", () => {
  it.each([
    ["revogação de papel", { ...previous, roles: ["campo"], isAdmin: false, canSeeCosts: false }],
    ["troca de tenant", { ...previous, orgId: "org-b" }],
    ["mudança de capacidade explícita", { ...previous, capabilities: ["coordenar_operacao"] }],
    ["troca de pessoa autenticada", { ...previous, userId: "user-b" }],
    ["desligamento ou sessão ausente", null],
  ])("descarta registros e links temporários após %s", async (_reason, next) => {
    const client = clientWithPrivateData();
    await reconcileAccessCache(client, next);
    expect(client.getQueryData(["projetos", "org-a"])).toBeUndefined();
    expect(client.getQueryData(["arquivo", "url-temporaria"])).toBeUndefined();
    expect(client.getQueryData(orgQueryKey)).toEqual(previous);
    client.clear();
  });

  it("não elimina o recorte ao revalidar as mesmas permissões em outra ordem", async () => {
    const client = clientWithPrivateData();
    await reconcileAccessCache(client, { ...previous, roles: ["engenharia", "admin"] });
    expect(client.getQueryData(["projetos", "org-a"])).toEqual([{ custo: 10 }]);
    client.clear();
  });

  it("remove dados e arquivos ao revogar coordenação mesmo sem mudar os papéis", async () => {
    const client = clientWithPrivateData();
    client.setQueryData(orgQueryKey, { ...previous, capabilities: ["coordenar_operacao"] });
    await reconcileAccessCache(client, { ...previous, capabilities: [] });
    expect(client.getQueryData(["projetos", "org-a"])).toBeUndefined();
    expect(client.getQueryData(["arquivo", "url-temporaria"])).toBeUndefined();
    client.clear();
  });

  it("cancela uma resposta pendente para impedir repovoamento pelo contexto anterior", async () => {
    const client = clientWithPrivateData();
    let finish: ((value: string) => void) | undefined;
    const response = client
      .fetchQuery({
        queryKey: ["documento-pendente", "org-a"],
        queryFn: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    await reconcileAccessCache(client, null);
    finish?.("conteúdo anterior");
    await response;
    expect(client.getQueryData(["documento-pendente", "org-a"])).toBeUndefined();
    client.clear();
  });
});
