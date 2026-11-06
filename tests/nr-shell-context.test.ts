import { describe, expect, it } from "vitest";
import {
  clearShellContext,
  getShellContext,
  setShellContext,
  type ShellContext,
} from "@/components/nexus/shell-context";

const ctx = (key: string, unidade: string): ShellContext => ({
  path: "/nr-33/mapa-3d",
  key,
  normaCodigo: "NR-33",
  normaNome: "NR-33 — Espaços confinados",
  cliente: "COTRIROSA",
  unidade,
  back: { to: "/nr-33", search: {}, label: "Voltar ao painel da unidade" },
  switchNorma: { to: "/nr-35/mapa-3d", search: {}, label: "Alternar mapa para NR-35" },
});

describe("cabeçalho contextual do Mapa 3D", () => {
  it("limpa ao sair da rota dona do contexto", () => {
    setShellContext(ctx("a", "Fábrica de Ração — Santa Rosa"));
    clearShellContext("a");
    expect(getShellContext()).toBeNull();
  });
  it("troca de unidade não é apagada pela limpeza da unidade anterior", () => {
    setShellContext(ctx("a", "Unidade A"));
    setShellContext(ctx("b", "Unidade B"));
    clearShellContext("a");
    expect(getShellContext()?.unidade).toBe("Unidade B");
    clearShellContext("b");
  });
});
