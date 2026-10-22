// Synthetic, mutable presentation fixture. Never imported by application builds.
// These mocks exercise UI states only; they do not prove SQL, RLS, Storage or persistence.
import { scenario } from "./data";

const org = "10000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000001";
const cli = "20000000-0000-4000-8000-000000000001";
const uni = "21000000-0000-4000-8000-000000000001";
const pessoa = "30000000-0000-4000-8000-000000000001";
const projeto = "40000000-0000-4000-8000-000000000001";
const v1 = "41000000-0000-4000-8000-000000000001";
const v2 = "41000000-0000-4000-8000-000000000002";
const now = "2026-10-22T12:00:00.000Z";
const copy = (v) => structuredClone(v);
const base = {
  organization_id: org,
  version: 1,
  created_at: now,
  updated_at: now,
  arquivado_em: null,
  motivo_arquivo: null,
  observacoes: null,
};
const cliente = {
  ...base,
  id: cli,
  razao_social: "Empresa de referência do ambiente isolado de testes",
  nome_exibicao: "Cliente de teste — unidade agroindustrial",
  cnpj: "AB.123.456/0001-90",
  identificador_normalizado: "AB123456000190",
  cidade: "Santa Rosa",
  uf: "RS",
  situacao: "Ativo",
};
const unidade = {
  ...base,
  id: uni,
  cliente_id: cli,
  nome: "Unidade de armazenagem e recebimento — acesso norte",
  endereco: "Endereço de teste, sem correspondência com cliente real",
  distancia_ida_volta_km: 48,
};
const pessoasBase = [
  {
    id: pessoa,
    organization_id: org,
    nome: "Responsável técnico de teste com nome completo extenso",
    vinculo: "colaborador",
    funcao: "Engenharia e revisão documental",
    email_profissional: "engenharia@example.invalid",
    telefone_profissional: "",
    registro_profissional: "",
    user_id: null,
    ativa: true,
    version: 1,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    organization_id: org,
    nome: "Técnico de campo do ambiente de validação",
    vinculo: "prestador",
    funcao: "Instalação e inspeção",
    email_profissional: "campo@example.invalid",
    telefone_profissional: "",
    registro_profissional: "",
    user_id: null,
    ativa: true,
    version: 1,
  },
];
const modelo = {
  schema_version: 1,
  familia: "documental",
  finalidade: "layout_preliminar",
  secoes: [
    {
      id: "42000000-0000-4000-8000-000000000001",
      titulo: "Objetivo e escopo",
      texto:
        "Estudo preliminar de acesso à área de manutenção. Conteúdo exclusivo do ambiente de teste; não constitui autorização de execução.",
    },
    {
      id: "42000000-0000-4000-8000-000000000002",
      titulo: "Fontes e premissas",
      texto:
        "Documento de referência de teste e observações de levantamento a confirmar. A representação geométrica será objeto de desenvolvimento próprio.",
    },
    {
      id: "42000000-0000-4000-8000-000000000003",
      titulo: "Pendências de conferência",
      texto:
        "Conferir implantação no local, registrar fonte das medidas e formalizar revisão profissional aplicável.",
    },
  ],
  parametros: [
    {
      id: "43000000-0000-4000-8000-000000000001",
      nome: "Largura útil declarada",
      valor_original: "1,200",
      unidade: "m",
      natureza: "declarado",
      validacao: "a_confirmar",
      fonte: "Fonte documental de teste, folha 2 — medida pendente de levantamento",
    },
  ],
};
const projetoBase = {
  id: projeto,
  organization_id: org,
  titulo: "Estudo preliminar de acesso e manutenção — unidade de armazenagem",
  descricao:
    "Projeto documental independente de proposta e obra, com revisões e experimentos rastreáveis.",
  cliente_id: cli,
  unidade_id: uni,
  responsavel_id: pessoa,
  local_descritivo: "",
  visibilidade: "restrito",
  arquivado: false,
  vigente_id: v1,
  version: 1,
  created_at: now,
  updated_at: now,
  clientes: { razao_social: cliente.razao_social },
  unidades: { nome: unidade.nome },
  pessoas: { nome: pessoasBase[0].nome },
};
const primeira = {
  id: v1,
  projeto_id: projeto,
  numero: 1,
  parent_id: null,
  estado: "congelada",
  elaborado_em: "2026-10-15",
  autor_declarado: "Autor declarado da referência de teste",
  revisao_declarada: "A",
  resumo: "Registro da primeira referência documental",
  modelo: copy(modelo),
  snapshot: {
    schema_version: 1,
    projeto: {
      id: projeto,
      titulo: projetoBase.titulo,
      cliente: cliente.razao_social,
      unidade: unidade.nome,
      local: "",
    },
    versao: {
      id: v1,
      numero: 1,
      elaborado_em: "2026-10-15",
      autor_declarado: "Autor declarado da referência de teste",
      revisao_declarada: "A",
      resumo: "Registro da primeira referência documental",
    },
    modelo: copy(modelo),
  },
  snapshot_sha256: "a".repeat(64),
  version: 1,
  created_at: now,
};
const segunda = {
  ...copy(primeira),
  id: v2,
  numero: 2,
  parent_id: v1,
  estado: "rascunho",
  resumo: "Revisão das premissas e pendências de campo",
  snapshot: null,
  snapshot_sha256: null,
};
segunda.modelo.secoes[2].texto += " Confirmar responsável pela próxima visita.";
const state = {
  membros:
    scenario === "empty"
      ? []
      : [
          {
            id: "60000000-0000-4000-8000-000000000001",
            user_id: actor,
            nome: "Administrador do ambiente isolado de validação",
            email: "admin@example.invalid",
            roles: [{ id: "61000000-0000-4000-8000-000000000001", user_id: actor, role: "admin" }],
            coordenacao: false,
          },
          {
            id: "60000000-0000-4000-8000-000000000002",
            user_id: "00000000-0000-4000-8000-000000000002",
            nome: "Técnico de campo do ambiente de teste — serviços e inspeções",
            email: "campo@example.invalid",
            roles: [
              {
                id: "61000000-0000-4000-8000-000000000002",
                user_id: "00000000-0000-4000-8000-000000000002",
                role: "campo",
              },
            ],
            coordenacao: true,
          },
        ],
  pessoas: scenario === "empty" ? [] : copy(pessoasBase),
  acoes:
    scenario === "empty"
      ? []
      : [
          {
            id: "50000000-0000-4000-8000-000000000001",
            organization_id: org,
            titulo: "Conferir evidência da condição observada no acesso de manutenção",
            descricao:
              "Pendência de teste vinculada ao contexto operacional; nenhuma ocorrência real está sendo exposta.",
            responsavel_id: pessoa,
            prazo: "2026-10-23",
            prioridade: "alta",
            exige_verificacao: true,
            estado: "aberta",
            conclusao: null,
            motivo: null,
            version: 1,
          },
        ],
  anexos: [],
  clientes: scenario === "empty" ? [] : [copy(cliente)],
  unidades: scenario === "empty" ? [] : [copy(unidade)],
  contatos:
    scenario === "empty"
      ? []
      : [
          {
            ...base,
            id: "22000000-0000-4000-8000-000000000001",
            cliente_id: cli,
            unidade_id: uni,
            unidade_nome: unidade.nome,
            nome: "Contato profissional do cenário de teste",
            cargo: "Operação da unidade",
            email: "contato@example.invalid",
            telefone: "",
          },
        ],
  historico: [],
  projetos: scenario === "empty" ? [] : [copy(projetoBase)],
  versoes: scenario === "empty" ? [] : [copy(segunda), copy(primeira)],
  cenarios: [],
  eventos:
    scenario === "empty"
      ? []
      : [
          {
            id: 1,
            projeto_id: projeto,
            comando: "criar",
            motivo: "Primeira versão documental",
            created_at: now,
          },
        ],
};
window.__nexusOperational = state;
window.__operationalFail = scenario === "error";
const operations = new Map();
const peArquivos = [];
window.__nexusPeArquivos = peArquivos;
export const listarArquivosPe = async ({ data }) => {
  await read("listarArquivosPe", { data });
  if (window.__peFileQueryError)
    throw new Error(
      window.__peFileQueryError === "denied"
        ? "Arquivo indisponível para seu acesso atual."
        : "Não foi possível atualizar os originais privados (fixture).",
    );
  const version = state.versoes.find((v) => v.id === data.versao_id);
  const project = state.projetos.find((p) => p.id === version?.projeto_id);
  if (!version || !project) throw new Error("Arquivo indisponível para seu acesso atual.");
  return copy({
    rows: peArquivos
      .filter((a) => a.versao_id === data.versao_id && a.estado !== "cancelado")
      .map((a) => ({ ...a, meu_envio: a.created_by === actor })),
    permissoes: {
      ler: true,
      adicionar:
        !window.__peFilesReadOnly &&
        scenario !== "restricted" &&
        version.estado === "rascunho" &&
        !project.arquivado,
    },
  });
};
export const prepararArquivoPe = async ({ data }) =>
  write("prepararArquivoPe", data, () => {
    const existing = peArquivos.find(
      (a) =>
        a.organization_id === org &&
        a.versao_id === data.versao_id &&
        a.sha256 === data.sha256 &&
        a.estado !== "cancelado",
    );
    if (existing) {
      if (existing.tamanho !== data.tamanho || existing.mime !== data.mime)
        throw new Error("Hash já registrado com tamanho ou tipo diferente (fixture).");
      return { arquivo: copy(existing), token: null };
    }
    const arquivo = {
      ...data,
      id: crypto.randomUUID(),
      organization_id: org,
      projeto_id: state.versoes.find((v) => v.id === data.versao_id)?.projeto_id,
      created_by: actor,
      created_at: now,
      confirmado_em: null,
      estado: "pendente",
      caminho: "fixture-pe-private",
    };
    peArquivos.push(arquivo);
    return { arquivo, token: null };
  });
