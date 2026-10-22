import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATRIZ, papelAutoriza } from "../src/features/auth/autorizacao";
import { podeVerRota } from "../src/lib/nexus-nav";

describe("paridade das capacidades operacionais", () => {
  // 0020 é a definição vigente. A 0012 permanece histórica e não deve ser
  // alterada para fazer a matriz antiga parecer o contrato atual.
  const sql = readFileSync("drizzle/migrations/0020_anexo_confirmacao_autorizada.sql", "utf8");
  const matrizVigente = sql.match(
    /create function public\.operacao_autor_pode\([\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/i,
  )?.[1];
  for (const acao of [
    "ver_equipe",
    "gerir_equipe",
    "ver_operacao",
    "gerir_operacao",
    "revisar_operacao",
    "gerir_documentos",
    "ver_projetos_engenharia",
    "gerir_projetos_engenharia",
  ] as const) {
    it(`${acao}: TS e SQL vigente têm os mesmos papéis conhecidos`, () => {
      expect(matrizVigente).toBeDefined();
      const match = matrizVigente?.match(
        new RegExp(`when\\s+'${acao}'\\s+then\\s+array\\[([^\\]]+)\\]`, "i"),
      );
      expect(match).not.toBeNull();
      const roles = [...match![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect(roles).toEqual([...MATRIZ[acao]].sort());
      expect(papelAutoriza(["desconhecido"], acao)).toBe(false);
    });
  }
  it("operacao_pode delega exclusivamente ao predicado vigente com o usuário autenticado", () => {
    const wrapper = sql.match(
      /create or replace function public\.operacao_pode\([\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/i,
    )?.[1];
    expect(wrapper?.replace(/\s+/g, " ").trim()).toBe(
      "select public.operacao_autor_pode(_org,auth.uid(),_acao);",
    );
  });
  it("navegação dos novos módulos não concede edição por omissão", () => {
    expect(podeVerRota(["campo"], "/equipe")).toBe(true);
    expect(papelAutoriza(["campo"], "gerir_equipe")).toBe(false);
    expect(podeVerRota(["compras"], "/projetos-engenharia")).toBe(false);
    expect(podeVerRota([], "/seguranca")).toBe(false);
    expect(podeVerRota(["compras"], "/equipe", ["coordenar_operacao"])).toBe(true);
    expect(podeVerRota(["compras"], "/configuracoes", ["coordenar_operacao"])).toBe(false);
    expect(podeVerRota([], "/projetos-engenharia", ["coordenar_operacao"])).toBe(false);
  });
});
