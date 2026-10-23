// UI-only synthetic adapter. Never imported by application builds.
// No SQL, Auth, Storage binary or connected persistence is exercised by these fixtures.
import { scenario } from "./data";

const org = "10000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000001";
const cliente = "20000000-0000-4000-8000-000000000001";
const unidade = "21000000-0000-4000-8000-000000000001";
const pessoa = "30000000-0000-4000-8000-000000000001";
const levantamento = "70000000-0000-4000-8000-000000000001";
const revisao = "71000000-0000-4000-8000-000000000001";
const pontoA = "72000000-0000-4000-8000-000000000001";
const pontoB = "72000000-0000-4000-8000-000000000002";
const medicaoA = "73000000-0000-4000-8000-000000000001";
const now = "2026-10-22T12:00:00.000Z";
const copy = (value) => structuredClone(value);
const timestamps = { created_at: now, updated_at: now, created_by: actor, version: 1 };
const root = {
  id: levantamento,
  organization_id: org,
  codigo: "LEV-TESTE-0001",
  cliente_id: cliente,
  unidade_id: unidade,
  finalidade: "Conferir acesso, implantação e dimensões do ponto de manutenção — cenário isolado",
  responsavel_id: pessoa,
  proposta_id: null,
  projeto_id: null,
  revisao_atual_id: revisao,
  aprovada_id: null,
  cliente_nome: "Empresa do ambiente isolado de validação",
  unidade_nome: "Unidade de armazenagem e recebimento — acesso norte",
  responsavel_nome: "Responsável técnico de teste com nome completo extenso",
  ...timestamps,
};
const estadoInicial =
  scenario === "approved" ? "aprovado" : scenario === "review" ? "em_revisao" : "em_coleta";
