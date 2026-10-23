import { webcrypto } from "node:crypto";
import { Script, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { abrirPacote, protegerPacote, type PacoteLocal } from "../src/features/pet/offline";
import { visualizadorProtegido } from "../src/features/pet/offline-viewer";

/** This is an isolated DOM unit harness, not a claim that browser file://,
 * mobile storage or a live provider has been validated. */
function harness(html: string, storage = new Map<string, string>(), failStorage = false) {
  type Element = {
    value: string;
    textContent: string;
    hidden: boolean;
    children: Element[];
    onclick?: () => Promise<void> | void;
    append: (el: Element) => void;
    replaceChildren: () => void;
    click: () => void;
  };
  const elements = new Map<string, Element>();
  const element = (): Element => ({
    value: "",
    textContent: "",
    hidden: false,
    children: [],
    append(el) {
      this.children.push(el);
    },
    replaceChildren() {
      this.children = [];
    },
    click() {},
  });
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const downloads: Blob[] = [];
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("Script de contingência ausente.");
  const context = createContext({
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Blob,
    Date,
    JSON,
    atob: (v: string) => Buffer.from(v, "base64").toString("binary"),
    btoa: (v: string) => Buffer.from(v, "binary").toString("base64"),
    setTimeout: () => 0,
    URL: {
      createObjectURL: (blob: Blob) => {
        downloads.push(blob);
        return "blob:unit-test";
      },
      revokeObjectURL() {},
    },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failStorage) throw new Error("QuotaExceededError");
        return storage.set(k, v);
      },
    },
    document: { getElementById: el, createElement: element },
  });
  new Script(script).runInContext(context);
  return {
    el,
    storage,
    downloads,
    click: async (id: string) => {
      await el(id).onclick?.();
    },
  };
}

const senha = "Senha local de teste 2026";
const pacote: PacoteLocal = {
  formato: 1,
  organizationId: "org-teste",
  userId: "vigia-teste",
  petId: "pet-teste",
  version: 7,
  sincronizadoEm: "2026-10-23T12:00:00Z",
  documentoHash: "a".repeat(64),
  pdf: "JVBERg==",
  snapshot: {
    pet: {
      numero: "DEMONSTRAÇÃO SEM CERTIFICAÇÃO",
      atividade: "Teste unitário, sem validade operacional",
    },
    participantes: [
      { pessoa_id: "pessoa-teste", nome_snapshot: "Pessoa controlada", funcao: "trabalhador" },
    ],
  },
  pendentes: [],
};

describe("PET: visualizador cifrado independente da aplicação", () => {
  it("gera HTML autocontido com rede vedada e sem documento/identificação em texto aberto", async () => {
    const envelope = await protegerPacote(pacote, senha);
    const html = visualizadorProtegido(envelope);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain(pacote.pdf);
    expect(html).not.toContain("Pessoa controlada");
    expect(html).not.toContain("DEMONSTRAÇÃO SEM CERTIFICAÇÃO");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain("Não libera entrada");
    expect(() => harness(html)).not.toThrow();
  });

  it("exige senha e permite consultar o PDF local somente após decifrar", async () => {
    const ui = harness(visualizadorProtegido(await protegerPacote(pacote, senha)));
    ui.el("senha").value = "Senha incorreta de teste";
    await ui.click("abrir");
    expect(ui.el("status").textContent).toContain("Não foi possível abrir");
    expect(ui.downloads).toHaveLength(0);
    ui.el("senha").value = senha;
    await ui.click("abrir");
    expect(ui.el("numero").textContent).toBe("DEMONSTRAÇÃO SEM CERTIFICAÇÃO");
    expect(ui.el("versao").textContent).toContain("Versão 7");
    expect(ui.el("status").textContent).toContain("servidor não foi consultada");
    await ui.click("documento");
    expect(await ui.downloads[0]?.text()).toBe("%PDF");
    await ui.click("bloquear");
    expect(ui.el("conteudo").hidden).toBe(true);
    expect(ui.el("senha").value).toBe("");
  });

  it("preserva fato pendente ao reabrir e exporta envelope cifrado para sync autenticada", async () => {
    const html = visualizadorProtegido(await protegerPacote(pacote, senha));
    const ui = harness(html);
    ui.el("senha").value = senha;
    await ui.click("abrir");
    ui.el("pessoa").value = "pessoa-teste";
    ui.el("motivo").value = "Saída no teste de contingência isolado";
    await ui.click("saida");
    expect(ui.el("status").textContent).toContain(
      "confirmação do servidor e assinatura continuam pendentes",
    );
    expect(ui.el("pendentes").children).toHaveLength(1);
    expect([...ui.storage.values()].join("")).not.toContain("Saída no teste");
    const reopened = harness(html, ui.storage);
    reopened.el("senha").value = senha;
    await reopened.click("abrir");
    expect(reopened.el("pendentes").children).toHaveLength(1);
    await reopened.click("exportar");
    const exported = await reopened.downloads[0]!.text();
    const confirmed = await abrirPacote(exported, senha, pacote);
    expect(confirmed.pendentes).toHaveLength(1);
    expect(confirmed.pendentes[0]?.tipo).toBe("registrar_saida");
    expect(confirmed.pendentes[0]?.origem).toBe("offline");
    expect(confirmed.pendentes[0]?.estado).toBe("pendente");
  });
  it("não anuncia persistência quando o armazenamento falha; permite exportar a memória cifrada", async () => {
    const html = visualizadorProtegido(await protegerPacote(pacote, senha));
    const ui = harness(html, new Map(), true);
    ui.el("senha").value = senha;
    await ui.click("abrir");
    ui.el("pessoa").value = "pessoa-teste";
    ui.el("motivo").value = "Saída controlada com armazenamento bloqueado";
    await ui.click("saida");
    expect(ui.el("status").textContent).toContain("apenas na memória");
    expect(ui.el("status").textContent).not.toContain("Fato preservado localmente");
    expect(ui.storage.size).toBe(0);
    expect(ui.el("pendentes").children).toHaveLength(1);
    await ui.click("exportar");
    const recovered = await abrirPacote(await ui.downloads[0]!.text(), senha, pacote);
    expect(recovered.pendentes).toHaveLength(1);
    const reopened = harness(html, ui.storage);
    reopened.el("senha").value = senha;
    await reopened.click("abrir");
    expect(reopened.el("pendentes").children).toHaveLength(0);
  });
});
