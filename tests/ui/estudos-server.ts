// Synthetic transport used only by the isolated UI lab. No Auth/SQL/Storage HTTP proof.
import { scenario } from "./data";
import { ESTUDO_ACESSO_INDISPONIVEL } from "../../src/features/estudos/domain";

const org = "10000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000001";
const cliente = "20000000-0000-4000-8000-000000000001";
const unidade = "21000000-0000-4000-8000-000000000001";
const pessoa = "30000000-0000-4000-8000-000000000001";
const estudo = "80000000-0000-4000-8000-000000000001";
const revisao = "81000000-0000-4000-8000-000000000001";
const perigo = "82000000-0000-4000-8000-000000000001";
const medida = "83000000-0000-4000-8000-000000000001";
const metodoId = "84000000-0000-4000-8000-000000000001";
const metodoVersao = "85000000-0000-4000-8000-000000000001";
const linhagem = "86000000-0000-4000-8000-000000000001";
const now = "2026-10-22T12:00:00.000Z";
const copy = (value) => structuredClone(value);
const meta = { created_by: actor, created_at: now, updated_at: now };
const root = {
  id: estudo,
  organization_id: org,
  codigo: "EST-TESTE-0001",
  titulo: "Análise técnica do acesso de manutenção — cenário isolado",
  tipo: "memorial",
  cliente_id: cliente,
  unidade_id: unidade,
  projeto_id: null,
  responsavel_id: pessoa,
  visibilidade: "restrito",
  revisao_atual_id: revisao,
  aprovada_id: null,
  version: 1,
  cliente_nome: "Empresa do ambiente isolado de validação",
  unidade_nome: "Unidade de armazenagem e recebimento — acesso norte",
  responsavel_nome: "Responsável técnico do cenário isolado com nome extenso",
  ...meta,
};
const revision = {
  id: revisao,
  organization_id: org,
  estudo_id: estudo,
  numero: 1,
  base_id: null,
  metodo_versao_id: metodoVersao,
  estado:
    scenario === "approved" ? "aprovado" : scenario === "review" ? "em_revisao" : "elaboracao",
  escopo: "Conferência técnica de acesso e documentos do cenário de teste.",
  premissas: "Dados e nomes exclusivos do laboratório isolado.",
  analise: "Análise de teste sem critério normativo, fórmula ou declaração de conformidade.",
  conclusao: "Conclusão profissional apresentada somente como conteúdo de fixture UI.",
  responsavel_tecnico_id: pessoa,
  responsavel_tecnico_nome: root.responsavel_nome,
  revisor_id: pessoa,
  revisor_nome: root.responsavel_nome,
  responsabilidade_tecnica: "Responsabilidade declarada exclusivamente no cenário de teste.",
  art_referencia: "",
  version: 1,
  submissao_atual_id: null,
  snapshot: null,
  snapshot_sha256: null,
  aprovado_por: null,
  aprovado_em: null,
  ...meta,
};
const hazard = {
  id: perigo,
  organization_id: org,
  estudo_id: estudo,
  revisao_id: revisao,
  base_id: null,
  codigo: "P01",
  descricao: "Condição observada no acesso de manutenção — somente fixture",
  local: "Passarela de teste",
  exposicao: "Atividade de conferência do cenário isolado",
  avaliacao: "Descrição técnica de teste, sem cálculo automático de risco.",
  critico: false,
  version: 1,
  ...meta,
};
const measure = {
  id: medida,
  organization_id: org,
  estudo_id: estudo,
  revisao_id: revisao,
  perigo_id: perigo,
  linhagem_id: linhagem,
  base_id: null,
  descricao: "Conferir a condição descrita e registrar a medida aplicada.",
  fundamento: "Procedimento de teste autorizado no laboratório.",
  prioridade: "normal",
  responsavel_id: pessoa,
  responsavel_nome: root.responsavel_nome,
  prazo: "2026-10-30",
  exige_acao: true,
  version: 1,
  acao_id: null,
  ...meta,
};
const method = {
  id: metodoVersao,
  organization_id: org,
  metodo_id: metodoId,
  numero: 1,
  nome: "Procedimento documental do laboratório",
  tipo: "memorial",
  instrucoes:
    "Registrar fontes, premissas, análise e decisão no ambiente de teste. Não representa método normativo real.",
  fontes: [
    {
      titulo: "Procedimento sintético exclusivo da fixture",
      edicao: "V1",
      emissor: "Laboratório isolado",
      url: "https://example.invalid/procedimento",
      consultado_em: "2026-10-22",
    },
  ],
  requisitos: {
    exige_levantamento: false,
    exige_perigos: false,
    exige_medidas: false,
    exige_art: false,
    revisao_independente: false,
  },
  responsavel_id: pessoa,
  registro_profissional: "REGISTRO-TESTE-SEM-VALIDADE",
  ...meta,
};
const source = {
  id: "87000000-0000-4000-8000-000000000001",
  organization_id: org,
  estudo_id: estudo,
  revisao_id: revisao,
  tipo: "levantamento",
  levantamento_id: "70000000-0000-4000-8000-000000000001",
  levantamento_revisao_id: "71000000-0000-4000-8000-000000000001",
  pe_projeto_id: null,
  pe_versao_id: null,
  documento_id: null,
  titulo: "LEV-TESTE-0001 · Coleta aprovada do laboratório",
  numero: 1,
  sha256: "a".repeat(64),
  justificativa: "Fonte técnica conferida no cenário de teste.",
  ativa: true,
  desativada_motivo: null,
  ...meta,
};
const file = {
  id: "88000000-0000-4000-8000-000000000001",
  organization_id: org,
  estudo_id: estudo,
  revisao_id: revisao,
  perigo_id: perigo,
  nome: "evidencia-perigo-teste.jpg",
  mime: "image/jpeg",
  tamanho: 51200,
  sha256: "b".repeat(64),
  caminho: "fixture-estudos/original",
  estado: "vinculado",
  created_by: actor,
  created_at: now,
  confirmado_em: now,
};
let state = {
  estudos: scenario === "empty" ? [] : [copy(root)],
  revisoes: scenario === "empty" ? [] : [copy(revision)],
  perigos: scenario === "empty" ? [] : [copy(hazard)],
  medidas: scenario === "empty" ? [] : [copy(measure)],
  fontes: scenario === "empty" ? [] : [copy(source)],
  arquivos: scenario === "empty" ? [] : [copy(file)],
  submissoes: [],
  decisoes: [],
  historico: [],
  metodos: [copy(method)],
  acoes: [],
};
const receipts = new Map();
function snapshot(draft, r) {
  return {
    estudo: copy(draft.estudos.find((e) => e.id === r.estudo_id)),
    revisao: copy({ ...r, snapshot: null }),
    perigos: copy(draft.perigos.filter((p) => p.revisao_id === r.id)),
    medidas: copy(draft.medidas.filter((m) => m.revisao_id === r.id)),
    fontes: copy(draft.fontes.filter((f) => f.revisao_id === r.id)),
    metodo: copy(draft.metodos.find((m) => m.id === r.metodo_versao_id) || null),
    arquivos: copy(draft.arquivos.filter((a) => a.revisao_id === r.id && a.estado === "vinculado")),
  };
}
if (["review", "approved"].includes(scenario)) {
  const submission = {
    id: crypto.randomUUID(),
    organization_id: org,
    estudo_id: estudo,
    revisao_id: revisao,
    numero: 1,
    snapshot: snapshot(state, state.revisoes[0]),
    sha256: "c".repeat(64),
    autor: actor,
    pessoa_id: pessoa,
    registro_profissional: method.registro_profissional,
    created_at: now,
  };
  state.submissoes.push(submission);
  state.revisoes[0].submissao_atual_id = submission.id;
  if (scenario === "approved") {
    state.revisoes[0].snapshot = copy(submission.snapshot);
    state.revisoes[0].snapshot_sha256 = "d".repeat(64);
    state.revisoes[0].aprovado_por = actor;
    state.revisoes[0].aprovado_em = now;
    state.estudos[0].aprovada_id = revisao;
  }
}
window.__nexusEstudos = state;
async function read(name, data) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "loading") await new Promise(() => {});
  if (name === "listarArquivosEstudo" && window.__estudoFileQueryError)
    throw new Error("Evidências indisponíveis após mudança de acesso na fixture.");
  if (scenario === "error" || window.__estudoQueryError)
    throw new Error("Consulta indisponível no cenário isolado. Tente novamente.");
  if (scenario === "restricted" || window.__estudoSourceUnavailable)
    throw new Error(ESTUDO_ACESSO_INDISPONIVEL);
}
function write(name, data, command) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "write-error" || window.__estudoFailWrite) {
    window.__estudoFailWrite = false;
    throw new Error("Falha de rede simulada. O servidor não confirmou; preenchimento preservado.");
  }
  if (scenario === "write-conflict" || window.__estudoConflict)
    throw new Error("Outra pessoa alterou este estudo. Recarregue e compare antes de salvar.");
  if (window.__estudoSourceUnavailable) throw new Error(ESTUDO_ACESSO_INDISPONIVEL);
  const hash = JSON.stringify({ ...data, chave: null });
  const previous = receipts.get(data.chave);
  if (previous) {
    if (previous.hash !== hash)
      throw new Error("Chave reutilizada com conteúdo diferente na fixture.");
    return copy(previous.result);
  }
  const draft = copy(state);
  const result = command(draft);
  state = draft;
  window.__nexusEstudos = state;
  receipts.set(data.chave, { hash, result: copy(result) });
  return copy(result);
}
function blocks(draft, r) {
  const pending = [];
  if (!r.metodo_versao_id) pending.push("Selecione um método profissionalmente validado.");
  if ([r.escopo, r.premissas, r.analise, r.conclusao].some((text) => text.trim().length < 3))
    pending.push("Complete escopo, premissas, análise e conclusão.");
  if (!r.revisor_id) pending.push("Atribua um revisor ativo com registro profissional.");
  if (
    draft.arquivos.some((a) => a.revisao_id === r.id && ["pendente", "enviado"].includes(a.estado))
  )
    pending.push("Confirme ou cancele os envios pendentes antes de submeter.");
  return pending;
}
function detail(data, draft = state) {
  const e = draft.estudos.find((e) => e.id === data.estudo_id);
  if (!e) throw new Error("Estudo indisponível na fixture.");
  const r = draft.revisoes.find(
    (r) => r.estudo_id === e.id && r.id === (data.revisao_id || e.revisao_atual_id),
  );
  if (!r) throw new Error("Revisão indisponível.");
  const current = r.id === e.revisao_atual_id,
    prof = scenario !== "unqualified",
    approved = r.estado === "aprovado",
    effective = e.aprovada_id === r.id;
  return copy({
    estudo:
      approved && r.snapshot
        ? {
            ...r.snapshot.estudo,
            revisao_atual_id: e.revisao_atual_id,
            aprovada_id: e.aprovada_id,
            version: e.version,
          }
        : e,
    revisao: r,
    revisoes: draft.revisoes
      .filter((v) => v.estudo_id === e.id)
      .map(
        ({
          id,
          numero,
          estado,
          version,
          snapshot_sha256,
          aprovado_em,
          created_at,
          substituida_por,
        }) => ({
          id,
          numero,
          estado,
          version,
          snapshot_sha256,
          aprovado_em,
          created_at,
          substituida_por,
        }),
      )
      .sort((a, b) => b.numero - a.numero),
    perigos: draft.perigos.filter((p) => p.revisao_id === r.id),
    medidas: draft.medidas.filter((m) => m.revisao_id === r.id),
    fontes: draft.fontes.filter((f) => f.revisao_id === r.id),
    arquivos: draft.arquivos.filter((a) => a.revisao_id === r.id),
    submissoes: draft.submissoes.filter((s) => s.revisao_id === r.id),
    decisoes: draft.decisoes.filter((s) => s.revisao_id === r.id),
    historico: draft.historico.filter((h) => h.estudo_id === e.id),
    acoes: draft.acoes,
    metodo: draft.metodos.find((m) => m.id === r.metodo_versao_id) || null,
    permissoes: {
      criar: true,
      ler: true,
      gerir: true,
      editar: current && r.estado === "elaboracao",
      revisar: current && r.estado === "em_revisao" && prof,
      aprovar: current && r.estado === "em_revisao" && prof,
      submeter: current && r.estado === "elaboracao" && prof,
      nova_revisao: current && ["aprovado", "cancelado"].includes(r.estado),
      vincular_acao: approved && effective && prof,
      publicar_metodo: prof,
    },
    bloqueios: blocks(draft, r),
    entrega_documental: {
      estado: approved || r.estado === "substituido" ? "aguardando_emissao" : "nao_aprovado",
      motivo:
        "A emissão documental consome revisão técnica aprovada; este registro não representa um PDF emitido.",
    },
  });
}
export const listarEstudos = async ({ data }) => {
  await read("listarEstudos", data);
  let rows = state.estudos.map((e) => ({
    ...e,
    estado: state.revisoes.find((r) => r.id === e.revisao_atual_id).estado,
    numero_revisao: state.revisoes.find((r) => r.id === e.revisao_atual_id).numero,
  }));
  if (data.busca)
    rows = rows.filter((r) =>
      `${r.titulo} ${r.codigo} ${r.cliente_nome}`.toLowerCase().includes(data.busca.toLowerCase()),
    );
  if (data.estado) rows = rows.filter((r) => r.estado === data.estado);
  const page = data.pagina || 0,
    pageSize = data.limite || 25;
  return copy({
    rows: rows.slice(page * pageSize, (page + 1) * pageSize),
    total: rows.length,
    page,
    pageSize,
    permissoes: { criar: true, publicar_metodo: scenario !== "unqualified" },
  });
};
export const obterEstudo = async ({ data }) => {
  await read("obterEstudo", data);
  if (window.__estudoAdvanceRevision) {
    const r = state.revisoes.find(
      (r) =>
        r.id ===
        (data.revisao_id || state.estudos.find((e) => e.id === data.estudo_id)?.revisao_atual_id),
    );
    if (r) r.version++;
    window.__estudoAdvanceRevision = false;
  }
  return detail(data);
};
function assertVersion(row, expected) {
  if (!row || row.version !== expected)
    throw new Error("Outra pessoa alterou este registro. Recarregue e compare antes de salvar.");
}
export const executarEstudo = async ({ data }) =>
  write("executarEstudo", data, (draft) => {
    if (data.comando === "criar") {
      const eid = crypto.randomUUID(),
        rid = crypto.randomUUID();
      draft.estudos.push({
        ...copy(root),
        id: eid,
        titulo: data.titulo,
        tipo: data.tipo,
        cliente_id: data.cliente_id,
        unidade_id: data.unidade_id,
        responsavel_id: data.responsavel_id,
        projeto_id: data.projeto_id || null,
        visibilidade: data.visibilidade || "restrito",
        revisao_atual_id: rid,
        aprovada_id: null,
      });
      draft.revisoes.push({
        ...copy(revision),
        id: rid,
        estudo_id: eid,
        estado: "elaboracao",
        escopo: data.escopo || "",
        premissas: "",
        analise: "",
        conclusao: "",
        responsabilidade_tecnica: "",
        metodo_versao_id: data.metodo_versao_id || null,
        revisor_id: null,
        snapshot: null,
        snapshot_sha256: null,
        version: 1,
      });
      return detail({ estudo_id: eid, revisao_id: rid }, draft);
    }
    const e = draft.estudos.find((e) => e.id === data.estudo_id),
      r = draft.revisoes.find((r) => r.id === data.revisao_id);
    if (!e || !r || e.revisao_atual_id !== r.id) throw new Error("Selecione a revisão atual.");
    const command = data.comando;
    let selected = r;
    if (command === "contexto") {
      assertVersion(e, data.expected_version);
      for (const key of ["titulo", "responsavel_id", "visibilidade", "projeto_id"])
        if (data[key] !== undefined) e[key] = data[key];
    } else if (command === "salvar_revisao") {
      assertVersion(r, data.expected_version);
      for (const key of [
        "metodo_versao_id",
        "escopo",
        "premissas",
        "analise",
        "conclusao",
        "responsavel_tecnico_id",
        "revisor_id",
        "responsabilidade_tecnica",
        "art_referencia",
      ])
        if (data[key] !== undefined) r[key] = data[key];
    } else if (command === "salvar_perigo") {
      let p = draft.perigos.find((p) => p.id === data.perigo_id);
      if (p) assertVersion(p, data.expected_version);
      else {
        p = {
          ...copy(hazard),
          id: crypto.randomUUID(),
          estudo_id: e.id,
          revisao_id: r.id,
          codigo: data.codigo,
          version: 0,
        };
        draft.perigos.push(p);
      }
      for (const key of ["codigo", "descricao", "local", "exposicao", "avaliacao", "critico"])
        if (data[key] !== undefined) p[key] = data[key];
      p.version++;
      for (const m of data.medidas || []) saveMeasure(draft, r, p.id, m);
    } else if (command === "salvar_medida") saveMeasure(draft, r, data.perigo_id, data);
    else if (command === "excluir_medida") {
      const m = draft.medidas.find((m) => m.id === data.medida_id);
      assertVersion(m, data.expected_version);
      draft.medidas = draft.medidas.filter((m) => m.id !== data.medida_id);
    } else if (command === "excluir_perigo") {
      assertVersion(r, data.expected_revision_version);
      assertVersion(
        draft.perigos.find((p) => p.id === data.perigo_id),
        data.expected_version,
      );
      draft.perigos = draft.perigos.filter((p) => p.id !== data.perigo_id);
      draft.medidas = draft.medidas.filter((m) => m.perigo_id !== data.perigo_id);
    } else if (command === "vincular_fonte") {
      assertVersion(r, data.expected_version);
      draft.fontes.push({
        ...copy(source),
        id: crypto.randomUUID(),
        estudo_id: e.id,
        revisao_id: r.id,
        tipo: data.tipo_fonte,
        levantamento_revisao_id: data.levantamento_revisao_id || null,
        pe_versao_id: data.pe_versao_id || null,
        documento_id: data.documento_id || null,
        titulo: `Fonte ${data.tipo_fonte} do laboratório`,
        justificativa: data.justificativa,
      });
    } else if (command === "desativar_fonte") {
      assertVersion(r, data.expected_version);
      const f = draft.fontes.find((f) => f.id === data.fonte_id);
      if (!f) throw new Error("Fonte indisponível.");
      f.ativa = false;
      f.desativada_motivo = data.motivo;
    } else {
      assertVersion(r, data.expected_version);
      if (command === "submeter") {
        const pending = blocks(draft, r);
        if (pending.length) throw new Error(pending[0]);
        const s = {
          id: crypto.randomUUID(),
          organization_id: org,
          estudo_id: e.id,
          revisao_id: r.id,
          numero: draft.submissoes.filter((s) => s.revisao_id === r.id).length + 1,
          snapshot: snapshot(draft, r),
          sha256: "c".repeat(64),
          autor: actor,
          pessoa_id: pessoa,
          registro_profissional: method.registro_profissional,
          created_at: now,
        };
        draft.submissoes.push(s);
        r.submissao_atual_id = s.id;
        r.estado = "em_revisao";
      } else if (["devolver", "aprovar", "cancelar"].includes(command)) {
        draft.decisoes.push({
          id: draft.decisoes.length + 1,
          organization_id: org,
          estudo_id: e.id,
          revisao_id: r.id,
          submissao_id: r.submissao_atual_id,
          decisao: command,
          motivo: data.motivo,
          pessoa_id: pessoa,
          registro_profissional: method.registro_profissional,
          responsabilidade_tecnica: r.responsabilidade_tecnica,
          autor: actor,
          created_at: now,
        });
        r.estado =
          command === "devolver" ? "elaboracao" : command === "cancelar" ? "cancelado" : "aprovado";
        if (command === "aprovar") {
          const previous = draft.revisoes.find((v) => v.id === e.aprovada_id);
          if (previous) {
            previous.estado = "substituido";
            previous.substituida_por = r.id;
          }
          r.snapshot = snapshot(draft, r);
          r.snapshot_sha256 = "d".repeat(64);
          r.aprovado_por = actor;
          r.aprovado_em = now;
          e.aprovada_id = r.id;
        }
      } else if (command === "nova_revisao") {
        const rid = crypto.randomUUID();
        const next = {
          ...copy(r),
          id: rid,
          numero: r.numero + 1,
          base_id: r.id,
          estado: "elaboracao",
          snapshot: null,
          snapshot_sha256: null,
          aprovado_por: null,
          aprovado_em: null,
          submissao_atual_id: null,
          version: 0,
        };
        draft.revisoes.push(next);
        for (const p of draft.perigos.filter((p) => p.revisao_id === r.id)) {
          const pid = crypto.randomUUID();
          draft.perigos.push({ ...copy(p), id: pid, base_id: p.id, revisao_id: rid, version: 1 });
          for (const m of draft.medidas.filter((m) => m.perigo_id === p.id))
            draft.medidas.push({
              ...copy(m),
              id: crypto.randomUUID(),
              base_id: m.id,
              revisao_id: rid,
              perigo_id: pid,
              version: 1,
            });
        }
        for (const f of draft.fontes.filter((f) => f.revisao_id === r.id && f.ativa))
          draft.fontes.push({ ...copy(f), id: crypto.randomUUID(), revisao_id: rid });
        e.revisao_atual_id = rid;
        selected = next;
      }
    }
    selected.version++;
    e.version++;
    draft.historico.push({
      id: draft.historico.length + 1,
      organization_id: org,
      estudo_id: e.id,
      revisao_id: selected.id,
      comando: command,
      motivo: data.motivo || null,
      autor: actor,
      created_at: now,
    });
    return detail({ estudo_id: e.id, revisao_id: selected.id }, draft);
  });
