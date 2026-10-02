import { describe, expect, it } from "vitest";
import { classificar, lerTabela, numero, sugerirMapa, uuidDe } from "../src/features/importacao/mapeamento";

const produtos = [{ id: "p1", codigo: "CSD-NXS-P002", unidade: "PÇ", refs: [{ fornecedor_id: "f1", codigo: "DD.12" }] }];
const forn = [{ id: "f1", nome: "DoisDez" }, { id: "f2", nome: "Bonier" }];
const txt = "Código\tFornecedor\tNF\tData\tQtd\tValor\n" +
  "CSD-NXS-P002\tDoisDez\t100\t01/09/2026\t2\t1.000,00\n" +
  "XYZ-1\tDoisDez\t100\t01/09/2026\t1\t10\n" +
  "CSD-NXS-P002\tZUK\t7\t01/09/2026\t1\t10\n" +
  "CSD-NXS-P002\tBonier\t100\t01/09/2026\t1\t\n";

describe("importação assistida", () => {
  const t = lerTabela(txt);
  const m = sugerirMapa(t[0]);
  const r = classificar(t.slice(1), m, produtos, forn, new Set(), { arquivo: "a.xlsx", aba: "Compras" });
  it("classifica sem inventar produto nem fornecedor", () => {
    expect(r.map((x) => x.situacao)).toEqual(["novo", "incompleto", "conflito", "novo"]);
    expect(r[0].compra?.parcelas.produtos).toBe(1000);
  });
  it("preço ausente fica nulo (pendente), nunca zero", () => {
    expect(r[3].compra?.parcelas.produtos).toBeNull();
    expect(numero("")).toBeNull();
  });
  it("mesma nota de fornecedores distintos tem identidades distintas; reenvio gera a mesma chave", async () => {
    expect(r[0].identidade).not.toBe(r[3].identidade);
    expect(await uuidDe(r[0].identidade)).toBe(await uuidDe(r[0].identidade));
  });
});