export const retomarArquivoPe = async ({ data }) => ({
  arquivo: copy(peArquivos.find((a) => a.id === data.id)),
  token: null,
});
export const confirmarArquivoPe = async ({ data }) => {
  if (window.__peFileConfirmError) throw new Error("Falha de confirmação do original na fixture.");
  const arquivo = peArquivos.find((a) => a.id === data.id);
  if (!arquivo) throw new Error("Arquivo de teste não encontrado.");
  arquivo.estado = "vinculado";
  arquivo.confirmado_em = now;
  return copy(arquivo);
};
export const cancelarArquivoPe = async ({ data }) =>
  write("cancelarArquivoPe", data, () => {
    const arquivo = peArquivos.find((a) => a.id === data.id);
    arquivo.estado = "cancelado";
    return arquivo;
  });
export const baixarArquivoPe = async ({ data }) => {
  await read("baixarArquivoPe", { data });
  return { url: "data:text/plain,Original%20do%20ambiente%20isolado%20de%20teste" };
};
export const consultarAcessoOperacional = async () => ({
  gerirEquipe: scenario !== "restricted",
  gerirOperacao: scenario !== "restricted",
  revisarOperacao: scenario !== "restricted",
  pessoaId: scenario === "restricted" ? pessoa : null,
});
export const obterPessoa = async ({ data }) => {
  await read("obterPessoa", { data });
  return copy(state.pessoas.find((p) => p.id === data.id));
};
export const obterAcao = async ({ data }) => {
  await read("obterAcao", { data });
  return copy(state.acoes.find((a) => a.id === data.id));
};
export const retomarUpload = async ({ data }) => {
  const anexo = state.anexos.find((a) => a.id === data.id);
  if (!anexo) throw new Error("Envio não encontrado na fixture.");
  return { anexo: copy(anexo), token: null };
};
async function read(name, payload) {
  window.__nexusCalls.push({ name, payload });
  if (scenario === "loading") await new Promise(() => {});
  if (window.__operationalFail)
    throw new Error("Consulta indisponível no cenário isolado. Tente novamente.");
}
function write(name, data, work) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "write-error" || window.__failNextWrite) {
    window.__failNextWrite = false;
    throw new Error("Falha de rede simulada; conteúdo local preservado.");
  }
  if (scenario === "write-conflict" || window.__conflictWrite)
    throw new Error("Outra pessoa alterou este registro. Recarregue e compare antes de salvar.");
  const key = data.chave;
  const payload = JSON.stringify({ ...data, chave: null });
  const anterior = operations.get(key);
  if (anterior) {
    if (anterior.payload !== payload)
      throw new Error("Chave reutilizada com conteúdo diferente (fixture).");
    return copy(anterior.result);
  }
  const result = work();
  if (key) operations.set(key, { payload, result: copy(result) });
  return copy(result);
}
function rows(list, data) {
  const termo = (data.busca || "").toLocaleLowerCase();
  return list.filter((r) => JSON.stringify(r).toLocaleLowerCase().includes(termo));
}
function paginar(list, data) {
  return {
    rows: copy(list.slice((data.pagina || 0) * 25, (data.pagina || 0) * 25 + 25)),
    total: list.length,
    page: data.pagina || 0,
    pageSize: 25,
  };
}
export const listarVinculos = async ({ data }) => {
  await read("listarVinculos", { data });
  if (scenario === "restricted")
    throw new Error("Apenas administradores consultam vínculos de acesso.");
  return paginar(state.membros, data);
};
export const administrarVinculo = async ({ data }) =>
  write("administrarVinculo", data, () => {
    if (scenario === "restricted") throw new Error("Acesso negado.");
    const d = data.dados;
    let m = state.membros.find((r) => r.user_id === d.user_id);
    if (data.comando === "vincular") {
      if (!m) {
        m = {
          id: crypto.randomUUID(),
          user_id: d.user_id,
          nome: d.nome,
          email: null,
          roles: [],
          coordenacao: false,
        };
        state.membros.push(m);
      }
    } else if (!m) throw new Error("Membro indisponível.");
    const isAdmin = m.roles.some((r) => r.role === "admin");
    const outrosAdmins = state.membros.some(
      (r) => r !== m && r.roles.some((p) => p.role === "admin"),
    );
    if (
      isAdmin &&
      !outrosAdmins &&
      (data.comando === "desligar" ||
        (data.comando === "papel" && d.role === "admin" && !d.habilitar))
    )
      throw new Error("A organização precisa manter ao menos um administrador ativo.");
    if (data.comando === "vincular" || data.comando === "papel") {
      if (d.habilitar !== false && !m.roles.some((r) => r.role === d.role))
        m.roles.push({ id: crypto.randomUUID(), user_id: m.user_id, role: d.role });
      else if (d.habilitar === false) m.roles = m.roles.filter((r) => r.role !== d.role);
    } else if (data.comando === "coordenacao") m.coordenacao = d.habilitar;
    else if (data.comando === "desligar") {
      if ((d.motivo || "").trim().length < 5) throw new Error("Informe o motivo do desligamento.");
      state.membros = state.membros.filter((r) => r !== m);
    }
    return { user_id: d.user_id, comando: data.comando };
  });
