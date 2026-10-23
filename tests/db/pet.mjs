/** PostgreSQL/RLS integration. Only disposable loopback clusters. Provider validation
 * below is an EXPLICIT test double; it does not prove ICP-Brasil certification. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432" ||
  !["127.0.0.1", undefined].includes(process.env.PGTEST_HOST)
)
  throw Error("Use cluster PostgreSQL descartável de loopback");
const opts = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  onnotice() {},
};
const sql = postgres(opts),
  q = (s, p = []) =>
    sql.unsafe(
      s,
      p.map((v) => (typeof v === "string" && /^[{\[]/.test(v) ? JSON.parse(v) : v)),
    );
let checks = 0;
const org = randomUUID(),
  other = randomUUID();
const admin = randomUUID(),
  vigia = randomUUID(),
  worker = randomUUID(),
  outsider = randomUUID();
const pass = (v, label) => {
  assert.ok(v, label);
  checks++;
  console.log("PET PASS " + label);
};
const denied = async (fn, code, label) => {
  await assert.rejects(fn, (e) => e.code === code, label);
  checks++;
  console.log("PET PASS " + label);
};
const root = async () => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
};
const auth = async (id = admin) => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await q("set role authenticated");
};
const rpc = async (cmd, dados, chave = randomUUID()) =>
  (
    await q("select public.pet_executar($1::uuid,$2::jsonb) r", [
      org,
      JSON.stringify({ chave, comando: cmd, dados }),
    ])
  )[0].r;
const detail = async (id) =>
  (await q("select public.pet_obter($1::uuid,$2::uuid) r", [org, id]))[0].r;
const version = async (id) => (await detail(id)).pet.version;
const concurrentRpc = async (cmd, dados, chave) => {
  const peer = postgres(opts);
  try {
    await peer.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await peer.unsafe("set role authenticated");
    return (
      await peer.unsafe("select public.pet_executar($1,$2::jsonb) r", [
        org,
        { chave, comando: cmd, dados },
      ])
    )[0].r;
  } finally {
    await peer.end();
  }
};

try {
  await root();
  for (const id of [admin, vigia, worker, outsider])
    await q("insert into auth.users(id,email) values($1,$2)", [
      id,
      "pet-" + id.slice(-1) + "@test.invalid",
    ]);
  await q(
    "insert into public.organizations(id,nome) values($1,'PET testes isolados'),($2,'PET outra organização')",
    [org, other],
  );
  for (const id of [admin, vigia, worker, outsider])
    await q("insert into public.memberships(organization_id,user_id) values($1,$2)", [org, id]);
  for (const [id, role] of [
    [admin, "admin"],
    [vigia, "campo"],
    [worker, "campo"],
    [outsider, "comercial"],
  ])
    await q(
      "insert into public.user_roles(organization_id,user_id,role) values($1,$2,$3::public.app_role)",
      [org, id, role],
    );
  await auth();
  const person = async (nome, user_id) =>
    (
      await q("select public.salvar_pessoa($1,$2,$3::jsonb) r", [
        org,
        randomUUID(),
        JSON.stringify({
          nome,
          vinculo: "colaborador",
          user_id,
          registro_profissional: "TESTE-ISOLADO",
        }),
      ])
    )[0].r;
  const supervisor = await person("Supervisor de teste", admin),
    watch = await person("Vigia de teste", vigia),
    entrant = await person("Trabalhador de teste", worker),
    rescue = await person("Resgate de teste");
  const foreignClient = randomUUID(),
    foreignUnit = randomUUID();
  const client = (
    await q("select public.salvar_cliente_operacional($1,$2,$3::jsonb) r", [
      org,
      randomUUID(),
      JSON.stringify({ razao_social: "Cliente PET teste isolado" }),
    ])
  )[0].r;
  const unit = (
    await q("select public.salvar_unidade_operacional($1,$2,$3,$4::jsonb) r", [
      org,
      randomUUID(),
      client.id,
      JSON.stringify({ nome: "Unidade PET teste isolado" }),
    ])
  )[0].r;
  const os = await rpc("criar_os", {
    cliente_id: client.id,
    unidade_id: unit.id,
    titulo: "OS PET integração",
    escopo: "Escopo independente da permissão",
    responsavel_id: supervisor.id,
  });
  const space = await rpc("salvar_espaco", {
    unidade_id: unit.id,
    identificacao: "EC testes",
    localizacao: "Local de testes controlado",
  });
  const expiration = new Date(Date.now() + 4 * 3600e3).toISOString();
  const create = {
    os_id: os.id,
    espaco_id: space.id,
    atividade: "Inspeção controlada de teste",
    termino_previsto: expiration,
    timezone: "America/Sao_Paulo",
  };
  const key = randomUUID(),
    pet = await rpc("criar_pet", create, key),
    id = pet.id;
  pass(
    pet.detalhe.pet.os_id === os.id &&
      pet.detalhe.pet.unidade_id === unit.id &&
      pet.detalhe.pet.espaco_id === space.id,
    "vínculos OS/unidade/espaço canônicos",
  );
  pass((await rpc("criar_pet", create, key)).id === id, "retry idempotente não duplica PET");
  await denied(
    () => rpc("criar_pet", { ...create, atividade: "Payload divergente" }, key),
    "23505",
    "chave divergente recusada",
  );
  await denied(
    () => rpc("concluir_os", { os_id: os.id, expected_version: 1 }),
    "23514",
    "concluir OS não encerra PET pendente",
  );
  await root();
  await q(
    "insert into public.clientes(id,organization_id,razao_social) values($1,$2,'Cliente estrangeiro')",
    [foreignClient, other],
  );
  await q(
    "insert into public.unidades(id,organization_id,cliente_id,nome) values($1,$2,$3,'Unidade estrangeira')",
    [foreignUnit, other, foreignClient],
  );
  await auth();
  await denied(
    () => rpc("criar_os", { cliente_id: client.id, unidade_id: foreignUnit, titulo: "Inválida" }),
    "23514",
    "unidade entre organizações recusada",
  );
  await auth(outsider);
  await denied(() => detail(id), "42501", "endpoint direto sem permissão recusado");
  await denied(
    () => rpc("criar_os", { cliente_id: client.id, unidade_id: unit.id, titulo: "Sem permissão" }),
    "42501",
    "comercial não cria OS operacional",
  );
  pass(
    (await q("select count(*)::integer n from public.pet_permissoes"))[0].n === 0,
    "RLS não revela PET a papel insuficiente",
  );
  await auth();
  await denied(
    () => rpc("conferir", { pet_id: id, expected_version: 1 }),
    "23514",
    "conferência incompleta bloqueada",
  );
  await denied(
    () => rpc("registrar_entrada", { pet_id: id, expected_version: 1, pessoa_id: entrant.id }),
    "23514",
    "entrada sem liberação bloqueada",
  );
  await denied(
    () => q("update public.pet_permissoes set estado_documental='emitida' where id=$1", [id]),
    "42501",
    "browser não forja emissão por UPDATE",
  );
  const skill = (
    await q("select public.salvar_competencia($1,$2,$3::jsonb) r", [
      org,
      randomUUID(),
      JSON.stringify({
        nome: "Qualificação PET TESTE",
        exige_evidencia: false,
        exige_validade: true,
      }),
    ])
  )[0].r;
  const procedure = {
    itens: [
      {
        id: "isolamento",
        rotulo: "Isolamento",
        obrigatorio: true,
        permite_na: true,
        justificativa_na: true,
        evidencia_obrigatoria: true,
      },
    ],
    agentes: [{ agente: "O2", unidade: "%vol", minimo: 19, maximo: 23 }],
    qualificacoes: [{ funcao: "trabalhador", competencia_id: skill.id }],
    monitoramento_continuo: true,
    procedimento_resgate: "Procedimento de resgate exclusivo de testes",
    avaliacao_max_minutos: 5,
    permite_prorrogacao: true,
  };
  const model = await rpc("salvar_modelo", {
    nome: "PROCEDIMENTO EXCLUSIVO TESTE",
    procedimento: procedure,
  });
  const approval = {
    modelo_versao_id: model.id,
    responsavel_id: supervisor.id,
    declaracao: "Aprovação técnica exclusiva do cenário isolado.",
  };
  await denied(
    () => rpc("aprovar_modelo", approval),
    "42501",
    "admin sem designação técnica não aprova modelo",
  );
  await root();
  await q(
    "insert into public.pet_responsaveis_tecnicos(organization_id,pessoa_id,designacao,inicio) values($1,$2,'Designação EXCLUSIVA TESTE',now()-interval '1 day')",
    [org, supervisor.id],
  );
  await q(
    "insert into public.pessoa_qualificacoes(organization_id,pessoa_id,competencia_id,emissor,conclusao,validade,estado,conferido_por,conferido_em) values($1,$2,$3,'Fixture TESTE',(now()-interval '1 day')::date,(now()+interval '1 year')::date,'validada',$4,now())",
    [org, entrant.id, skill.id, admin],
  );
  await auth();
  await rpc("aprovar_modelo", approval);
  const participants = [
    { pessoa_id: supervisor.id, funcao: "supervisor", classificacao: "interno" },
    { pessoa_id: watch.id, funcao: "vigia", classificacao: "interno" },
    { pessoa_id: entrant.id, funcao: "trabalhador", classificacao: "interno" },
    { pessoa_id: rescue.id, funcao: "resgate", classificacao: "interno" },
  ];
  const content = {
    perigos: [
      {
        grupo: "Químicos",
        perigo: "Atmosfera adversa TESTE",
        medida: "Medida validada no cenário de teste",
      },
    ],
    monitoramento_continuo: {
      confirmado: true,
      equipamento: "Detector TESTE",
      registro: "Registro exclusivo cenário",
    },
    procedimentos: {
      dispositivo_adequado: "sim",
      comunicacao: "Procedimento teste",
      resgate: "Plano resgate teste",
    },
    contatos_emergencia: "Contato de emergência teste isolado",
  };
  const draft = {
    pet_id: id,
    expected_version: 1,
    atividade: create.atividade,
    termino_previsto: expiration,
    modelo_id: model.id,
    conteudo: content,
    participantes: participants,
    respostas: [{ item: "isolamento", resposta: "nao_aplicavel" }],
  };
  await rpc("salvar_rascunho", draft);
  await denied(() => rpc("salvar_rascunho", draft), "40001", "expected_version impede sobrescrita");
  await denied(
    async () => rpc("conferir", { pet_id: id, expected_version: await version(id) }),
    "23514",
    "não se aplica sem justificativa bloqueado",
  );
  await rpc("salvar_rascunho", {
    ...draft,
    expected_version: await version(id),
    respostas: [{ item: "isolamento", resposta: "sim" }],
  });
  const assessment = {
    pet_id: id,
    expected_version: await version(id),
    etapa: "inicial",
    instrumento: "Detector TESTE",
    numero_serie: "SERIE-TESTE",
    responsavel_id: supervisor.id,
    momento: new Date().toISOString(),
    calibracao: "Verificado/calibrado em teste controlado",
    leituras: [{ agente: "O2", valor: 20.9, unidade: "%vol", origem: "Fixture de integração" }],
  };
  await denied(
    () => rpc("registrar_avaliacao", { ...assessment, leituras: [] }),
    "23514",
    "avaliação sem leitura bloqueada",
  );
  await rpc("registrar_avaliacao", assessment);
  pass(
    (await detail(id)).pendencias.some((p) => p.codigo === "evidencia"),
    "evidência exigida não pode ser forjada em JSON de formulário",
  );
  const uploadKey = randomUUID(),
    uploadData = {
      nome: "FOTO TESTE.jpg",
      mime: "image/jpeg",
      tamanho: 64,
      sha256: "b".repeat(64),
      pet_item: "isolamento",
    };
  const prepare = async () =>
    (
      await q("select public.iniciar_anexo_pet($1,$2,$3,$4::jsonb) r", [
        org,
        id,
        uploadKey,
        JSON.stringify(uploadData),
      ])
    )[0].r;
  const upload = await prepare();
  pass((await prepare()).id === upload.id, "retomada de foto mantém intenção idempotente");
  await root();
  await q("set role service_role");
  await denied(
    () =>
      q("select public.confirmar_anexo_operacional($1,$2,$3,$4)", [
        org,
        upload.id,
        admin,
        uploadData.sha256,
      ]),
    "23514",
    "foto não confirmada não finge upload concluído",
  );
  await root();
  await q(
    "insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',$1,$2::jsonb)",
    [upload.caminho, JSON.stringify({ size: 64, mimetype: "image/jpeg" })],
  );
  await q("set role service_role");
  await q("select public.confirmar_anexo_operacional($1,$2,$3,$4)", [
    org,
    upload.id,
    admin,
    uploadData.sha256,
  ]);
  await auth();
  pass(
    !(await detail(id)).pendencias.some((p) => p.codigo === "evidencia"),
    "manifesto confirmado satisfaz somente o item vinculado",
  );
  await rpc("conferir", { pet_id: id, expected_version: await version(id) });
  await denied(
    async () => rpc("emitir", { pet_id: id, expected_version: await version(id) }),
    "23514",
    "emissão bloqueada sem integração certificada",
  );
  await denied(
    async () =>
      rpc("preparar_assinatura", {
        pet_id: id,
        expected_version: await version(id),
        participante_id: (await detail(id)).participantes.find((p) => p.pessoa_id === watch.id).id,
        finalidade: "emissao",
        declaracao: "Declaração individual teste",
        metodo: "aceite_autenticado",
      }),
    "42501",
    "supervisor não assina pela equipe",
  );
  await denied(
    () =>
      q("select public.pet_validar_assinatura($1,$2,'teste','forjado','{}'::jsonb)", [
        org,
        randomUUID(),
      ]),
    "42501",
    "callback não autenticado como serviço recusado",
  );
  // Explicit provider test double. Does not prove a live provider or real certificate.
  await root();
  await q(
    "insert into public.pet_assinatura_integracoes(organization_id,provedor,ambiente,configurada,icp_brasil,verificado_em,configuracao_referencia) values($1,'TEST DOUBLE EXCLUSIVO','homologacao',true,true,now(),'TEST ONLY no real certificate')",
    [org],
  );
  const sign = async (pessoa, user, finalidade, evento_em = new Date().toISOString()) => {
    await auth(user);
    const dt = await detail(id),
      pt = dt.participantes.find((p) => p.pessoa_id === pessoa && p.fim === null);
    await rpc("preparar_assinatura", {
      pet_id: id,
      expected_version: dt.pet.version,
      participante_id: pt.id,
      finalidade,
      declaracao: "Declaração individual EXCLUSIVA TESTE",
      metodo: "certificada_icp_brasil",
      evento_em,
    });
    const a = (await detail(id)).assinaturas.at(-1),
      validation = {
        conteudo_sha256: a.conteudo_sha256,
        pessoa_id: pessoa,
        revisao_id: a.revisao_id,
        icp_brasil: true,
        cadeia_valida: true,
        identidade_verificada: true,
        provedor_id: randomUUID(),
        identidade: { fixture: "TEST DOUBLE" },
        artefato_original_sha256: "a".repeat(64),
        assinada_em: new Date().toISOString(),
      };
    await root();
    await q("set role service_role");
    const callback = randomUUID(),
      args = [org, a.id, callback, JSON.stringify(validation)];
    await q(
      "select public.pet_validar_assinatura($1,$2,'TEST DOUBLE EXCLUSIVO',$3,$4::jsonb)",
      args,
    );
    await q(
      "select public.pet_validar_assinatura($1,$2,'TEST DOUBLE EXCLUSIVO',$3,$4::jsonb)",
      args,
    );
    await denied(
      () =>
        q("select public.pet_validar_assinatura($1,$2,'TEST DOUBLE EXCLUSIVO',$3,$4::jsonb)", [
          org,
          a.id,
          callback,
          JSON.stringify({ ...validation, pessoa_id: admin }),
        ]),
      "23514",
      "callback com identidade divergente recusado",
    );
    await auth();
    return a.id;
  };
  await sign(supervisor.id, admin, "emissao");
  pass(
    (await detail(id)).assinaturas[0].conteudo_assinado.finalidade === "emissao" &&
      (await detail(id)).assinaturas[0].conteudo_assinado.pessoa_id === supervisor.id,
    "hash de assinatura cobre identidade finalidade e declaração do ato",
  );
  await sign(watch.id, vigia, "emissao");
  await denied(
    async () => rpc("emitir", { pet_id: id, expected_version: await version(id) }),
    "23514",
    "documento deve existir antes da liberação",
  );
  await root();
  const revision = (
      await q("select revisao_atual_id from public.pet_permissoes where id=$1", [id])
    )[0].revisao_atual_id,
    file = randomUUID();
  await q(
    "insert into public.anexos(id,organization_id,pet_id,nome,mime,tamanho,sha256,caminho,estado) values($1,$2,$3,'ORIGINAL TESTE SEM CERTIFICADO.pdf','application/pdf',10,$4,$5,'vinculado')",
    [file, org, id, "a".repeat(64), org + "/anexos/" + file],
  );
  await q(
    "insert into public.pet_documentos(organization_id,pet_id,revisao_id,tipo,estado,anexo_id,sha256) values($1,$2,$3,'emissao','disponivel',$4,$5)",
    [org, id, revision, file, "a".repeat(64)],
  );
  await auth();
  await rpc("emitir", { pet_id: id, expected_version: await version(id) });
  pass(
    (await detail(id)).pet.estado_documental === "emitida",
    "emissão com provedor explicitamente simulado em teste",
  );
  const entryTime = new Date().toISOString(),
    entrySign = await sign(entrant.id, worker, "entrada", entryTime);
  const entry = {
      pet_id: id,
      expected_version: await version(id),
      pessoa_id: entrant.id,
      momento: entryTime,
      origem: "online",
      assinatura_id: entrySign,
    },
    entryKey = randomUUID();
  await Promise.all([
    concurrentRpc("registrar_entrada", entry, entryKey),
    concurrentRpc("registrar_entrada", entry, entryKey),
  ]);
  await rpc("registrar_entrada", entry, entryKey);
  pass((await detail(id)).metricas.presentes === 1, "duplo toque entrada mantém um intervalo");
  await denied(
    async () => rpc("registrar_entrada", { ...entry, expected_version: await version(id) }),
    "23505",
    "segunda entrada incompatível rejeitada",
  );
  await rpc("interromper", {
    pet_id: id,
    expected_version: await version(id),
    motivo: "Interrupção de teste controlada",
  });
  pass(
    (await detail(id)).metricas.presentes === 1 &&
      (await detail(id)).intervalos[0].saida_em === null,
    "interrupção não inventa saída nem pausa permanência",
  );
  await root();
  await q(
    "update public.pet_permissoes set termino_previsto=clock_timestamp()-interval '1 second',emitida_em=clock_timestamp()-interval '1 hour' where id=$1",
    [id],
  );
  await auth();
  pass(
    (await detail(id)).pet.validade_temporal === "expirada" &&
      (await detail(id)).metricas.presentes === 1,
    "expiração mantém presença visível",
  );
  const exit = {
    pet_id: id,
    expected_version: 1,
    pessoa_id: entrant.id,
    momento: new Date().toISOString(),
    origem: "offline",
    motivo: "Saída em contingência sem rede",
  };
  const exitKey = randomUUID();
  await Promise.all([
    concurrentRpc("registrar_saida", exit, exitKey),
    concurrentRpc("registrar_saida", exit, exitKey),
  ]);
  await rpc("registrar_saida", exit);
  const closed = await detail(id);
  pass(
    closed.metricas.presentes === 0 &&
      closed.presencas.filter((p) => p.tipo === "saida").length === 1,
    "saída offline idempotente independente de assinatura ou versão antiga",
  );
  pass(
    closed.presencas.find((p) => p.tipo === "saida").assinatura_pendente &&
      closed.pet.estado_documental === "encerramento_pendente",
    "última saída exige encerramento e preserva assinatura pendente",
  );
  await denied(
    () => rpc("registrar_entrada", { ...entry, expected_version: closed.pet.version }),
    "23514",
    "última saída e expiração bloqueiam reentrada",
  );
  await denied(
    () =>
      rpc("avaliar_prorrogacao", {
        pet_id: id,
        expected_version: closed.pet.version,
        supervisor_id: supervisor.id,
        termino_novo: new Date(Date.now() + 25 * 3600e3).toISOString(),
        condicoes: {},
        motivo: "Teste de recusa",
      }),
    "23514",
    "prorrogação incompatível recusada",
  );
  await rpc("encerrar", {
    pet_id: id,
    expected_version: await version(id),
    motivo: "Término do cenário controlado",
    condicao_final: "Local restituído no cenário de teste",
    conferencia_presenca: true,
  });
  pass(
    (await detail(id)).pet.estado_documental === "encerramento_pendente",
    "pendência documental preserva término operacional",
  );
  await rpc("retificar", {
    pet_id: id,
    expected_version: await version(id),
    evento_id: closed.presencas[0].id,
    momento_corrigido: new Date().toISOString(),
    motivo: "Proposta de conferência auditável de teste",
  });
  pass(
    (await detail(id)).eventos.some((e) => e.tipo === "retificacao_solicitada") &&
      (await detail(id)).presencas[0].id === closed.presencas[0].id,
    "retificação não sobrescreve evidência original",
  );
  pass(
    (await q("select count(*)::integer n from public.os_apontamentos where os_id=$1", [os.id]))[0]
      .n === 0,
    "horas PET nunca duplicam apontamento OS",
  );
  const listed = (
    await q("select public.pet_listar($1,$2::jsonb) r", [
      org,
      JSON.stringify({ unidade_id: unit.id }),
    ])
  )[0].r;
  pass(
    listed.registros.some((p) => p.id === id),
    "histórico autorizado da unidade abre a mesma PET",
  );
  await root();
  await denied(
    () => q("update public.pet_eventos_presenca set momento_declarado=now() where pet_id=$1", [id]),
    "23514",
    "trigger preserva eventos anteriores",
  );
  await denied(
    () =>
      q("update public.pet_modelo_versoes set procedimento='{}'::jsonb where id=$1", [model.id]),
    "23514",
    "procedimento aprovado não pode ser reescrito",
  );
  const baseline = (await q("select public.pet_obter($1,$2) r", [org, id]))[0].r.metricas
    .horas_pessoa_segundos;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const enterAt = new Date(midnight.getTime() - 60000).toISOString(),
    leaveAt = new Date(midnight.getTime() + 60000).toISOString();
  const extraIn = randomUUID(),
    extraOut = randomUUID(),
    historical = closed.presencas[0];
  await q(
    "insert into public.pet_eventos_presenca(id,organization_id,pet_id,pessoa_id,participante_id,revisao_id,tipo,momento_declarado,origem) values($1,$2,$3,$4,$5,$6,'entrada',$7,'informado_posteriormente'),($8,$2,$3,$4,$5,$6,'saida',$9,'informado_posteriormente')",
    [
      extraIn,
      org,
      id,
      entrant.id,
      historical.participante_id,
      historical.revisao_id,
      enterAt,
      extraOut,
      leaveAt,
    ],
  );
  await q(
    "insert into public.pet_intervalos(organization_id,pet_id,pessoa_id,entrada_id,saida_id,entrada_em,saida_em) values($1,$2,$3,$4,$5,$6,$7)",
    [org, id, entrant.id, extraIn, extraOut, enterAt, leaveAt],
  );
  await auth();
  pass(
    (await detail(id)).metricas.horas_pessoa_segundos === baseline + 120,
    "servidor soma intervalos em segundos após meia-noite",
  );
  const reconnected = postgres(opts);
  try {
    await reconnected.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await reconnected.unsafe("set role authenticated");
    const dt = (await reconnected.unsafe("select public.pet_obter($1,$2) r", [org, id]))[0].r;
    pass(
      dt.metricas.horas_pessoa_segundos === baseline + 120,
      "reconexão mantém tempo vindo dos eventos persistidos",
    );
  } finally {
    await reconnected.end();
  }
  await auth(outsider);
  await denied(() => detail(id), "42501", "papel insuficiente não recupera snapshots pelo detalhe");
  console.log(
    "PET DB " +
      checks +
      " assertions passed. Provider: TEST DOUBLE ONLY; real integration not validated.",
  );
} finally {
  await sql.end();
}