const rev = {
  id: revisao,
  organization_id: org,
  levantamento_id: levantamento,
  numero: 1,
  base_id: null,
  modelo_versao_id: null,
  estado: estadoInicial,
  inicio_previsto: "2026-10-22T11:00:00.000Z",
  fim_previsto: "2026-10-22T15:00:00.000Z",
  snapshot: null,
  snapshot_sha256: null,
  aprovado_por: null,
  aprovado_em: null,
  ...timestamps,
};
const pontos = [
  {
    id: pontoA,
    organization_id: org,
    levantamento_id: levantamento,
    revisao_id: revisao,
    codigo: "P01",
    nome: "Acesso de manutenção — passarela norte",
    area: "Recebimento",
    localizacao: "Ao lado do transportador de teste",
    tipo_sistema: "Acesso",
    observacoes: "Identificar a origem de cada medida coletada.",
    exige_foto: true,
    version: 1,
  },
  {
    id: pontoB,
    organization_id: org,
    levantamento_id: levantamento,
    revisao_id: revisao,
    codigo: "P02",
    nome: "Área de inspeção da cobertura",
    area: "Armazenagem",
    localizacao: "Local de teste sem referência a cliente real",
    tipo_sistema: "Linha de vida",
    observacoes: "Medida preliminar a conferir em campo.",
    exige_foto: false,
    version: 1,
  },
];
const medicoes = [
  {
    id: medicaoA,
    organization_id: org,
    levantamento_id: levantamento,
    revisao_id: revisao,
    ponto_id: pontoA,
    chave: "Comprimento do acesso",
    grandeza: "comprimento",
    valor: "12.400000",
    unidade: "m",
    precisao: "0.001000",
    metodo: "Trena — exemplo exclusivo da fixture",
    origem: "campo",
    natureza: "medida",
    coletado_em: now,
    observacoes: "Conferência pendente de revisão técnica.",
    version: 1,
  },
  {
    id: "73000000-0000-4000-8000-000000000002",
    organization_id: org,
    levantamento_id: levantamento,
    revisao_id: revisao,
    ponto_id: pontoB,
    chave: "Extensão preliminar",
    grandeza: "comprimento",
    valor: "8450.000000",
    unidade: "mm",
    precisao: null,
    metodo: "Referência documental de teste",
    origem: "documento",
    natureza: "estimativa",
    coletado_em: now,
    observacoes: "Não é medida certificada de cena 3D.",
    version: 1,
  },
];
const arquivos = [pontoA, pontoB].map((ponto_id, index) => ({
  id: `74000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  organization_id: org,
  levantamento_id: levantamento,
  revisao_id: revisao,
  ponto_id,
  nome: `foto-ponto-${index + 1}-teste.jpg`,
  mime: "image/jpeg",
  tamanho: 51200,
  sha256: (index ? "b" : "a").repeat(64),
  caminho: `fixture-levantamentos/${index + 1}`,
  estado: "vinculado",
  created_by: actor,
  created_at: now,
  confirmado_em: now,
}));
let state = {
  levantamentos: scenario === "empty" ? [] : [copy(root)],
  revisoes: scenario === "empty" ? [] : [copy(rev)],
  pontos: scenario === "empty" ? [] : copy(pontos),
  medicoes: scenario === "empty" ? [] : copy(medicoes),
  arquivos: scenario === "empty" ? [] : copy(arquivos),
  avaliacoes: [],
  adocoes: [],
  modelos: [],
};
if (scenario === "approved") {
  state.revisoes[0].snapshot = {
    levantamento: copy(root),
    pontos: copy(pontos),
    medicoes: copy(medicoes),
    arquivos: copy(arquivos),
  };
  state.revisoes[0].snapshot_sha256 = "c".repeat(64);
  state.revisoes[0].aprovado_por = actor;
  state.revisoes[0].aprovado_em = now;
  state.levantamentos[0].aprovada_id = revisao;
}
window.__nexusLevantamentos = state;
const recibos = new Map();
let consultasDetalhe = 0;
async function read(name, data) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "loading") await new Promise(() => {});
  if (scenario === "error" || window.__levantamentoQueryError)
    throw new Error("Consulta indisponível no cenário isolado. Tente novamente.");
  if (scenario === "restricted")
    throw new Error("Levantamento indisponível para seu acesso atual.");
}
function write(name, data, command) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "write-error" || window.__levantamentoFailWrite) {
    window.__levantamentoFailWrite = false;
    throw new Error("Falha de rede simulada. O preenchimento local foi preservado.");
  }
  if (scenario === "write-conflict" || window.__levantamentoConflict)
    throw new Error("Outra pessoa alterou este registro. Consulte e compare a versão do servidor.");
  const payload = JSON.stringify({ ...data, chave: null });
  const receipt = recibos.get(data.chave);
  if (receipt) {
    if (receipt.payload !== payload)
      throw new Error("Chave reutilizada com outro payload na fixture.");
    return copy(receipt.result);
  }
  const draft = copy(state);
  const result = command(draft);
  state = draft;
  window.__nexusLevantamentos = state;
  if (data.chave) recibos.set(data.chave, { payload, result: copy(result) });
  return copy(result);
}
function detail(data, source = state) {
  const l = source.levantamentos.find((row) => row.id === data.levantamento_id);
  if (!l) throw new Error("Levantamento indisponível para seu acesso atual.");
  const r = source.revisoes.find((row) => row.id === (data.revisao_id || l.revisao_atual_id));
  if (!r) throw new Error("Revisão indisponível.");
  const editable =
    ["rascunho", "programado", "em_coleta"].includes(r.estado) && scenario !== "readonly";
  return {
    levantamento: l,
    revisao: r,
    revisoes: source.revisoes
      .filter((row) => row.levantamento_id === l.id)
      .map(({ id, numero, estado, version, created_at }) => ({
        id,
        numero,
        estado,
        version,
        created_at,
      }))
      .sort((a, b) => b.numero - a.numero),
    pontos: source.pontos.filter((row) => row.revisao_id === r.id),
    medicoes: source.medicoes.filter((row) => row.revisao_id === r.id),
    arquivos: source.arquivos.filter(
      (row) => row.revisao_id === r.id && row.estado !== "cancelado",
    ),
    avaliacoes: source.avaliacoes.filter((row) => row.levantamento_id === l.id),
    adocoes: source.adocoes.filter((row) => row.levantamento_id === l.id),
    modelo: source.modelos.find((row) => row.id === r.modelo_versao_id) || null,
    permissoes: {
      editar: editable,
      coletar: editable,
      revisar: scenario !== "readonly" && r.estado === "em_revisao",
      adotar: scenario !== "readonly" && r.estado === "aprovado",
      gerir: scenario !== "readonly",
    },
  };
}
const checkVersion = (row, version) => {
  if (row.version !== version)
    throw new Error("Outra pessoa alterou este registro. Recarregue e compare antes de salvar.");
};
export const listarLevantamentos = async ({ data }) => {
  await read("listarLevantamentos", data);
  let rows = state.levantamentos.map((l) => {
    const r = state.revisoes.find((row) => row.id === l.revisao_atual_id);
    return {
      ...l,
      estado: r.estado,
      numero_revisao: r.numero,
      inicio_previsto: r.inicio_previsto,
      fim_previsto: r.fim_previsto,
    };
  });
  if (data.busca)
    rows = rows.filter((row) =>
      JSON.stringify(row).toLocaleLowerCase().includes(data.busca.toLocaleLowerCase()),
    );
  if (data.estado) rows = rows.filter((row) => row.estado === data.estado);
  if (data.responsavel_id) rows = rows.filter((row) => row.responsavel_id === data.responsavel_id);
  const pagina = data.pagina || 0,
    limite = data.limite || 25;
  return {
    rows: copy(rows.slice(pagina * limite, (pagina + 1) * limite)),
    total: rows.length,
    page: pagina,
    pageSize: limite,
  };
};
export const obterLevantamento = async ({ data }) => {
  await read("obterLevantamento", data);
  if (scenario === "version-refetch" && ++consultasDetalhe === 2) {
    const l = state.levantamentos.find((row) => row.id === data.levantamento_id);
    const r = state.revisoes.find((row) => row.id === l.revisao_atual_id);
    l.version = 2;
    l.finalidade = "Contexto alterado pela segunda sessão da fixture";
    r.version = 2;
  }
  return copy(detail(data));
};
export const buscarOpcoesLevantamento = async ({ data }) => {
  await read("buscarOpcoesLevantamento", data);
  const source =
    data.tipo === "clientes"
      ? [{ id: cliente, nome: root.cliente_nome }]
      : data.tipo === "unidades"
        ? [{ id: unidade, nome: root.unidade_nome }]
        : data.tipo === "pessoas"
          ? [{ id: pessoa, nome: root.responsavel_nome }]
          : data.tipo === "modelos"
            ? state.modelos.map((row) => ({ id: row.id, nome: `${row.nome} · V${row.numero}` }))
            : [];
  return copy(
    source.filter(
      (row) => !data.busca || row.nome.toLocaleLowerCase().includes(data.busca.toLocaleLowerCase()),
    ),
  );
};
export const executarLevantamento = async ({ data }) =>
  write("executarLevantamento", data, (draft) => {
    if (data.comando === "criar") {
      const id = crypto.randomUUID(),
        revisionId = crypto.randomUUID();
      draft.levantamentos.push({
        ...copy(root),
        id,
        codigo: `LEV-TESTE-${draft.levantamentos.length + 1}`,
        ...data,
        revisao_atual_id: revisionId,
        aprovada_id: null,
        version: 1,
      });
      draft.revisoes.push({
        ...copy(rev),
        id: revisionId,
        levantamento_id: id,
        numero: 1,
        modelo_versao_id: data.modelo_versao_id || null,
        estado: "rascunho",
        inicio_previsto: null,
        fim_previsto: null,
        version: 1,
      });
      return detail({ levantamento_id: id }, draft);
    }
    const current = detail(data, draft),
      l = current.levantamento,
      r = current.revisao;
    if (data.comando === "contexto") {
      checkVersion(l, data.expected_version);
      Object.assign(l, {
        finalidade: data.finalidade,
        responsavel_id: data.responsavel_id,
        version: l.version + 1,
      });
    } else if (data.comando === "salvar_ponto") {
      let point = draft.pontos.find((row) => row.id === data.ponto_id);
      if (point) checkVersion(point, data.expected_version);
      else {
        point = {
          ...copy(pontos[0]),
          id: crypto.randomUUID(),
          levantamento_id: l.id,
          revisao_id: r.id,
          version: 0,
        };
        draft.pontos.push(point);
      }
      const campos = [
        "codigo",
        "nome",
        "area",
        "localizacao",
        "tipo_sistema",
        "observacoes",
        "exige_foto",
      ];
      for (const key of campos) if (data[key] !== undefined) point[key] = data[key];
      point.version++;
      for (const removed of data.excluir_medicoes || []) {
        const row = draft.medicoes.find((m) => m.id === removed.medicao_id);
        checkVersion(row, removed.expected_version);
        draft.medicoes = draft.medicoes.filter((m) => m !== row);
      }
      for (const input of data.medicoes || []) {
        let m = draft.medicoes.find((row) => row.id === input.medicao_id);
        if (m) checkVersion(m, input.expected_version);
        else {
          m = {
            ...copy(medicoes[0]),
            id: crypto.randomUUID(),
            levantamento_id: l.id,
            revisao_id: r.id,
            ponto_id: point.id,
            version: 0,
          };
          draft.medicoes.push(m);
        }
        Object.assign(m, input, { version: m.version + 1 });
      }
    } else if (data.comando === "salvar_medicao") {
      let m = draft.medicoes.find((row) => row.id === data.medicao_id);
      if (m) checkVersion(m, data.expected_version);
      else {
        m = {
          ...copy(medicoes[0]),
          id: crypto.randomUUID(),
          levantamento_id: l.id,
          revisao_id: r.id,
          ponto_id: data.ponto_id,
          version: 0,
        };
        draft.medicoes.push(m);
      }
      Object.assign(m, { ...data, chave: data.chave_medicao, version: m.version + 1 });
    } else if (data.comando === "excluir_medicao") {
      const m = draft.medicoes.find((row) => row.id === data.medicao_id);
      checkVersion(m, data.expected_version);
      draft.medicoes = draft.medicoes.filter((row) => row.id !== m.id);
    } else if (data.comando === "excluir_ponto") {
      const point = draft.pontos.find((row) => row.id === data.ponto_id);
      checkVersion(point, data.expected_version);
      if (draft.arquivos.some((a) => a.ponto_id === point.id && a.estado === "vinculado"))
        throw new Error("Ponto com evidência confirmada preserva sua identidade.");
      draft.pontos = draft.pontos.filter((row) => row.id !== point.id);
      draft.medicoes = draft.medicoes.filter((row) => row.ponto_id !== point.id);
    } else {
      checkVersion(r, data.expected_version);
      if (data.comando === "programar")
        Object.assign(r, {
          estado: "programado",
          inicio_previsto: data.inicio_previsto,
          fim_previsto: data.fim_previsto,
        });
      else if (data.comando === "iniciar_coleta") r.estado = "em_coleta";
      else if (data.comando === "submeter") {
        if (!current.pontos.length || !current.medicoes.length)
          throw new Error("Registre pontos e medidas antes da revisão.");
        if (current.arquivos.some((a) => ["pendente", "enviado"].includes(a.estado)))
          throw new Error("Confirme ou cancele os envios pendentes antes de enviar à revisão.");
        r.estado = "em_revisao";
      } else if (data.comando === "devolver") r.estado = "em_coleta";
      else if (data.comando === "aprovar")
        Object.assign(r, {
          estado: "aprovado",
          snapshot: copy(current),
          snapshot_sha256: "c".repeat(64),
          aprovado_por: actor,
          aprovado_em: now,
        });
      else if (data.comando === "cancelar") r.estado = "cancelado";
      else if (data.comando === "nova_revisao") {
        const nova = {
          ...copy(r),
          id: crypto.randomUUID(),
          base_id: r.id,
          numero: r.numero + 1,
          modelo_versao_id: data.modelo_versao_id || r.modelo_versao_id,
          estado: "rascunho",
          snapshot: null,
          snapshot_sha256: null,
          aprovado_por: null,
          aprovado_em: null,
          version: 1,
        };
        const newPoints = new Map();
        for (const point of current.pontos) {
          const id = crypto.randomUUID();
          newPoints.set(point.id, id);
          draft.pontos.push({
            ...copy(point),
            id,
            base_id: point.id,
            revisao_id: nova.id,
            version: 1,
          });
        }
        for (const m of current.medicoes)
          draft.medicoes.push({
            ...copy(m),
            id: crypto.randomUUID(),
            base_id: m.id,
            revisao_id: nova.id,
            ponto_id: newPoints.get(m.ponto_id),
            version: 1,
          });
        draft.revisoes.push(nova);
        l.revisao_atual_id = nova.id;
        return detail({ levantamento_id: l.id }, draft);
      }
      r.version++;
      draft.avaliacoes.push({
        id: draft.avaliacoes.length + 1,
        levantamento_id: l.id,
        revisao_id: r.id,
        decisao: data.comando,
        comentario: data.motivo || "",
        pendencias: copy(data.pendencias || []),
        autor: actor,
        created_at: now,
      });
      if (r.estado === "aprovado") l.aprovada_id = r.id;
    }
    if (
      ["contexto", "salvar_ponto", "salvar_medicao", "excluir_medicao", "excluir_ponto"].includes(
        data.comando,
      )
    )
      r.version++;
    l.version++;
    return detail({ levantamento_id: l.id, revisao_id: r.id }, draft);
  });

export const listarModelosLevantamento = async ({ data }) => {
  await read("listarModelosLevantamento", data);
  return copy(state.modelos);
};
export const publicarModeloLevantamento = async ({ data }) =>
  write("publicarModeloLevantamento", data, (draft) => {
    const modeloId = data.modelo_id || crypto.randomUUID();
    const existentes = draft.modelos.filter((row) => row.modelo_id === modeloId);
    const modelo = {
      id: crypto.randomUUID(),
      modelo_id: modeloId,
      nome: existentes[0]?.nome || data.nome,
      numero: Math.max(0, ...existentes.map((row) => row.numero)) + 1,
      fonte: data.fonte,
      requisitos: copy(data.requisitos || []),
    };
    draft.modelos.push(modelo);
    return {
      modelo: { id: modelo.modelo_id, nome: modelo.nome, descricao: data.descricao || "" },
      versao: modelo,
    };
  });
export const buscarSistemasAdocaoLevantamento = async ({ data }) => {
  await read("buscarSistemasAdocaoLevantamento", data);
  return [
    {
      id: "75000000-0000-4000-8000-000000000001",
      nome: "S01 — sistema de teste em proposta rascunho",
      identificacao: "Sistema de teste",
      revisao_id: "76000000-0000-4000-8000-000000000001",
      proposta_titulo: "Proposta de teste",
      proposta_numero: "TESTE",
      numero_revisao: 1,
    },
  ];
};
export const previaAdocaoLevantamento = async ({ data }) => {
  await read("previaAdocaoLevantamento", data);
  return {
    preview_hash: "d".repeat(64),
    levantamento_id: levantamento,
    revisao_fonte_id: data.revisao_id,
    medicao_id: data.medicao_id,
    sistema_id: data.sistema_id,
    proposta_destino_id: "78000000-0000-4000-8000-000000000001",
    revisao_destino_id: "76000000-0000-4000-8000-000000000001",
    campo: data.campo,
    atual: "10.000000",
    proposto: "12.400000",
    unidade: "m",
    origem: { codigo: root.codigo, ponto: "P01", revisao: 1 },
    afetados: [
      {
        id: "77000000-0000-4000-8000-000000000001",
        codigo: "TESTE-NXS-001",
        regra_chave: "regra-configurada-de-teste",
      },
    ],
    versao_destino: 1,
  };
};
export const adotarMedidasLevantamento = async ({ data }) =>
  write("adotarMedidasLevantamento", data, (draft) => {
    const row = {
      id: crypto.randomUUID(),
      levantamento_id: levantamento,
      revisao_id: data.revisao_id,
      medicao_id: data.medicao_id,
      sistema_id: data.sistema_id,
      revisao_destino_id: "76000000-0000-4000-8000-000000000001",
      campo: data.campo,
      valor_anterior: "10.000000",
      valor_adotado: "12.400000",
      preview_hash: data.preview_hash,
      autor: actor,
      created_at: now,
    };
    draft.adocoes.push(row);
    return {
      adocao: row,
      proposta_destino_id: "78000000-0000-4000-8000-000000000001",
      revisao_destino_id: row.revisao_destino_id,
      sistema_id: row.sistema_id,
      recalculo_necessario: true,
    };
  });

export const listarArquivosLevantamento = async ({ data }) => {
  await read("listarArquivosLevantamento", data);
  const rows = state.arquivos.filter(
    (row) =>
      row.revisao_id === data.revisao_id &&
      row.ponto_id === data.ponto_id &&
      row.estado !== "cancelado",
  );
  return {
    rows: copy(
      rows
        .slice((data.pagina || 0) * 25, (data.pagina || 0) * 25 + 25)
        .map((row) => ({ ...row, meu_envio: row.created_by === actor })),
    ),
    total: rows.length,
  };
};
function touchFile(draft, file) {
  const r = draft.revisoes.find((row) => row.id === file.revisao_id);
  const l = draft.levantamentos.find((row) => row.id === file.levantamento_id);
  if (r) r.version++;
  if (l) l.version++;
}
export const prepararArquivoLevantamento = async ({ data }) =>
  write("prepararArquivoLevantamento", data, (draft) => {
    const existente = draft.arquivos.find(
      (row) =>
        row.revisao_id === data.revisao_id &&
        row.ponto_id === data.ponto_id &&
        row.sha256 === data.sha256 &&
        row.estado !== "cancelado",
    );
    if (existente) return { arquivo: existente, token: null };
    const file = {
      ...data,
      id: crypto.randomUUID(),
      organization_id: org,
      caminho: "fixture-levantamento-upload",
      estado: "pendente",
      created_by: actor,
      created_at: now,
      confirmado_em: null,
    };
    draft.arquivos.push(file);
    touchFile(draft, file);
    return { arquivo: file, token: null };
  });
export const retomarArquivoLevantamento = async ({ data }) => {
  await read("retomarArquivoLevantamento", data);
  const arquivo = state.arquivos.find((row) => row.id === data.id);
  if (!arquivo || arquivo.estado === "cancelado") throw new Error("Envio indisponível.");
  return { arquivo: copy(arquivo), token: null };
};
export const confirmarArquivoLevantamento = async ({ data }) =>
  write("confirmarArquivoLevantamento", data, (draft) => {
    if (scenario === "upload-error")
      throw new Error(
        "Armazenamento não confirmado no cenário isolado. Use Reverificar ou Retomar.",
      );
    const file = draft.arquivos.find((row) => row.id === data.id);
    if (!file || file.estado === "cancelado") throw new Error("Envio indisponível.");
    if (file.estado === "vinculado") return file;
    file.estado = "vinculado";
    file.confirmado_em = now;
    touchFile(draft, file);
    return file;
  });
export const cancelarArquivoLevantamento = async ({ data }) =>
  write("cancelarArquivoLevantamento", data, (draft) => {
    const file = draft.arquivos.find((row) => row.id === data.id);
    if (!file || file.estado === "vinculado")
      throw new Error("Somente envio pendente pode ser cancelado.");
    file.estado = "cancelado";
    touchFile(draft, file);
    return file;
  });
export const baixarArquivoLevantamento = async ({ data }) => {
  await read("baixarArquivoLevantamento", data);
  return {
    url: "data:text/plain,Evidencia%20exclusiva%20de%20fixture%20UI%20sem%20binario%20real",
  };
};