export const listarPessoas = async ({ data }) => {
  await read("listarPessoas", { data });
  return paginar(
    rows(
      state.pessoas.filter((p) => p.ativa !== data.arquivados),
      data,
    ),
    data,
  );
};
export const salvarPessoa = async ({ data }) =>
  write("salvarPessoa", data, () => {
    const atual = state.pessoas.find((p) => p.id === data.id);
    if (atual && atual.version !== data.expected_version)
      throw new Error("Conflito de versão (fixture).");
    if (atual) Object.assign(atual, data.dados, { version: atual.version + 1 });
    else
      state.pessoas.push({
        ...data.dados,
        id: crypto.randomUUID(),
        organization_id: org,
        version: 1,
      });
    return atual || state.pessoas.at(-1);
  });
export const listarAcoes = async ({ data }) => {
  await read("listarAcoes", { data });
  return paginar(
    rows(
      state.acoes.filter((a) => ["concluida", "cancelada"].includes(a.estado) === data.arquivados),
      data,
    ),
    data,
  );
};
export const salvarAcao = async ({ data }) =>
  write("salvarAcao", data, () => {
    const atual = state.acoes.find((p) => p.id === data.id);
    if (atual) Object.assign(atual, data.dados, { version: atual.version + 1 });
    else
      state.acoes.push({
        ...data.dados,
        id: crypto.randomUUID(),
        organization_id: org,
        version: 1,
        estado: "aberta",
        conclusao: null,
        motivo: null,
      });
    return atual || state.acoes.at(-1);
  });
