// Test-only boundaries. No application route imports this module.
import { revision, tables, scenario } from "./data";
const log = (name, data) => window.__nexusCalls.push({ name, payload: { data } });
export async function minhasPermissoes() {
  return Object.fromEntries(
    ["importar_catalogo", "editar_cadastro", "editar_revisao", "aprovar_tecnica", "ver_custos"].map(
      (key) => [key, scenario !== "restricted"],
    ),
  );
}
export async function cadastrarProduto({ data }) {
  log("cadastrarProduto", data);
  const previous = tables.produtos.find((p) => p.chave === data.chave);
  if (previous) return previous;
  const p = {
    ...data,
    id: `created-${tables.produtos.length}`,
    codigo: `${data.familia}-NXS-${data.tipo}099`,
    tipo_item: data.tipo,
    ativo: true,
    composicao_status: data.composicao.length ? "definida" : "nao_aplicavel",
    produto_custos: [],
    produto_referencias: [],
    chave: data.chave,
  };
  tables.produtos.push(p);
  return p;
}
export async function editarProduto({ data }) {
  log("editarProduto", data);
  Object.assign(
    tables.produtos.find((p) => p.id === data.produto_id),
    data,
  );
  return { id: data.produto_id };
}
export async function salvarComposicao({ data }) {
  log("salvarComposicao", data);
  return { id: data.produto_id };
}
export async function reclassificarProduto({ data }) {
  log("reclassificarProduto", data);
  return { codigo: "COM-NXS-P099" };
}
export const recodificarProduto = reclassificarProduto;
async function include(data, manual) {
  if (window.__failInclusion) {
    window.__failInclusion = false;
    throw new Error("Inclusão indisponível no teste");
  }
  const p = tables.produtos.find((p) => p.id === data.produto_id);
  let c = tables.revisao_componentes.find((c) => c.produto_id === p.id);
  const repeated = !!c || (!manual && window.__repeatAvailability);
  if (!c) {
    c = {
      ...p,
      id: `included-${p.id}`,
      produto_id: p.id,
      quantidade_avulsa: 0,
      incluido_orcamento: false,
      custo_adotado: 0,
      custo_origem_id: null,
      estrutura: null,
      estrutura_origem: null,
    };
    tables.revisao_componentes.push(c);
  }
  if (!manual && window.__repeatAvailability) {
    window.__repeatAvailability = false;
    Object.assign(c, { quantidade_avulsa: 2, incluido_orcamento: true });
  }
  if (manual) Object.assign(c, { quantidade_avulsa: data.quantidade, incluido_orcamento: true });
  revision.desatualizada = true;
  return { id: c.id, repetido: !!repeated };
}
export async function incluirNaRevisao({ data }) {
  log("incluirNaRevisao", data);
  return include(data, true);
}
export async function adicionarComponenteRevisao({ data }) {
  log("adicionarComponenteRevisao", data);
  return include(data, false);
}
export async function registrarCompra({ data }) {
  log("registrarCompra", data);
  if (window.__failPurchase) throw new Error("Falha de gravação no teste");
  const previous = tables.aquisicoes.find((a) => a.chave === data.chave);
  if (!previous)
    tables.aquisicoes.push({
      id: data.chave,
      chave: data.chave,
      produto_id: data.produto_id,
      quantidade: data.quantidade,
      unidade: data.unidade,
      situacao: "valida",
      custo_unitario: 0,
      custo_total: 0,
      created_at: "2026-10-02T12:00:00Z",
      valores_calculados: { quantidade_uso: data.quantidade },
      documentos_fiscais: { numero: data.nf_numero, emitido_em: data.emitido_em },
    });
  return { repetido: !!previous, pendencia: null };
}
export async function definirConversao({ data }) {
  log("definirConversao", data);
  return { ok: true };
}
