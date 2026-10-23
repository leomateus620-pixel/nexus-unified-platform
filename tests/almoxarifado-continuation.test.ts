import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { captureStockContinuation } from "../src/features/almoxarifado/continuation";

const key = ["operacao-acesso", "org-isolada", "pessoa-isolada"];
const access = {
  gerirEquipe: true,
  gerirOperacao: true,
  revisarOperacao: true,
  pessoaId: "pessoa-isolada",
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("respostas tardias do almoxarifado", () => {
  it("não recria dados privados depois de purge e outro login com os mesmos IDs", async () => {
    const qc = client();
    qc.setQueryData(key, access);
    const current = captureStockContinuation(qc, key, () => true);
    let resolve!: (value: string) => void;
    const response = new Promise<string>((done) => {
      resolve = done;
    });
    const callback = response.then((value) => {
      if (current()) qc.setQueryData(["almoxarifado", "org-isolada", "ficha"], value);
    });
    qc.clear();
    qc.setQueryData(key, { ...access });
    resolve("recibo da sessão anterior");
    await callback;
    expect(qc.getQueryData(["almoxarifado", "org-isolada", "ficha"])).toBeUndefined();
    qc.clear();
  });

  it("recusa ausência, remoção e alteração de acesso", () => {
    const qc = client();
    expect(captureStockContinuation(qc, key, () => true)()).toBe(false);
    qc.setQueryData(key, access);
    const current = captureStockContinuation(qc, key, () => true);
    qc.setQueryData(key, { ...access, gerirOperacao: false });
    expect(current()).toBe(false);
    qc.removeQueries({ queryKey: key });
    expect(current()).toBe(false);
    qc.clear();
  });

  it("permite refetch equivalente no mesmo contexto e recusa desmontagem", () => {
    const qc = client();
    qc.setQueryData(key, access);
    let mounted = true;
    const current = captureStockContinuation(qc, key, () => mounted);
    qc.setQueryData(key, { ...access });
    expect(current()).toBe(true);
    mounted = false;
    expect(current()).toBe(false);
    qc.clear();
  });

  it("recusa query em erro mesmo quando ela retém dados antigos", async () => {
    const qc = client();
    qc.setQueryData(key, access);
    const current = captureStockContinuation(qc, key, () => true);
    await expect(
      qc.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error("Acesso revogado")) }),
    ).rejects.toThrow("Acesso revogado");
    expect(qc.getQueryData(key)).toEqual(access);
    expect(current()).toBe(false);
    qc.clear();
  });
});