export const transicionarAcao = async ({ data }) =>
  write("transicionarAcao", data, () => {
    const atual = state.acoes.find((p) => p.id === data.id);
    if (!atual) throw new Error("Ação indisponível.");
    if (data.expected_version !== atual.version)
      throw new Error("Outra pessoa alterou este registro. Recarregue e compare antes de salvar.");
    Object.assign(atual, { estado: data.estado, motivo: data.motivo, version: atual.version + 1 });
    return atual;
  });
export const listarAnexos = async ({ data }) => {
  await read("listarAnexos", { data });
  if (window.__anexosReadError)
    throw new Error("Não foi possível atualizar os arquivos privados (fixture).");
  const adicionar =
    window.__anexoCanAdd ?? window.__operationalFilesAdd ?? scenario !== "restricted";
  return copy({
    registros: state.anexos
      .filter(
        (a) =>
          a.estado !== "cancelado" &&
          ["pessoa_id", "acao_id", "qualificacao_id", "ferramenta_id", "calibracao_id"].some(
            (k) => data[k] && a[k] === data[k],
          ),
      )
      .map((a) => ({
        ...a,
        ferramenta_id: a.ferramenta_id ?? null,
        calibracao_id: a.calibracao_id ?? null,
        pode_retomar: adicionar && a.estado === "pendente",
        pode_cancelar: adicionar && a.estado === "pendente",
      })),
    permissoes: { adicionar },
  });
};
export const prepararUpload = async ({ data }) =>
  write("prepararUpload", data, () => {
    const anexo = {
      id: crypto.randomUUID(),
      organization_id: org,
      pessoa_id: null,
      acao_id: null,
      qualificacao_id: null,
      ferramenta_id: null,
      calibracao_id: null,
      ...data.pai,
      nome: data.nome,
      mime: data.mime,
      tamanho: data.tamanho,
      sha256: data.sha256,
      caminho: "fixture-private-file",
      estado: "pendente",
    };
    state.anexos.push(anexo);
    return { anexo, token: null };
  });
