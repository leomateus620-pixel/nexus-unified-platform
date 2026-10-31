import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Only the external pg_net/Vault boundary is synthetic; functions, triggers and roles are real.
// Called exclusively by the disposable nr-imagens suite, never against connected infrastructure.
export async function testImageDispatch({ sql, org, eng, client, unit, local, as, service }) {
  let assertions = 0;
  const [{ clean }] =
    await sql`select to_regnamespace('net')is null and to_regnamespace('vault')is null clean`;
  assert.equal(
    clean,
    true,
    "dispatch fixtures require a PostgreSQL cluster without real net/Vault",
  );
  const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const endpoint = "https://yhtgijtllvgzoqtfcgal.supabase.co/functions/v1/nr-image-worker";
  const reject = async (work, code) => {
    await assert.rejects(work, (error) => error.code === code);
    assertions++;
  };
  await sql.unsafe(`create schema net;create schema vault;
    create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
    create table net.http_request_queue(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
    create table net._http_response(id bigint,content text);
    create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 1000)returns bigint
    language plpgsql as $$declare result bigint;begin
      if current_setting('nexus.test.net_fail',true)='1'then raise exception'Synthetic HTTP enqueue failure'using errcode='08006';end if;
      insert into net.http_request_queue(url,body,headers,timeout_milliseconds)
      values(http_post.url,http_post.body,http_post.headers,http_post.timeout_milliseconds)returning id into result;return result;end$$;
    grant usage on schema net,vault to anon,authenticated;
    revoke all on all tables in schema net,vault from public,anon,authenticated;
    grant select on net.http_request_queue,net._http_response to public;`);
  try {
    await sql`insert into vault.decrypted_secrets values('nexus_nr_image_worker_url',${endpoint}),('nexus_nr_image_worker_token',${token})`;
    assert.equal(
      (await service((tx) => tx`select public.nr_imagem_worker_validar(${token}) valid`))[0].valid,
      false,
    );
    assert.equal(
      (
        await service((tx) => tx`select public.nr_imagem_worker_validar(${"0".repeat(64)}) valid`)
      )[0].valid,
      false,
    );
    assert.equal(
      (await service((tx) => tx`select public.nr_imagem_worker_validar('invalid') valid`))[0].valid,
      false,
    );
    await reject(
      () => as(eng, (tx) => tx`select public.nr_imagem_worker_validar(${token})`),
      "42501",
    );
    assertions += 3;
    for (const role of ["anon", "authenticated"])
      for (const relation of [
        "vault.decrypted_secrets",
        "net.http_request_queue",
        "net._http_response",
      ]) {
        assert.equal(
          (await sql`select has_table_privilege(${role},${relation},'select') allowed`)[0].allowed,
          relation !== "vault.decrypted_secrets",
        );
        assertions++;
      }
    await reject(() => as(eng, (tx) => tx`select public.nr_imagem_worker_disparar()`), "42501");
    await reject(() => service((tx) => tx`select public.nr_imagem_worker_disparar()`), "42501");
    const meta = {
      cliente_id: client,
      unidade_id: unit,
      local_id: local,
      normas: ["NR33"],
      nome: "dispatch-synthetic.jpg",
      mime: "image/jpeg",
      tamanho: 100,
      sha256: "c".repeat(64),
      papel: "foto",
    };
    const file = (
      await as(
        eng,
        (tx) => tx`select public.nr_arquivo_preparar(${org},${randomUUID()},${tx.json(meta)}) r`,
      )
    )[0].r;
    await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${sql.json({ size: meta.tamanho, mimetype: meta.mime })})`;
    await service(
      (tx) =>
        tx`select public.nr_arquivo_confirmar(${org},${file.id},${eng},${file.sha256},${file.tamanho},${file.mime})`,
    );
    const requests = await sql`select * from net.http_request_queue order by id`;
    assert.equal(
      requests.length,
      1,
      "confirming one upload immediately enqueues one private invocation",
    );
    assert.equal(requests[0].url, endpoint);
    assert.deepEqual(requests[0].body, { processador: "nexus-storage-transform-v1", limite: 1 });
    const ticket = requests[0].headers["X-Nexus-Job-Token"];
    assert.match(ticket, /^[a-f0-9]{64}$/);
    assert.notEqual(ticket, token);
    assert.equal(
      (await service((tx) => tx`select public.nr_imagem_worker_validar(${ticket}) valid`))[0].valid,
      true,
    );
    assert.equal(
      (await service((tx) => tx`select public.nr_imagem_worker_validar(${ticket}) valid`))[0].valid,
      false,
    );
    const persistedTicket = (
      await sql`select *,extract(epoch from(expira_em-criado_em))::float8 ttl from public.nr_imagem_worker_tickets`
    )[0];
    assert.equal(
      persistedTicket.ticket_sha256,
      (await sql`select encode(sha256(convert_to(${ticket},'UTF8')),'hex') hash`)[0].hash,
    );
    assert.equal(persistedTicket.ttl > 119 && persistedTicket.ttl < 121, true);
    assert.equal(requests[0].timeout_milliseconds, 60000);
    assertions += 10;
    const responses = await sql.begin(async (tx) => [
      (await tx`select public.nr_imagem_worker_disparar() r`)[0].r,
      (await tx`select public.nr_imagem_worker_disparar() r`)[0].r,
    ]);
    assert.equal(responses[0].estado, "solicitado");
    assert.equal(responses[1].estado, "ja_solicitado_na_transacao");
    assert.equal(JSON.stringify(responses).includes(token), false);
    assert.equal(JSON.stringify(responses).includes(ticket), false);
    assert.equal((await sql`select count(*)::int n from net.http_request_queue`)[0].n, 2);
    assertions += 5;
    await sql`update vault.decrypted_secrets set decrypted_secret='https://external.invalid/functions/v1/nr-image-worker'where name='nexus_nr_image_worker_url'`;
    assert.equal(
      (await sql`select public.nr_imagem_worker_disparar() r`)[0].r.estado,
      "configuracao_privada_ausente",
    );
    assert.equal((await sql`select count(*)::int n from net.http_request_queue`)[0].n, 2);
    assertions += 2;
    await sql`update vault.decrypted_secrets set decrypted_secret=${endpoint} where name='nexus_nr_image_worker_url'`;
    const failure = await sql.begin(async (tx) => {
      await tx`select set_config('nexus.test.net_fail','1',true)`;
      return (await tx`select public.nr_imagem_worker_disparar() r`)[0].r;
    });
    assert.deepEqual(failure, { estado: "falha_no_disparo", sqlstate: "08006" });
    assert.equal(
      (await sql`select count(*)::int n from public.nr_imagem_worker_tickets`)[0].n,
      2,
      "An unsuccessful HTTP enqueue rolls back the newly generated ticket",
    );
    assert.equal(
      (
        await sql`select count(*)::int n from public.nr_imagem_representacoes where arquivo_id=${file.id} and estado='fila'`
      )[0].n,
      2,
    );
    assertions += 3;
    await sql`update vault.decrypted_secrets set decrypted_secret=''where name='nexus_nr_image_worker_token'`;
    assert.equal(
      (await sql`select public.nr_imagem_worker_disparar() r`)[0].r.estado,
      "solicitado",
    );
    assertions++;
    const result = {
      estado: "disponivel",
      mime: "image/webp",
      tamanho: 25,
      largura: 100,
      altura: 100,
      sha256: "e".repeat(64),
    };
    const first = (
      await service(
        (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
      )
    )[0].r[0];
    assert.equal(first.arquivo_id, file.id);
    assert.equal(
      (await sql`select public.nr_imagem_worker_disparar() r`)[0].r.estado,
      "processamento_em_andamento",
    );
    assert.equal((await sql`select count(*)::int n from net.http_request_queue`)[0].n, 3);
    await service(
      (tx) =>
        tx`select public.nr_imagem_trabalho_concluir(${first.id},${first.lease},${tx.json(result)})`,
    );
    assert.equal(
      (await sql`select count(*)::int n from net.http_request_queue`)[0].n,
      4,
      "Concluding the first native variant immediately invokes the next without waiting for cron",
    );
    const second = (
      await service(
        (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
      )
    )[0].r[0];
    assert.equal(second.arquivo_id, file.id);
    assert.notEqual(first.id, second.id);
    await service(
      (tx) =>
        tx`select public.nr_imagem_trabalho_concluir(${second.id},${second.lease},${tx.json(result)})`,
    );
    assert.equal(
      (await sql`select count(*)::int n from net.http_request_queue`)[0].n,
      4,
      "No HTTP invocation is added once both native variants have completed",
    );
    assert.equal(
      (
        await sql`select count(*)::int n from public.nr_imagem_representacoes where arquivo_id=${file.id} and estado='disponivel'`
      )[0].n,
      2,
    );
    assertions += 8;
    const allRequests = await sql`select headers from net.http_request_queue order by id`;
    const tickets = allRequests.map((request) => request.headers["X-Nexus-Job-Token"]);
    assert.equal(new Set(tickets).size, tickets.length);
    assert.equal(JSON.stringify(allRequests).includes(token), false);
    assert.equal(
      (await sql`select count(*)::int n from public.nr_imagem_worker_tickets`)[0].n,
      tickets.length,
    );
    assertions += 3;
  } finally {
    // These schemas were verified absent before creating this synthetic external boundary.
    await sql.unsafe("drop schema net cascade;drop schema vault cascade;");
  }
  return assertions;
}
