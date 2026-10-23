// Test-only transport. PostgreSQL tests, not this fixture, prove stock and concurrency rules.
import { scenario } from "./data";
import { ALMOXARIFADO_ACESSO_INDISPONIVEL } from "../../src/features/almoxarifado/domain";
import {
  comandoAlmoxarifadoSchema,
  detalheAlmoxarifadoSchema,
  listaAlmoxarifadoSchema,
  resultadoComandoAlmoxarifadoSchema,
} from "../../src/features/almoxarifado/schemas";

const org = "10000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000001";
const person = "30000000-0000-4000-8000-000000000001";
const product = "90000000-0000-4000-8000-000000000001";
const local = "91000000-0000-4000-8000-000000000001";
const conference = "92000000-0000-4000-8000-000000000001";
const tool = "93000000-0000-4000-8000-000000000001";
const reservation = "94000000-0000-4000-8000-000000000001";
const calibration = "95000000-0000-4000-8000-000000000001";
const policy = "96000000-0000-4000-8000-000000000001";
const inventory = "97000000-0000-4000-8000-000000000001";
const receipt = "98000000-0000-4000-8000-000000000001";
const project = "99000000-0000-4000-8000-000000000001";
const now = "2026-10-22T12:00:00.000Z";
const meta = { organization_id: org, created_by: actor, created_at: now, updated_at: now };
const copy = (value) => structuredClone(value);
const quantity = (value) => String(Number(value));
const emptyBalance = () => ({
  fisico: "0",
  aceito: "0",
  quarentena: "0",
  rejeitado: "0",
  em_poder: "0",
  reservado: "0",
  disponivel: "0",
  consumido: "0",
});
const initialProduct = {
  id: product,
  codigo: "FIX-NXS-TESTE001",
  descricao:
    "Componente de montagem do laboratório isolado — identificação longa para leitura móvel",
  unidade: "un",
  indivisivel: true,
};
let state = {
  produtos: [initialProduct],
  locais: [
    {
      id: local,
      ...meta,
      nome: "Almoxarifado central do ambiente isolado",
      descricao: "Local de guarda de teste, sem posição presumida em operação.",
      ativo: true,
      version: 1,
    },
    {
      id: "91000000-0000-4000-8000-000000000002",
      ...meta,
      nome: "Apoio de campo do laboratório",
      descricao: "Destino de transferência do teste.",
      ativo: true,
      version: 1,
    },
  ],
  materiais: [
    {
      id: product,
      produto: initialProduct,
      politica: { exige_lote: false, exige_serie: false, estoque_minimo: "0", version: 1 },
      saldo: { ...emptyBalance(), fisico: "10", aceito: "10", disponivel: "10" },
    },
  ],
  conferencias: [
    {
      id: conference,
      ...meta,
      recebimento_id: receipt,
      apontamento_id: null,
      inventario_id: null,
      produto_id: product,
      local_id: local,
      produto: initialProduct,
      local_nome: "Almoxarifado central do ambiente isolado",
      quantidade: "10",
      unidade_origem: "un",
      fator: "1",
      aceita: "10",
      quarentena: "0",
      rejeitada: "0",
      lote: null,
      serie: null,
      motivo: "Entrada de teste confirmada",
      reconciliacao: null,
    },
  ],
  reservas: [
    {
      id: reservation,
      ...meta,
      produto_id: product,
      local_id: local,
      projeto_id: project,
      op_id: null,
      pessoa_id: person,
      produto: initialProduct,
      local_nome: "Almoxarifado central do ambiente isolado",
      pessoa_nome: "Responsável técnico de teste com nome completo extenso",
      projeto_nome: "Projeto do ambiente isolado",
      op_numero: null,
      lote: null,
      validade: "2026-12-31T20:00:00.000Z",
      estado: "cancelada",
      version: 1,
      quantidades: {
        quantidade: "8",
        reservada: "0",
        retirada: "0",
        consumida: "0",
        devolvida: "0",
        em_poder: "0",
        pendente_retirada: "0",
      },
    },
  ],
  movimentos: [
    {
      id: "9a000000-0000-4000-8000-000000000001",
      ...meta,
      conferencia_id: conference,
      produto_id: product,
      produto: initialProduct,
      local_id: local,
      local_nome: "Almoxarifado central do ambiente isolado",
      reserva_id: null,
      pessoa_id: null,
      posicao: "aceito",
      quantidade: "10",
      operacao: "conferencia",
      motivo: "Entrada de teste confirmada",
    },
  ],
  ferramentas: [
    {
      id: tool,
      ...meta,
      patrimonio: "PAT-TESTE-001",
      descricao: "Ferramenta individual de teste com identificação e custódia preservadas",
      produto_id: null,
      produto: null,
      local_id: local,
      local_nome: "Almoxarifado central do ambiente isolado",
      proprietario: "nexus",
      proprietario_nome: null,
      condicao: "disponivel",
      exige_calibracao: false,
      politica_calibracao_id: policy,
      version: 1,
      disponibilidade: "disponivel",
    },
  ],
  custodias: [],
  calibracoes: [
    {
      id: calibration,
      ferramenta_id: tool,
      politica_id: policy,
      emissor: "Laboratório do cenário isolado",
      execucao: "2026-10-20",
      validade: "2027-10-20",
      referencia: "Evidência pendente do laboratório de teste",
      estado: "em_conferencia",
      motivo: null,
      version: 2,
      created_by: actor,
      created_at: now,
      conferido_por: null,
      conferido_em: null,
    },
  ],
  politicas_calibracao: [
    {
      id: policy,
      nome: "Procedimento de conferência de teste",
      numero: 1,
      metodo:
        "Método aprovado apenas no contexto sintético do laboratório, sem prazo normativo presumido.",
      fonte: "Procedimento interno de teste, versão 1, profissional do cenário isolado.",
      exige_validade: false,
      profissional_id: person,
      created_at: now,
    },
  ],
  inventarios: [
    {
      id: inventory,
      produto_id: product,
      local_id: local,
      produto: initialProduct,
      local_nome: "Almoxarifado central do ambiente isolado",
      lote: null,
      contada: "10",
      baseline: "10",
      diferenca: "0",
      estado: "aberto",
      motivo: "Conferência física de teste sem diferença",
      version: 1,
      created_by: actor,
      created_at: now,
      aprovado_por: null,
      aprovado_em: null,
    },
  ],
  historico: [],
};
if (scenario === "empty") for (const key of Object.keys(state)) state[key] = [];
if (scenario === "zero") Object.assign(state.materiais[0].saldo, emptyBalance());
const receipts = new Map();
window.__nexusStock = state;
function permissions() {
  const manage = scenario !== "readonly" && !window.__stockReadOnly;
  return {
    ler: true,
    gerir: manage,
    conferir: manage,
    reservar: manage,
    aprovar_ajuste: manage,
    publicar_politica_calibracao: manage,
  };
}
async function read(name, data) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "readonly" || window.__stockReadOnly) window.__anexoCanAdd = false;
  if (scenario === "loading") await new Promise(() => {});
  if (scenario === "error" || window.__stockQueryError)
    throw new Error("Consulta de estoque indisponível no cenário isolado. Tente novamente.");
  if (scenario === "restricted" || window.__stockAccessDenied)
    throw new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL);
}
function find(rows, id) {
  const row = rows.find((row) => row.id === id);
  if (!row) throw new Error("Registro de teste indisponível.");
  return row;
}
function version(row, expected) {
  if (row.version !== expected)
    throw new Error(
      "O registro ou sua disponibilidade mudou. Seu preenchimento foi preservado; recarregue e confira antes de confirmar.",
    );
}
function detail(data, draft = state) {
  const registro = find(draft[data.tipo], data.id);
  const p = permissions();
  return detalheAlmoxarifadoSchema.parse({
    tipo: data.tipo,
    id: registro.id,
    registro,
    historico: draft.historico.filter((event) => event.registro_id === registro.id),
    permissoes: { ...p, editar: p.gerir, executar: p.gerir },
    ...(data.tipo === "materiais"
      ? {
          lotes: draft.conferencias
            .filter((row) => row.produto_id === registro.id)
            .map((row) => ({
              conferencia_id: row.id,
              local_id: row.local_id,
              local_nome: row.local_nome,
              lote: row.lote,
              serie: row.serie,
              saldo: registro.saldo,
            })),
        }
      : {}),
    ...(data.tipo === "ferramentas"
      ? {
          custodias: draft.custodias.filter((row) => row.ferramenta_id === registro.id),
          calibracoes: draft.calibracoes.filter((row) => row.ferramenta_id === registro.id),
          politicas: draft.politicas_calibracao,
        }
      : {}),
    ...(data.tipo === "reservas"
      ? {
          alocacoes: [
            {
              conferencia_id: conference,
              quantidade: registro.quantidades.quantidade,
              retirada: registro.quantidades.retirada,
              consumida: registro.quantidades.consumida,
              devolvida: registro.quantidades.devolvida,
            },
          ],
        }
      : {}),
  });
}
export const listarAlmoxarifado = async ({ data }) => {
  await read("listarAlmoxarifado", data);
  let rows = state[data.tipo];
  const term = (data.busca || "").toLocaleLowerCase("pt-BR");
  if (term)
    rows = rows.filter((row) => JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(term));
  if (data.estado)
    rows = rows.filter(
      (row) =>
        (data.tipo === "locais"
          ? row.ativo
            ? "ativo"
            : "arquivado"
          : row.estado || row.condicao) === data.estado,
    );
  if (data.local_id)
    rows = rows.filter(
      (row) =>
        data.tipo === "materiais" ||
        row.local_id === data.local_id ||
        (data.tipo === "locais" && row.id === data.local_id),
    );
  const page = data.pagina || 0,
    pageSize = data.limite || 25;
  return listaAlmoxarifadoSchema.parse({
    tipo: data.tipo,
    rows: rows.slice(page * pageSize, (page + 1) * pageSize),
    total: rows.length,
    page,
    pageSize,
    permissoes: permissions(),
  });
};
export const obterAlmoxarifado = async ({ data }) => {
  await read("obterAlmoxarifado", data);
  if (window.__stockAdvanceVersion) {
    window.__stockAdvanceVersion = false;
    const record = find(state[data.tipo], data.id);
    if (data.tipo === "materiais") record.politica.version += 1;
    else record.version += 1;
  }
  return copy(detail(data));
};
function movement(draft, item, values) {
  const row = {
    id: crypto.randomUUID(),
    ...meta,
    conferencia_id: conference,
    produto_id: item.id,
    produto: item.produto,
    local_id: local,
    local_nome: draft.locais[0].nome,
    reserva_id: null,
    pessoa_id: null,
    motivo: null,
    ...values,
  };
  draft.movimentos.push(row);
}
export const executarAlmoxarifado = async ({ data: raw }) => {
  const data = comandoAlmoxarifadoSchema.parse(raw);
  window.__nexusCalls.push({ name: "executarAlmoxarifado", payload: { data: copy(data) } });
  if (window.__stockAccessDenied || scenario === "restricted" || !permissions().gerir)
    throw new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL);
  if (scenario === "write-error" || window.__stockFailWrite) {
    window.__stockFailWrite = false;
    throw new Error("Falha de rede simulada. Preenchimento mantido para repetir.");
  }
  if (scenario === "write-conflict" || window.__stockConflict)
    throw new Error(
      "O registro ou sua disponibilidade mudou. Seu preenchimento foi preservado; recarregue e confira antes de confirmar.",
    );
  const payload = JSON.stringify({ ...data, chave: null }),
    previous = receipts.get(data.chave);
  if (previous) {
    if (previous.payload !== payload)
      throw new Error("Chave reutilizada com conteúdo diferente na fixture.");
    return copy(previous.result);
  }
  const draft = copy(state);
  let tipo = "materiais",
    id = data.produto_id || product;
  const item = () => find(draft.materiais, data.produto_id || product);
  switch (data.comando) {
    case "salvar_local": {
      let row = data.local_id ? find(draft.locais, data.local_id) : null;
      if (row) {
        version(row, data.expected_version);
        Object.assign(row, {
          nome: data.nome,
          descricao: data.descricao,
          ativo: data.ativo,
          version: row.version + 1,
        });
      } else {
        row = {
          id: crypto.randomUUID(),
          ...meta,
          nome: data.nome,
          descricao: data.descricao,
          ativo: data.ativo,
          version: 1,
        };
        draft.locais.push(row);
      }
      tipo = "locais";
      id = row.id;
      break;
    }
    case "configurar_produto": {
      const row = item();
      if ((data.expected_version ?? 0) !== row.politica.version)
        throw new Error(
          "O registro ou sua disponibilidade mudou. Seu preenchimento foi preservado; recarregue e confira antes de confirmar.",
        );
      row.politica = {
        exige_lote: data.exige_lote,
        exige_serie: data.exige_serie,
        estoque_minimo: data.estoque_minimo,
        version: row.politica.version + 1,
      };
      id = row.id;
      break;
    }
    case "conferir_evento": {
      if (
        Number(data.aceita) + Number(data.quarentena) + Number(data.rejeitada) !==
        Number(data.quantidade)
      )
        throw new Error("A classificação deve fechar com a quantidade recebida.");
      if (
        draft.conferencias.some((row) =>
          data.recebimento_id
            ? row.recebimento_id === data.recebimento_id
            : row.apontamento_id === data.apontamento_id,
        )
      )
        throw new Error("Essa origem já possui conferência. Confira o histórico.");
      const material = item(),
        location = find(draft.locais, data.local_id);
      const row = {
        id: crypto.randomUUID(),
        ...meta,
        recebimento_id: data.recebimento_id,
        apontamento_id: data.apontamento_id,
        inventario_id: null,
        produto_id: data.produto_id,
        local_id: data.local_id,
        produto: material.produto,
        local_nome: location.nome,
        quantidade: data.quantidade,
        unidade_origem: material.produto.unidade,
        fator: "1",
        aceita: data.aceita,
        quarentena: data.quarentena,
        rejeitada: data.rejeitada,
        lote: data.lote || null,
        serie: data.serie || null,
        motivo: data.motivo || null,
        reconciliacao: data.reconciliacao || null,
      };
      draft.conferencias.push(row);
      for (const [field, value] of [
        ["aceito", data.aceita],
        ["quarentena", data.quarentena],
        ["rejeitado", data.rejeitada],
      ])
        material.saldo[field] = quantity(Number(material.saldo[field]) + Number(value));
      material.saldo.fisico = quantity(Number(material.saldo.fisico) + Number(data.quantidade));
      material.saldo.disponivel = quantity(Number(material.saldo.disponivel) + Number(data.aceita));
      movement(draft, material, {
        conferencia_id: row.id,
        quantidade: data.aceita,
        operacao: "conferencia",
        posicao: "aceito",
      });
      tipo = "conferencias";
      id = row.id;
      break;
    }
    case "reclassificar_quarentena": {
      const row = find(draft.conferencias, data.conferencia_id),
        material = find(draft.materiais, row.produto_id),
        n = Number(data.quantidade);
      if (n > Number(row.quarentena))
        throw new Error("Quantidade maior que a posição em quarentena.");
      row.quarentena = quantity(Number(row.quarentena) - n);
      row[data.destino === "aceito" ? "aceita" : "rejeitada"] = quantity(
        Number(row[data.destino === "aceito" ? "aceita" : "rejeitada"]) + n,
      );
      material.saldo.quarentena = quantity(Number(material.saldo.quarentena) - n);
      material.saldo[data.destino] = quantity(Number(material.saldo[data.destino]) + n);
      if (data.destino === "aceito")
        material.saldo.disponivel = quantity(Number(material.saldo.disponivel) + n);
      tipo = "conferencias";
      id = row.id;
      break;
    }
    case "transferir": {
      const row = item();
      if (Number(data.quantidade) > Number(row.saldo.disponivel))
        throw new Error("Saldo disponível insuficiente.");
      movement(draft, row, {
        local_id: data.origem_local_id,
        quantidade: "-" + data.quantidade,
        operacao: "transferencia",
        posicao: "aceito",
        motivo: data.motivo,
      });
      movement(draft, row, {
        local_id: data.destino_local_id,
        quantidade: data.quantidade,
        operacao: "transferencia",
        posicao: "aceito",
        motivo: data.motivo,
      });
      id = row.id;
      break;
    }
    case "reservar": {
      const material = item(),
        n = Number(data.quantidade);
      if (n > Number(material.saldo.disponivel))
        throw new Error("Saldo disponível insuficiente; a reserva não foi confirmada.");
      const row = {
        id: crypto.randomUUID(),
        ...meta,
        produto_id: data.produto_id,
        local_id: data.local_id,
        projeto_id: data.projeto_id,
        op_id: data.op_id,
        pessoa_id: data.pessoa_id,
        produto: material.produto,
        local_nome: find(draft.locais, data.local_id).nome,
        pessoa_nome: "Responsável técnico de teste com nome completo extenso",
        projeto_nome: data.projeto_id ? "Projeto do ambiente isolado" : null,
        op_numero: data.op_id ? "OP-TESTE-001" : null,
        lote: data.lote || null,
        validade: data.validade,
        estado: "ativa",
        version: 1,
        quantidades: {
          quantidade: data.quantidade,
          reservada: data.quantidade,
          retirada: "0",
          consumida: "0",
          devolvida: "0",
          em_poder: "0",
          pendente_retirada: data.quantidade,
        },
      };
      draft.reservas.push(row);
      material.saldo.reservado = quantity(Number(material.saldo.reservado) + n);
      material.saldo.disponivel = quantity(Number(material.saldo.disponivel) - n);
      tipo = "reservas";
      id = row.id;
      break;
    }
    case "retirar":
    case "consumir":
    case "devolver": {
      const row = find(draft.reservas, data.reserva_id),
        material = find(draft.materiais, row.produto_id),
        n = Number(data.quantidade),
        q = row.quantidades;
      version(row, data.expected_version);
      if (data.comando === "retirar") {
        if (n > Number(q.pendente_retirada))
          throw new Error("Retirada maior que o saldo reservado.");
        q.pendente_retirada = quantity(Number(q.pendente_retirada) - n);
        q.reservada = quantity(Number(q.reservada) - n);
        q.retirada = quantity(Number(q.retirada) + n);
        q.em_poder = quantity(Number(q.em_poder) + n);
        material.saldo.reservado = quantity(Number(material.saldo.reservado) - n);
        material.saldo.aceito = quantity(Number(material.saldo.aceito) - n);
        material.saldo.em_poder = quantity(Number(material.saldo.em_poder) + n);
        row.estado = "retirada";
      } else {
        if (n > Number(q.em_poder))
          throw new Error("Quantidade maior que o material em poder da pessoa.");
        q.em_poder = quantity(Number(q.em_poder) - n);
        material.saldo.em_poder = quantity(Number(material.saldo.em_poder) - n);
        if (data.comando === "consumir") {
          q.consumida = quantity(Number(q.consumida) + n);
          material.saldo.consumido = quantity(Number(material.saldo.consumido) + n);
          material.saldo.fisico = quantity(Number(material.saldo.fisico) - n);
        } else {
          q.devolvida = quantity(Number(q.devolvida) + n);
          material.saldo.aceito = quantity(Number(material.saldo.aceito) + n);
          material.saldo.disponivel = quantity(Number(material.saldo.disponivel) + n);
        }
        if (q.em_poder === "0" && q.pendente_retirada === "0") row.estado = "concluida";
      }
      row.version += 1;
      movement(draft, material, {
        quantidade: data.quantidade,
        operacao:
          data.comando === "retirar"
            ? "retirada"
            : data.comando === "consumir"
              ? "consumo"
              : "devolucao",
        posicao:
          data.comando === "consumir"
            ? "consumido"
            : data.comando === "devolver"
              ? "aceito"
              : "em_poder",
        reserva_id: row.id,
        pessoa_id: row.pessoa_id,
        motivo: data.motivo,
      });
      tipo = "reservas";
      id = row.id;
      break;
    }
    case "cancelar_reserva": {
      const row = find(draft.reservas, data.reserva_id),
        material = find(draft.materiais, row.produto_id);
      version(row, data.expected_version);
      const n = Number(row.quantidades.pendente_retirada);
      material.saldo.reservado = quantity(Number(material.saldo.reservado) - n);
      material.saldo.disponivel = quantity(Number(material.saldo.disponivel) + n);
      row.quantidades.reservada = "0";
      row.quantidades.pendente_retirada = "0";
      row.estado = "cancelada";
      row.version += 1;
      tipo = "reservas";
      id = row.id;
      break;
    }
    case "estornar_evento": {
      const row = draft.conferencias.find((row) =>
          data.tipo === "recebimento"
            ? row.recebimento_id === data.evento_id
            : row.apontamento_id === data.evento_id,
        ),
        material = find(draft.materiais, row?.produto_id),
        n = Number(data.quantidade);
      if (!row || n > Number(material.saldo.disponivel))
        throw new Error("Material já reservado ou consumido; estorno indisponível.");
      material.saldo.aceito = quantity(Number(material.saldo.aceito) - n);
      material.saldo.disponivel = quantity(Number(material.saldo.disponivel) - n);
      material.saldo.fisico = quantity(Number(material.saldo.fisico) - n);
      movement(draft, material, {
        quantidade: "-" + data.quantidade,
        operacao: "estorno",
        posicao: "aceito",
        motivo: data.motivo,
      });
      tipo = "conferencias";
      id = row.id;
      break;
    }
    case "salvar_ferramenta": {
      let row = data.ferramenta_id ? find(draft.ferramentas, data.ferramenta_id) : null;
      if (row) version(row, data.expected_version);
      const fields = {
        patrimonio: data.patrimonio,
        descricao: data.descricao,
        produto_id: data.produto_id,
        produto: data.produto_id ? find(draft.produtos, data.produto_id) : null,
        local_id: data.local_id,
        local_nome: find(draft.locais, data.local_id).nome,
        proprietario: data.proprietario,
        proprietario_nome: data.proprietario_nome,
        exige_calibracao: data.exige_calibracao,
        politica_calibracao_id: data.politica_calibracao_id,
      };
      if (row) Object.assign(row, fields, { version: row.version + 1 });
      else {
        row = {
          id: crypto.randomUUID(),
          ...meta,
          ...fields,
          condicao: "disponivel",
          disponibilidade: "disponivel",
          version: 1,
        };
        draft.ferramentas.push(row);
      }
      tipo = "ferramentas";
      id = row.id;
      break;
    }
    case "alterar_condicao": {
      const row = find(draft.ferramentas, data.ferramenta_id);
      version(row, data.expected_version);
      row.condicao = data.condicao;
      row.disponibilidade = data.condicao === "disponivel" ? "disponivel" : "impedida";
      row.version += 1;
      tipo = "ferramentas";
      id = row.id;
      break;
    }
    case "reservar_ferramenta": {
      const row = find(draft.ferramentas, data.ferramenta_id);
      version(row, data.expected_version);
      if (row.condicao !== "disponivel")
        throw new Error("Ferramenta impedida pela condição cadastrada.");
      if (
        draft.custodias.some(
          (c) =>
            c.ferramenta_id === row.id &&
            ["reservada", "retirada"].includes(c.estado) &&
            c.inicio < data.fim &&
            data.inicio < c.fim,
        )
      )
        throw new Error("Ferramenta já reservada neste período.");
      draft.custodias.push({
        id: crypto.randomUUID(),
        ferramenta_id: row.id,
        pessoa_id: data.pessoa_id,
        pessoa_nome: "Responsável técnico de teste com nome completo extenso",
        inicio: data.inicio,
        fim: data.fim,
        timezone: data.timezone,
        estado: "reservada",
        retirada_em: null,
        devolvida_em: null,
        condicao_devolucao: null,
        motivo: null,
        version: 1,
      });
      row.version += 1;
      row.disponibilidade = "reservada";
      tipo = "ferramentas";
      id = row.id;
      break;
    }
    case "retirar_ferramenta":
    case "devolver_ferramenta":
    case "cancelar_custodia": {
      const row = find(draft.custodias, data.custodia_id),
        parent = find(draft.ferramentas, row.ferramenta_id);
      version(row, data.expected_version);
      row.estado =
        data.comando === "retirar_ferramenta"
          ? "retirada"
          : data.comando === "devolver_ferramenta"
            ? "devolvida"
            : "cancelada";
      row.version += 1;
      parent.version += 1;
      if (row.estado === "retirada") {
        row.retirada_em = now;
        parent.disponibilidade = "em_poder";
      } else {
        parent.disponibilidade = "disponivel";
        row.motivo = data.motivo;
        if (data.comando === "devolver_ferramenta") {
          row.devolvida_em = now;
          row.condicao_devolucao = data.condicao;
          parent.condicao = data.condicao;
          if (data.condicao !== "disponivel") parent.disponibilidade = "impedida";
        }
      }
      tipo = "ferramentas";
      id = parent.id;
      break;
    }
    case "publicar_politica_calibracao": {
      const row = {
        id: crypto.randomUUID(),
        nome: data.nome,
        numero: draft.politicas_calibracao.length + 1,
        metodo: data.metodo,
        fonte: data.fonte,
        exige_validade: data.exige_validade,
        profissional_id: person,
        created_at: now,
      };
      draft.politicas_calibracao.push(row);
      tipo = "politicas_calibracao";
      id = row.id;
      break;
    }
    case "registrar_calibracao": {
      const parent = find(draft.ferramentas, data.ferramenta_id);
      find(draft.politicas_calibracao, data.politica_id);
      draft.calibracoes.push({
        id: crypto.randomUUID(),
        ferramenta_id: parent.id,
        politica_id: data.politica_id,
        emissor: data.emissor,
        execucao: data.execucao,
        validade: data.validade,
        referencia: data.referencia,
        estado: "enviada",
        motivo: null,
        version: 1,
        created_by: actor,
        created_at: now,
        conferido_por: null,
        conferido_em: null,
      });
      parent.version += 1;
      tipo = "ferramentas";
      id = parent.id;
      break;
    }
    case "conferir_calibracao": {
      const row = find(draft.calibracoes, data.calibracao_id);
      version(row, data.expected_version);
      if (!(
        (row.estado === "enviada" && data.estado === "em_conferencia") ||
        (row.estado === "em_conferencia" && ["validada", "revogada"].includes(data.estado)) ||
        (row.estado === "validada" && data.estado === "revogada")
      ))
        throw new Error("Transição de conferência não permitida.");
      if (
        data.estado === "validada" &&
        !window.__nexusOperational?.anexos.some(
          (a) => a.calibracao_id === row.id && a.estado === "vinculado",
        )
      )
        throw new Error("Confirme um arquivo do certificado antes de validar a calibração.");
      row.estado = data.estado;
      row.motivo = data.motivo || null;
      row.version += 1;
      row.conferido_por = actor;
      row.conferido_em = now;
      tipo = "ferramentas";
      id = row.ferramenta_id;
      break;
    }
    case "criar_inventario": {
      const material = item(),
        row = {
          id: crypto.randomUUID(),
          produto_id: material.id,
          produto: material.produto,
          local_id: data.local_id,
          local_nome: find(draft.locais, data.local_id).nome,
          lote: data.lote || null,
          contada: data.contada,
          baseline: material.saldo.aceito,
          diferenca: quantity(Number(data.contada) - Number(material.saldo.aceito)),
          estado: "aberto",
          motivo: data.motivo,
          version: 1,
          created_by: actor,
          created_at: now,
          aprovado_por: null,
          aprovado_em: null,
        };
      draft.inventarios.push(row);
      tipo = "inventarios";
      id = row.id;
      break;
    }
    case "aprovar_inventario":
    case "cancelar_inventario": {
      const row = find(draft.inventarios, data.inventario_id),
        material = find(draft.materiais, row.produto_id);
      version(row, data.expected_version);
      if (data.comando === "aprovar_inventario") {
        if (material.saldo.aceito !== row.baseline)
          throw new Error("Saldo-base mudou; registre nova contagem antes de aprovar.");
        material.saldo.aceito = row.contada;
        material.saldo.fisico = quantity(Number(material.saldo.fisico) + Number(row.diferenca));
        material.saldo.disponivel = quantity(
          Number(material.saldo.disponivel) + Number(row.diferenca),
        );
        row.aprovado_por = actor;
        row.aprovado_em = now;
        row.estado = "aprovado";
      } else row.estado = "cancelado";
      row.version += 1;
      tipo = "inventarios";
      id = row.id;
      break;
    }
  }
  draft.historico.push({
    id: draft.historico.length + 1,
    registro_id: id,
    operacao: data.comando,
    motivo: data.motivo || null,
    autor: actor,
    created_at: now,
  });
  const result = resultadoComandoAlmoxarifadoSchema.parse({
    tipo,
    id,
    detalhe: detail({ tipo, id }, draft),
  });
  state = draft;
  window.__nexusStock = state;
  receipts.set(data.chave, { payload, result: copy(result) });
  return copy(result);
};
export const buscarOpcoesAlmoxarifado = async ({ data }) => {
  await read("buscarOpcoesAlmoxarifado", data);
  const options = {
    produtos: state.produtos.map((row) => ({
      id: row.id,
      nome: row.codigo + " · " + row.descricao,
      contexto: "Unidade: " + row.unidade,
      produto_id: row.id,
      unidade: row.unidade,
    })),
    locais: state.locais.map((row) => ({
      id: row.id,
      nome: row.nome,
      contexto: row.ativo ? "Ativo" : "Arquivado",
    })),
    pessoas: [
      {
        id: person,
        nome: "Responsável técnico de teste com nome completo extenso",
        contexto: "Pessoa do laboratório isolado",
        pessoa_id: person,
      },
    ],
    projetos: [
      {
        id: project,
        nome: "Projeto do ambiente isolado",
        contexto: "Destino de execução de teste",
        projeto_id: project,
      },
    ],
    ordens_producao: [
      {
        id: "9b000000-0000-4000-8000-000000000001",
        nome: "OP-TESTE-001",
        contexto: "Produção do laboratório",
        op_id: "9b000000-0000-4000-8000-000000000001",
      },
    ],
    recebimentos: [
      {
        id: "98000000-0000-4000-8000-000000000002",
        nome: "Recebimento parcial de teste",
        contexto: "4 un do produto do laboratório",
        recebimento_id: "98000000-0000-4000-8000-000000000002",
        produto_id: product,
        quantidade: "4",
        unidade: "un",
      },
    ],
    apontamentos: [
      {
        id: "9c000000-0000-4000-8000-000000000001",
        nome: "Apontamento de produção de teste",
        contexto: "2 un produzidas no laboratório",
        apontamento_id: "9c000000-0000-4000-8000-000000000001",
        produto_id: product,
        quantidade: "2",
        unidade: "un",
      },
    ],
    ferramentas: state.ferramentas.map((row) => ({
      id: row.id,
      nome: row.patrimonio + " · " + row.descricao,
      contexto: row.local_nome,
    })),
    politicas_calibracao: state.politicas_calibracao.map((row) => ({
      id: row.id,
      nome: row.nome + " · V" + row.numero,
      contexto: row.fonte,
    })),
  };
  const term = (data.busca || "").toLocaleLowerCase("pt-BR"),
    rows = (options[data.tipo] || []).filter(
      (row) => !term || (row.nome + " " + row.contexto).toLocaleLowerCase("pt-BR").includes(term),
    );
  return copy({
    rows: rows.slice(0, 25),
    total: rows.length,
    page: data.pagina || 0,
    pageSize: 25,
  });
};