function saveMeasure(draft, r, pid, data) {
  let m = draft.medidas.find((m) => m.id === data.medida_id);
  if (m) assertVersion(m, data.expected_version);
  else {
    m = {
      ...copy(measure),
      id: crypto.randomUUID(),
      estudo_id: r.estudo_id,
      revisao_id: r.id,
      perigo_id: pid,
      linhagem_id: crypto.randomUUID(),
      version: 0,
    };
    draft.medidas.push(m);
  }
  for (const key of [
    "descricao",
    "fundamento",
    "prioridade",
    "responsavel_id",
    "prazo",
    "exige_acao",
  ])
    if (data[key] !== undefined) m[key] = data[key];
  m.version++;
}
export const buscarOpcoesEstudo = async ({ data }) => {
  await read("buscarOpcoesEstudo", data);
  let rows;
  if (data.tipo === "clientes")
    rows = [{ id: cliente, nome: root.cliente_nome, contexto: "Cliente de teste" }];
  else if (data.tipo === "unidades")
    rows = [{ id: unidade, nome: root.unidade_nome, contexto: "Unidade de teste" }];
  else if (data.tipo === "pessoas")
    rows = [
      { id: pessoa, nome: root.responsavel_nome, contexto: "Profissional de teste" },
      {
        id: "30000000-0000-4000-8000-000000000002",
        nome: "Revisor independente do laboratório",
        contexto: "Pessoa de teste",
      },
    ];
  else if (data.tipo === "metodos")
    rows = state.metodos.map((m) => ({
      id: m.id,
      nome: `${m.nome} · V${m.numero}`,
      contexto: m.tipo,
      pai_id: m.metodo_id,
      numero: m.numero,
    }));
  else if (data.tipo === "levantamentos")
    rows = [
      {
        id: source.levantamento_revisao_id,
        nome: source.titulo,
        contexto: "Coleta aprovada",
        pai_id: source.levantamento_id,
        numero: 1,
      },
    ];
  else if (data.tipo === "projetos_engenharia")
    rows = [
      {
        id: "51000000-0000-4000-8000-000000000001",
        nome: "Acervo de teste · V1",
        contexto: "Versão congelada autorizada",
      },
    ];
  else if (data.tipo === "documentos")
    rows = [
      {
        id: "89000000-0000-4000-8000-000000000001",
        nome: "Documento de teste · V1",
        contexto: "Artefato emitido da fixture",
      },
    ];
  else if (data.tipo === "acoes")
    rows = [
      {
        id: "40000000-0000-4000-8000-000000000001",
        nome: "Ação existente autorizada do laboratório",
        contexto: "aberta",
      },
    ];
  else rows = [];
  if (data.busca)
    rows = rows.filter((r) =>
      `${r.nome} ${r.contexto}`.toLowerCase().includes(data.busca.toLowerCase()),
    );
  const page = data.pagina || 0;
  return copy({
    rows: rows.slice(page * 25, page * 25 + 25),
    total: rows.length,
    page,
    pageSize: 25,
  });
};
export const listarMetodosEstudo = async ({ data }) => {
  await read("listarMetodosEstudo", data);
  const page = data.pagina || 0,
    pageSize = data.limite || 25;
  return copy({
    rows: state.metodos.slice(page * pageSize, (page + 1) * pageSize),
    total: state.metodos.length,
    page,
    pageSize,
    permissoes: { publicar_metodo: true },
  });
};
export const publicarMetodoEstudo = async ({ data }) =>
  write("publicarMetodoEstudo", data, (draft) => {
    const methodId = data.metodo_id || crypto.randomUUID();
    const row = {
      ...copy(method),
      ...copy(data),
      id: crypto.randomUUID(),
      metodo_id: methodId,
      numero:
        Math.max(0, ...draft.metodos.filter((m) => m.metodo_id === methodId).map((m) => m.numero)) +
        1,
    };
    draft.metodos.push(row);
    return {
      metodo: {
        id: methodId,
        organization_id: org,
        nome: row.nome,
        descricao: data.descricao || "",
        ...meta,
      },
      versao: row,
    };
  });
