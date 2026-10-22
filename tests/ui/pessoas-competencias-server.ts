// Presentation-only mutable boundary. No real Auth, SQL, Storage or operational writes.
import { scenario } from "./data";
import "./operacional-server";
import { QUALIFICACAO_ACESSO_INDISPONIVEL } from "@/features/pessoas-competencias/qualificacoes/domain";
const org = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001";
const personId = "30000000-0000-4000-8000-000000000001";
const teamId = "a1000000-0000-4000-8000-000000000001",
  competenceId = "a2000000-0000-4000-8000-000000000001",
  qualificationId = "a3000000-0000-4000-8000-000000000001";
const audit = {
  organization_id: org,
  created_by: actor,
  created_at: "2026-10-22T12:00:00Z",
  updated_at: "2026-10-22T12:00:00Z",
  version: 1,
};
const copy = (value) => structuredClone(value),
  manage = () => scenario !== "restricted";
const state = {
  equipes:
    scenario === "empty"
      ? []
      : [
          {
            ...audit,
            id: teamId,
            nome: "Equipe técnica de instalação e inspeção da unidade norte",
            lider_id: personId,
            ativa: true,
          },
        ],
  membros:
    scenario === "empty"
      ? []
      : [
          {
            ...audit,
            id: "a4000000-0000-4000-8000-000000000001",
            equipe_id: teamId,
            pessoa_id: personId,
            inicio: "2026-10-01",
            fim: null,
          },
        ],
  competencias:
    scenario === "empty"
      ? []
      : [
          {
            ...audit,
            id: competenceId,
            nome: "Procedimento interno de inspeção de acessos",
            descricao: "Exigências de conferência configuradas para a operação de teste.",
            exige_evidencia: true,
            exige_validade: true,
            ativa: true,
          },
        ],
  qualificacoes:
    scenario === "empty"
      ? []
      : [
          {
            ...audit,
            id: qualificationId,
            pessoa_id: personId,
            competencia_id: competenceId,
            emissor: "Entidade emissora do ambiente de validação",
            conclusao: "2026-10-01",
            validade: "2027-10-01",
            estado: "enviada",
            conferido_por: null,
            conferido_em: null,
            motivo: null,
          },
        ],
};
window.__nexusPeople = state;
const operations = new Map();
const deferredTeamLists = [];
const people = () => window.__nexusOperational.pessoas;
async function read(name, data, kind) {
  window.__nexusCalls.push({ name, payload: { data } });
  if (scenario === "loading") await new Promise(() => {});
  if (name === "listarEquipes" && window.__equipesDeferList) {
    window.__equipesListHeld = true;
    window.__releaseEquipesList = () => {
      window.__equipesDeferList = false;
      for (const resolve of deferredTeamLists.splice(0)) resolve();
    };
    await new Promise((resolve) => deferredTeamLists.push(resolve));
    window.__equipesListReturned = true;
  }
  if (
    window.__peopleModuleDenied ||
    window.__peopleModuleDeniedKind === kind ||
    window.__peopleModuleDeniedName === name
  )
    throw new Error(
      kind === "equipes"
        ? "Equipe indisponível para seu acesso atual."
        : QUALIFICACAO_ACESSO_INDISPONIVEL,
    );
  if (scenario === "error" || window.__peopleModuleNetwork)
    throw new Error("Falha de rede na consulta; tente novamente (fixture).");
}
function filtered(rows, data, field = "nome") {
  return rows.filter((row) =>
    (row[field] || "").toLocaleLowerCase().includes((data.busca || "").toLocaleLowerCase()),
  );
}
function paged(rows, page = 0) {
  return {
    rows: copy(rows.slice(page * 25, page * 25 + 25)),
    total: rows.length,
    pagina: page,
    limite: 25,
  };
}
async function write(name, data, kind, work) {
  await read(name, data, kind);
  if (window.__failNextWrite) {
    window.__failNextWrite = false;
    throw new Error("Falha de rede simulada; conteúdo local preservado.");
  }
  const payload = JSON.stringify({ ...data, chave: null }),
    prior = operations.get(data.chave);
  if (prior) {
    if (prior.payload !== payload)
      throw new Error("Chave reutilizada com conteúdo diferente (fixture).");
    return prior.id;
  }
  const row = work();
  operations.set(data.chave, { payload, id: row.id });
  return row.id;
}
function checkVersion(row, data) {
  if (!row || row.version !== data.expected_version)
    throw new Error(
      "O registro mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
    );
}
function teamDetail(id, pagina = 0) {
  const equipe = state.equipes.find((row) => row.id === id);
  if (!equipe) throw new Error("Equipe indisponível para seu acesso atual.");
  const raw = state.membros.filter(
    (row) => row.equipe_id === id && (manage() || row.pessoa_id === personId),
  );
  return copy({
    equipe,
    lider:
      people().find((row) => row.id === equipe.lider_id && (manage() || row.id === personId)) ||
      null,
    membros: {
      ...paged(raw, pagina),
      rows: paged(raw, pagina).rows.map((row) => {
        const p = people().find((p) => p.id === row.pessoa_id);
        return {
          ...row,
          pessoa_nome: p?.nome || null,
          pessoa_funcao: p?.funcao || null,
          pessoa_ativa: p?.ativa ?? null,
          pode_encerrar: manage() && row.fim === null,
        };
      }),
    },
    permissoes: { gerir: manage(), editar: manage(), incluir: manage() && equipe.ativa },
  });
}
export const listarEquipes = async ({ data }) => {
  await read("listarEquipes", data, "equipes");
  return {
    ...paged(
      filtered(
        state.equipes.filter((row) => row.ativa !== data.arquivadas),
        data,
      ),
      data.pagina,
    ),
    permissoes: { gerir: manage() },
  };
};
export const obterEquipe = async ({ data }) => {
  await read("obterEquipe", data, "equipes");
  return teamDetail(data.id, data.paginaMembros);
};
export const buscarPessoasEquipe = async ({ data }) => {
  await read("buscarPessoasEquipe", data, "equipes");
  return paged(
    filtered(
      people().filter((row) => row.ativa),
      data,
    ).map((row) => ({ id: row.id, nome: row.nome, contexto: row.funcao || "Pessoa ativa" })),
    data.pagina,
  );
};
export const salvarEquipe = async ({ data }) => {
  const id = await write("salvarEquipe", data, "equipes", () => {
    if (!manage()) throw new Error("Equipe indisponível para seu acesso atual.");
    if (data.id) {
      const row = state.equipes.find((row) => row.id === data.id);
      checkVersion(row, data);
      Object.assign(row, data.dados, { version: row.version + 1 });
      return row;
    }
    const row = { ...audit, ...data.dados, id: crypto.randomUUID(), ativa: true };
    state.equipes.push(row);
    return row;
  });
  return teamDetail(id);
};
export const vincularMembroEquipe = async ({ data }) => {
  await write("vincularMembroEquipe", data, "equipes", () => {
    if (
      state.membros.some(
        (row) =>
          row.equipe_id === data.equipe_id &&
          row.pessoa_id === data.pessoa_id &&
          (!row.fim || data.inicio <= row.fim) &&
          (!data.fim || row.inicio <= data.fim),
      )
    )
      throw new Error(
        "A pessoa já pertence à equipe nesse período. Confira as datas, incluindo o último dia.",
      );
    const row = {
      ...audit,
      id: crypto.randomUUID(),
      equipe_id: data.equipe_id,
      pessoa_id: data.pessoa_id,
      inicio: data.inicio,
      fim: data.fim,
    };
    state.membros.push(row);
    return row;
  });
  return teamDetail(data.equipe_id);
};
export const encerrarMembroEquipe = async ({ data }) => {
  const id = await write("encerrarMembroEquipe", data, "equipes", () => {
    const row = state.membros.find((row) => row.id === data.id);
    if (!row || row.fim) throw new Error("Vínculo encerrado. O período histórico é imutável.");
    Object.assign(row, { fim: data.fim });
    return row;
  });
  return teamDetail(state.membros.find((row) => row.id === id).equipe_id);
};
function competenceDetail(id) {
  const registro = state.competencias.find((row) => row.id === id);
  if (!registro) throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
  return copy({
    registro,
    usada: state.qualificacoes.some((row) => row.competencia_id === id),
    permissoes: { editar: manage() },
  });
}
function qualification(row) {
  return {
    ...row,
    pessoa: people().find((p) => p.id === row.pessoa_id) || null,
    competencia: state.competencias.find((c) => c.id === row.competencia_id) || null,
  };
}
function qualificationDetail(id) {
  const row = state.qualificacoes.find((row) => row.id === id);
  if (!row) throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
  const registro = qualification(row);
  return copy({
    registro,
    permissoes: {
      editar: row.estado === "enviada",
      conferir: manage() && row.estado !== "revogada",
      validar: manage() && registro.pessoa?.user_id !== actor,
    },
  });
}
export const listarCompetencias = async ({ data }) => {
  await read("listarCompetencias", data, "competencias");
  return {
    ...paged(
      filtered(
        state.competencias.filter((row) => row.ativa !== data.arquivadas),
        data,
      ),
      data.pagina,
    ),
    permissoes: { criar: manage() },
  };
};
export const obterCompetencia = async ({ data }) => {
  await read("obterCompetencia", data, "competencias");
  return competenceDetail(data.id);
};
export const listarQualificacoes = async ({ data }) => {
  await read("listarQualificacoes", data, "qualificacoes");
  return {
    ...paged(
      filtered(
        state.qualificacoes.filter(
          (row) =>
            (!data.estado || row.estado === data.estado) &&
            (!data.pessoa_id || row.pessoa_id === data.pessoa_id) &&
            (!data.competencia_id || row.competencia_id === data.competencia_id),
        ),
        data,
        "emissor",
      ).map(qualification),
      data.pagina,
    ),
    permissoes: { criar: true },
  };
};
export const obterQualificacao = async ({ data }) => {
  await read("obterQualificacao", data, "qualificacoes");
  return qualificationDetail(data.id);
};
export const buscarOpcoesQualificacao = async ({ data }) => {
  await read("buscarOpcoesQualificacao", data, "qualificacoes");
  const choices =
    data.tipo === "pessoas"
      ? people().filter((row) => row.ativa && (manage() || row.id === personId))
      : state.competencias.filter((row) => row.ativa);
  return paged(
    filtered(choices, data).map((row) => ({
      id: row.id,
      nome: row.nome,
      contexto: data.tipo === "pessoas" ? "Pessoa operacional ativa" : "Competência ativa",
    })),
    data.pagina,
  );
};
export const salvarCompetencia = async ({ data }) => {
  const id = await write("salvarCompetencia", data, "competencias", () => {
    if (data.id) {
      const row = state.competencias.find((row) => row.id === data.id);
      checkVersion(row, data);
      if (
        state.qualificacoes.some((q) => q.competencia_id === row.id) &&
        (row.exige_evidencia !== data.dados.exige_evidencia ||
          row.exige_validade !== data.dados.exige_validade)
      )
        throw new Error("Política já utilizada. Cadastre nova competência e preserve a anterior.");
      Object.assign(row, data.dados, { version: row.version + 1 });
      return row;
    }
    const row = { ...audit, ...data.dados, id: crypto.randomUUID(), ativa: true };
    state.competencias.push(row);
    return row;
  });
  return competenceDetail(id);
};
export const salvarQualificacao = async ({ data }) => {
  const id = await write("salvarQualificacao", data, "qualificacoes", () => {
    if (data.id) {
      const row = state.qualificacoes.find((row) => row.id === data.id);
      checkVersion(row, data);
      if (row.estado !== "enviada")
        throw new Error("Qualificação em conferência ou concluída é imutável.");
      Object.assign(row, data.dados, { version: row.version + 1 });
      return row;
    }
    const row = {
      ...audit,
      ...data.dados,
      id: crypto.randomUUID(),
      estado: "enviada",
      conferido_por: null,
      conferido_em: null,
      motivo: null,
    };
    state.qualificacoes.push(row);
    return row;
  });
  return qualificationDetail(id);
};
export const transicionarQualificacao = async ({ data }) => {
  const id = await write("transicionarQualificacao", data, "qualificacoes", () => {
    const row = state.qualificacoes.find((row) => row.id === data.id);
    checkVersion(row, data);
    if (data.estado === "validada") {
      const c = state.competencias.find((c) => c.id === row.competencia_id);
      if (
        c.exige_evidencia &&
        !window.__nexusOperational.anexos.some(
          (a) => a.qualificacao_id === row.id && a.estado === "vinculado",
        )
      )
        throw new Error("Anexe evidência conferida antes da validação.");
      if (c.exige_validade && !row.validade) throw new Error("A política exige data de validade.");
    }
    Object.assign(row, {
      estado: data.estado,
      motivo: data.motivo,
      version: row.version + 1,
      conferido_por: ["validada", "revogada"].includes(data.estado) ? actor : row.conferido_por,
    });
    return row;
  });
  return qualificationDetail(id);
};
