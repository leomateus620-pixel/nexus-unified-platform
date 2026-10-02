// Importação assistida: leitura de tabela colada (Excel/CSV), mapeamento de colunas e classificação.
// Funções puras — a tela e os testes usam este módulo. Nada é inventado: sem correspondência, fica pendente.

export const CAMPOS = [
  { chave: "codigo", rotulo: "Código NEXUS", sinonimos: ["codigo", "código", "cod nxs", "codigo nexus"] },
  { chave: "ref_fornecedor", rotulo: "Referência do fornecedor", sinonimos: ["ref", "referencia", "referência", "cod fornecedor", "código fornecedor"] },
  { chave: "descricao", rotulo: "Descrição", sinonimos: ["descricao", "descrição", "produto", "item"] },
  { chave: "fornecedor", rotulo: "Fornecedor", sinonimos: ["fornecedor", "emitente"] },
  { chave: "nf_numero", rotulo: "Nº da nota", sinonimos: ["nf", "nota", "numero nf", "nº nf", "n nf"] },
  { chave: "nf_serie", rotulo: "Série", sinonimos: ["serie", "série"] },
  { chave: "data", rotulo: "Data de emissão", sinonimos: ["data", "emissao", "emissão"] },
  { chave: "quantidade", rotulo: "Quantidade", sinonimos: ["qtd", "quantidade", "qtde"] },
  { chave: "unidade", rotulo: "Unidade de compra", sinonimos: ["un", "unid", "unidade"] },
  { chave: "produtos", rotulo: "Valor dos produtos (total da linha)", sinonimos: ["valor", "vlr total", "valor total", "total produtos"] },
  { chave: "desconto", rotulo: "Desconto", sinonimos: ["desconto"] },
  { chave: "frete", rotulo: "Frete", sinonimos: ["frete"] },
  { chave: "ipi", rotulo: "IPI", sinonimos: ["ipi"] },
  { chave: "difal", rotulo: "DIFAL", sinonimos: ["difal"] },
] as const;
export type CampoChave = (typeof CAMPOS)[number]["chave"];
export type Mapa = Partial<Record<CampoChave, number>>;

export function lerTabela(texto: string): string[][] {
  const linhas = texto.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = linhas[0].includes("\t") ? "\t" : linhas[0].split(";").length > 1 ? ";" : ",";
  return linhas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}

const normal = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Sugere o mapeamento pelo cabeçalho; o usuário confirma ou corrige na tela. */
export function sugerirMapa(cabecalho: string[]): Mapa {
  const m: Mapa = {};
  cabecalho.forEach((h, i) => {
    const n = normal(h);
    for (const c of CAMPOS)
      if (m[c.chave] == null && c.sinonimos.some((s) => normal(s) === n)) m[c.chave] = i;
  });
  return m;
}

/** Número em formato brasileiro ou internacional; vazio = null (nunca zero). */
export function numero(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.replace(/R\$|\s/g, "");
  if (!s) return null;
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function data(v: string | undefined): string | null {
  if (!v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export type ProdutoRef = { id: string; codigo: string; unidade: string; refs: { fornecedor_id: string; codigo: string }[] };
export type FornecedorRef = { id: string; nome: string };

export type Situacao = "novo" | "existente" | "conflito" | "incompleto";
export type LinhaClassificada = {
  linha: number;
  situacao: Situacao;
  motivo: string;
  produto?: ProdutoRef;
  fornecedor_id: string | null;
  compra?: {
    nf_numero: string;
    nf_serie: string;
    emitido_em: string;
    quantidade: number;
    unidade: string;
    parcelas: { produtos: number | null; desconto: number | null; frete: number | null; ipi: number | null; difal: number | null; outras: null };
  };
  /** Chave estável da compra: fornecedor + nota + série + produto + linha de origem. */
  identidade: string;
};

export function classificar(
  linhas: string[][],
  mapa: Mapa,
  produtos: ProdutoRef[],
  fornecedores: FornecedorRef[],
  existentes: Set<string>,
  origem: { arquivo: string; aba: string },
): LinhaClassificada[] {
  const get = (r: string[], k: CampoChave) => (mapa[k] == null ? "" : (r[mapa[k]!] ?? "").trim());
  const porCodigo = new Map(produtos.map((p) => [p.codigo.toUpperCase(), p]));
  return linhas.map((r, i) => {
    const linha = i + 2; // linha 1 = cabeçalho
    const fNome = normal(get(r, "fornecedor"));
    const forn = fNome ? fornecedores.filter((f) => normal(f.nome) === fNome) : [];
    const fornecedor_id = forn.length === 1 ? forn[0].id : null;
    const cod = get(r, "codigo").toUpperCase();
    const ref = get(r, "ref_fornecedor").toUpperCase();
    let cand = cod ? porCodigo.get(cod) : undefined;
    if (!cand && ref) {
      const ms = produtos.filter((p) =>
        p.refs.some((x) => x.codigo.toUpperCase() === ref && (!fornecedor_id || x.fornecedor_id === fornecedor_id)),
      );
      if (ms.length > 1)
        return base(linha, "conflito", `Referência ${ref} corresponde a ${ms.length} produtos.`, fornecedor_id, origem, r);
      cand = ms[0];
    }
    if (!cand)
      return base(
        linha,
        "incompleto",
        "Produto não encontrado pelo código ou referência — cadastre ou vincule antes (sem classificação presumida).",
        fornecedor_id,
        origem,
        r,
      );
    if (fNome && !fornecedor_id)
      return base(linha, "conflito", forn.length > 1 ? "Fornecedor ambíguo." : `Fornecedor "${get(r, "fornecedor")}" não cadastrado — não será atribuído por suposição.`, null, origem, r, cand);
    const nf = get(r, "nf_numero");
    const emitido = data(get(r, "data"));
    const qtd = numero(get(r, "quantidade"));
    const parcelas = {
      produtos: numero(get(r, "produtos")),
      desconto: numero(get(r, "desconto")),
      frete: numero(get(r, "frete")),
      ipi: numero(get(r, "ipi")),
      difal: numero(get(r, "difal")),
      outras: null,
    };
    if (!nf || !emitido || !(qtd && qtd > 0))
      return base(linha, "incompleto", "Faltam nota, data ou quantidade.", fornecedor_id, origem, r, cand);
    const identidade = [fornecedor_id ?? "sem-fornecedor", nf, get(r, "nf_serie"), cand.id, origem.arquivo, origem.aba, linha].join("|");
    const compra = { nf_numero: nf, nf_serie: get(r, "nf_serie"), emitido_em: emitido, quantidade: qtd, unidade: get(r, "unidade") || cand.unidade, parcelas };
    const ja = existentes.has(identidade);
    return {
      linha,
      situacao: ja ? "existente" : "novo",
      motivo: ja
        ? "Compra já importada — será apenas vinculada, sem duplicar."
        : parcelas.produtos == null
          ? "Compra nova sem preço: entra como custo pendente."
          : "Compra nova.",
      produto: cand,
      fornecedor_id,
      compra,
      identidade,
    };
  });
}

function base(
  linha: number,
  situacao: Situacao,
  motivo: string,
  fornecedor_id: string | null,
  origem: { arquivo: string; aba: string },
  r: string[],
  produto?: ProdutoRef,
): LinhaClassificada {
  return { linha, situacao, motivo, fornecedor_id, produto, identidade: [origem.arquivo, origem.aba, linha, r.join("¦")].join("|") };
}

/** UUID determinístico (formato v5) a partir da identidade — reenvio gera a mesma chave. */
export async function uuidDe(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