export const vincularAcaoEstudo = async ({ data }) => {
  const result = write("vincularAcaoEstudo", data, (draft) => {
    const m = draft.medidas.find((m) => m.id === data.medida_id);
    if (!m) throw new Error("Medida indisponível.");
    let a = draft.acoes.find((a) => a.linhagem_id === m.linhagem_id);
    if (!a) {
      const existing = data.acao_id
        ? window.__nexusOperational?.acoes.find((item) => item.id === data.acao_id)
        : null;
      if (data.acao_id && !existing) throw new Error("Ação indisponível na fixture.");
      a = {
        linhagem_id: m.linhagem_id,
        acao_id: data.acao_id || crypto.randomUUID(),
        titulo: existing?.titulo || data.titulo,
        estado: existing?.estado || "aberta",
        version: existing?.version || 1,
      };
      draft.acoes.push(a);
      for (const item of draft.medidas.filter((item) => item.linhagem_id === m.linhagem_id))
        item.acao_id = a.acao_id;
    }
    return {
      acao_id: a.acao_id,
      linhagem_id: m.linhagem_id,
      estudo_id: m.estudo_id,
      revisao_id: m.revisao_id,
    };
  });
  // Both workspaces consume the same test-only action identity. Only the explicitly
  // released instruction crosses this bridge; technical analysis stays in the study.
  const operational = window.__nexusOperational;
  if (operational && !operational.acoes.some((item) => item.id === result.acao_id)) {
    operational.acoes.push({
      id: result.acao_id,
      organization_id: org,
      titulo: data.titulo,
      descricao: data.descricao || "",
      responsavel_id: data.responsavel_id,
      prazo: data.prazo || null,
      prioridade: data.prioridade || "normal",
      exige_verificacao: data.exige_verificacao ?? true,
      estado: "aberta",
      conclusao: null,
      motivo: null,
      version: 1,
    });
  }
  return result;
};