export const confirmarUpload = async ({ data }) => {
  if (window.__anexoConfirmFailure)
    throw new Error("Falha de confirmação de armazenamento na fixture.");
  const a = state.anexos.find((a) => a.id === data.id);
  if (!a) throw new Error("Arquivo não encontrado na fixture.");
  a.estado = "vinculado";
  return copy(a);
};
export const cancelarAnexo = async ({ data }) =>
  write("cancelarAnexo", data, () => {
    const a = state.anexos.find((a) => a.id === data.id);
    if (!a || a.estado !== "pendente") throw new Error("Envio pendente indisponível na fixture.");
    a.estado = "cancelado";
    return copy(a);
  });
export const baixarAnexo = async ({ data }) => {
  await read("baixarAnexo", { data });
  return { url: "data:text/plain,Arquivo%20do%20ambiente%20isolado%20de%20teste" };
};

export const listarCadastrosCliente = async ({ data }) => {
  await read("listarCadastrosCliente", { data });
  let list = state[data.grupo] || [];
  if (data.grupo !== "clientes") list = list.filter((r) => r.cliente_id === data.cliente_id);
  if (data.situacao !== "todos" && data.grupo !== "historico")
    list = list.filter(
      (r) => (!!r.arquivado_em || r.situacao === "Arquivado") === (data.situacao === "arquivados"),
    );
  return paginar(rows(list, data), data);
};
export const obterCliente = async ({ data }) => {
  await read("obterCliente", { data });
  return copy(state.clientes.find((r) => r.id === data.id));
};
export const obterCadastro = async ({ data }) => {
  await read("obterCadastro", { data });
  return copy(state[data.entidade].find((r) => r.id === data.id));
};
function salvarCadastro(grupo, data) {
  return write(`salvar${grupo}`, data, () => {
    const atual = state[grupo].find((r) => r.id === data.id);
    if (atual && atual.version !== data.expected_version)
      throw new Error("Outra pessoa alterou este registro. Seu preenchimento foi preservado.");
    const novo = atual || {
      ...base,
      id: crypto.randomUUID(),
      cliente_id: data.cliente_id,
      situacao: "Ativo",
      unidade_nome: null,
    };
    Object.assign(novo, data.dados, { version: atual ? atual.version + 1 : 1, updated_at: now });
    if (!atual) state[grupo].push(novo);
    state.historico.unshift({
      id: state.historico.length + 1,
      cliente_id: grupo === "clientes" ? novo.id : data.cliente_id,
      unidade_id: grupo === "unidades" ? novo.id : null,
      contato_id: grupo === "contatos" ? novo.id : null,
      operacao: atual ? "alterado" : "criado",
      versao: novo.version,
      motivo: null,
      created_at: now,
    });
    return novo;
  });
}
export const salvarCliente = async ({ data }) => salvarCadastro("clientes", data);
export const salvarUnidade = async ({ data }) => salvarCadastro("unidades", data);
export const salvarContato = async ({ data }) => salvarCadastro("contatos", data);
export const arquivarCadastro = async ({ data }) =>
  write("arquivarCadastro", data, () => {
    const row = state[data.entidade].find((r) => r.id === data.id);
    if (!row) throw new Error("Cadastro indisponível.");
    row.arquivado_em = data.arquivar ? now : null;
    row.motivo_arquivo = data.motivo;
    row.version++;
    if (data.entidade === "clientes") row.situacao = data.arquivar ? "Arquivado" : "Ativo";
    return row;
  });

export const listarProjetosEngenharia = async ({ data }) => {
  await read("listarProjetosEngenharia", { data });
  const list = rows(
    state.projetos.filter((p) => p.arquivado === data.arquivados),
    data,
  );
  return {
    registros: copy(list.slice(data.pagina * 25, data.pagina * 25 + 25)),
    total: list.length,
  };
};
export const buscarOpcoesPe = async ({ data }) => {
  await read("buscarOpcoesPe", { data });
  let list = state[data.tipo] || [];
  if (data.tipo === "unidades") list = list.filter((u) => u.cliente_id === data.cliente_id);
  return copy(
    rows(list, data)
      .slice(0, 25)
      .map((r) => ({ id: r.id, nome: r.nome || r.razao_social })),
  );
};
export const obterProjetoEngenharia = async ({ data }) => {
  await read("obterProjetoEngenharia", { data });
  const p = state.projetos.find((p) => p.id === data.projeto_id);
  if (!p) throw new Error("Projeto indisponível.");
  return copy({
    projeto: p,
    versoes: state.versoes.filter((v) => v.projeto_id === p.id).sort((a, b) => b.numero - a.numero),
    cenarios: state.cenarios.filter((c) => c.projeto_id === p.id),
    eventos: state.eventos.filter((e) => e.projeto_id === p.id).reverse(),
    arquivos: [],
  });
};
export const obterConteudoPe = async ({ data }) => {
  await read("obterConteudoPe", { data });
  const v =
    state.versoes.find((v) => v.projeto_id === data.projeto_id && v.id === data.versao_id) || null;
  const c =
    state.cenarios.find((c) => c.projeto_id === data.projeto_id && c.id === data.cenario_id) ||
    null;
  if (!v && !c) throw new Error("Conteúdo indisponível.");
  return copy({
    versao: v,
    cenario: c,
    base: state.versoes.find((b) => b.id === (c?.base_id || v?.parent_id)) || null,
  });
};
export const executarProjetoEngenharia = async ({ data }) =>
  write("executarProjetoEngenharia", data, () => {
    let p = state.projetos.find((p) => p.id === data.projeto_id);
    let v = state.versoes.find((v) => v.id === data.versao_id);
    let c = state.cenarios.find((c) => c.id === data.cenario_id);
    if (data.comando === "criar") {
      p = {
        ...copy(projetoBase),
        ...data,
        id: crypto.randomUUID(),
        vigente_id: null,
        version: 1,
        clientes: {
          razao_social:
            state.clientes.find((r) => r.id === data.cliente_id)?.razao_social ||
            "Cliente de teste",
        },
        unidades: { nome: state.unidades.find((r) => r.id === data.unidade_id)?.nome || "" },
        pessoas: {
          nome:
            state.pessoas.find((r) => r.id === data.responsavel_id)?.nome || "Responsável de teste",
        },
      };
      v = {
        ...copy(segunda),
        id: crypto.randomUUID(),
        projeto_id: p.id,
        numero: 1,
        parent_id: null,
        modelo: copy(data.modelo),
        resumo: data.resumo,
        elaborado_em: data.elaborado_em,
        autor_declarado: data.autor_declarado || "",
        version: 1,
      };
      state.projetos.push(p);
      state.versoes.push(v);
    } else if (!p) throw new Error("Projeto indisponível.");
    else if (data.comando === "salvar") {
      if (v.version !== data.expected_version)
        throw new Error("Registro alterado por outra pessoa. Recarregue antes de salvar.");
      Object.assign(v, {
        modelo: copy(data.modelo),
        resumo: data.resumo,
        elaborado_em: data.elaborado_em,
        autor_declarado: data.autor_declarado,
        revisao_declarada: data.revisao_declarada,
        version: v.version + 1,
      });
    } else if (data.comando === "submeter") {
      v.estado = "em_revisao";
      v.version++;
    } else if (data.comando === "devolver") {
      v.estado = "rascunho";
      v.version++;
    } else if (data.comando === "congelar") {
      v.estado = "congelada";
      v.version++;
      v.snapshot = { ...copy(primeira.snapshot), modelo: copy(v.modelo) };
      v.snapshot_sha256 = "b".repeat(64);
    } else if (data.comando === "nova_versao") {
      const origem = v;
      v = {
        ...copy(origem),
        id: crypto.randomUUID(),
        parent_id: origem.id,
        numero:
          Math.max(...state.versoes.filter((x) => x.projeto_id === p.id).map((x) => x.numero)) + 1,
        estado: "rascunho",
        resumo: data.resumo,
        version: 1,
        snapshot: null,
        snapshot_sha256: null,
      };
      state.versoes.push(v);
    } else if (data.comando === "vigente") p.vigente_id = v.id;
    else if (data.comando === "arquivar" || data.comando === "reativar")
      p.arquivado = data.comando === "arquivar";
    else if (data.comando === "criar_cenario") {
      c = {
        id: crypto.randomUUID(),
        projeto_id: p.id,
        base_id: v.id,
        titulo: data.titulo,
        modelo: copy(v.modelo),
        promovida_id: null,
        descartado: false,
        version: 1,
      };
      state.cenarios.push(c);
    } else if (data.comando === "salvar_cenario") {
      c.modelo = copy(data.modelo);
      c.version++;
    } else if (data.comando === "descartar_cenario") {
      c.descartado = true;
      c.version++;
    } else if (data.comando === "promover_cenario") {
      const origem = state.versoes.find((x) => x.id === c.base_id);
      v = {
        ...copy(origem),
        id: crypto.randomUUID(),
        parent_id: origem.id,
        numero:
          Math.max(...state.versoes.filter((x) => x.projeto_id === p.id).map((x) => x.numero)) + 1,
        estado: "rascunho",
        resumo: data.resumo,
        modelo: copy(c.modelo),
        version: 1,
        snapshot: null,
        snapshot_sha256: null,
      };
      state.versoes.push(v);
      c.promovida_id = v.id;
      c.version++;
    }
    p.version++;
    state.eventos.push({
      id: state.eventos.length + 1,
      projeto_id: p.id,
      comando: data.comando,
      motivo: data.motivo || data.resumo || null,
      autor: actor,
      created_at: now,
    });
    return { projeto: p, versao: v || null, cenario: c || null };
  });