export const listarArquivosEstudo = async ({ data }) => {
  await read("listarArquivosEstudo", data);
  const rows = state.arquivos.filter(
    (a) =>
      a.revisao_id === data.revisao_id &&
      a.perigo_id === data.perigo_id &&
      a.estado !== "cancelado",
  );
  return copy({ rows: rows.map((a) => ({ ...a, meu_envio: true })), total: rows.length });
};
export const prepararArquivoEstudo = async ({ data }) =>
  write("prepararArquivoEstudo", data, (draft) => {
    const previous = draft.arquivos.find(
      (a) =>
        a.revisao_id === data.revisao_id &&
        a.perigo_id === data.perigo_id &&
        a.sha256 === data.sha256 &&
        a.estado !== "cancelado",
    );
    if (previous) return { arquivo: previous, token: null };
    const row = {
      ...copy(file),
      ...data,
      id: crypto.randomUUID(),
      estado: "pendente",
      confirmado_em: null,
    };
    draft.arquivos.push(row);
    touchFile(draft, row);
    return { arquivo: row, token: null };
  });
export const retomarArquivoEstudo = async ({ data }) => {
  await read("retomarArquivoEstudo", data);
  const row = state.arquivos.find((a) => a.id === data.id);
  if (!row || row.estado === "cancelado") throw new Error("Arquivo indisponível.");
  return { arquivo: copy(row), token: null };
};
export const confirmarArquivoEstudo = async ({ data }) =>
  write("confirmarArquivoEstudo", data, (draft) => {
    if (scenario === "upload-error")
      throw new Error("Armazenamento não confirmado na fixture. Retome ou reverifique.");
    const row = draft.arquivos.find((a) => a.id === data.id);
    if (!row || row.estado === "cancelado") throw new Error("Arquivo indisponível.");
    if (row.estado === "vinculado") return row;
    row.estado = "vinculado";
    row.confirmado_em = now;
    touchFile(draft, row);
    return row;
  });
export const cancelarArquivoEstudo = async ({ data }) =>
  write("cancelarArquivoEstudo", data, (draft) => {
    const row = draft.arquivos.find((a) => a.id === data.id);
    if (!row || row.estado === "vinculado")
      throw new Error("Somente envio pendente pode ser cancelado.");
    row.estado = "cancelado";
    touchFile(draft, row);
    return row;
  });
export const baixarArquivoEstudo = async ({ data }) => {
  await read("baixarArquivoEstudo", data);
  return { url: "data:text/plain,Evidencia%20de%20fixture%20sem%20binario%20real" };
};
function touchFile(draft, row) {
  const r = draft.revisoes.find((r) => r.id === row.revisao_id);
  const e = draft.estudos.find((e) => e.id === row.estudo_id);
  if (r) r.version++;
  if (e) e.version++;
}
