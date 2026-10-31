import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export async function testImageTickets({ sql, eng, as, service }) {
  let assertions = 0;
  const hash = (token) => createHash("sha256").update(token).digest("hex");
  const validate = (token) =>
    service(
      async (tx) => (await tx`select public.nr_imagem_worker_validar(${token}) valid`)[0].valid,
    );
  const seed = async ({ expired = false, milliseconds = 120000 } = {}) => {
    const token = randomBytes(32).toString("hex");
    await sql`insert into public.nr_imagem_worker_tickets(ticket_sha256,criado_em,expira_em)
      values(${hash(token)},clock_timestamp()-interval'1 day',
        clock_timestamp()+(${expired ? -1000 : milliseconds}::text||' milliseconds')::interval)`;
    return token;
  };
  const reject = async (work, code) => {
    await assert.rejects(work, (error) => error.code === code);
    assertions++;
  };
  for (const role of ["anon", "authenticated", "service_role"])
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      assert.equal(
        (
          await sql`select has_table_privilege(${role},'public.nr_imagem_worker_tickets',${privilege}) allowed`
        )[0].allowed,
        false,
      );
      assertions++;
    }
  assert.deepEqual(
    (
      await sql`select column_name from information_schema.columns where table_schema='public'and table_name='nr_imagem_worker_tickets'order by ordinal_position`
    ).map((row) => row.column_name),
    ["ticket_sha256", "processador", "finalidade", "criado_em", "expira_em", "consumido_em"],
  );
  assert.equal(
    (
      await sql`select relrowsecurity from pg_class where oid='public.nr_imagem_worker_tickets'::regclass`
    )[0].relrowsecurity,
    true,
  );
  assert.equal(
    (
      await sql`select provolatile from pg_proc where oid='public.nr_imagem_worker_validar(text)'::regprocedure`
    )[0].provolatile,
    "v",
  );
  assertions += 3;
  await reject(() => as(eng, (tx) => tx`select * from public.nr_imagem_worker_tickets`), "42501");
  await reject(() => service((tx) => tx`select * from public.nr_imagem_worker_tickets`), "42501");
  await reject(
    () => as(eng, (tx) => tx`select public.nr_imagem_worker_validar(${"0".repeat(64)})`),
    "42501",
  );
  await reject(
    () => sql`insert into public.nr_imagem_worker_tickets(ticket_sha256,processador,expira_em)
    values(${hash(randomUUID())},'another-processor',clock_timestamp()+interval'120 seconds')`,
    "23514",
  );
  await reject(
    () => sql`insert into public.nr_imagem_worker_tickets(ticket_sha256,finalidade,expira_em)
    values(${hash(randomUUID())},'another-purpose',clock_timestamp()+interval'120 seconds')`,
    "23514",
  );
  const expired = await seed({ expired: true });
  assert.equal(await validate(expired), false);
  assert.equal(await validate(randomBytes(32).toString("hex")), false);
  assert.equal(await validate("0".repeat(64)), false);
  assert.equal(await validate(null), false);
  const single = await seed();
  assert.equal(await validate(single), true);
  assert.equal(await validate(single), false);
  assertions += 6;
  const concurrent = await seed();
  let markHeld, release, markContender;
  const held = new Promise((resolve) => {
    markHeld = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const contenderReady = new Promise((resolve) => {
    markContender = resolve;
  });
  const writer = service(async (tx) => {
    const result = (await tx`select public.nr_imagem_worker_validar(${concurrent}) valid`)[0].valid;
    markHeld();
    await gate;
    return result;
  });
  await held;
  const application = `ticket-contender-${randomUUID()}`;
  const contender = service(async (tx) => {
    await tx`select set_config('application_name',${application},true)`;
    markContender();
    return (await tx`select public.nr_imagem_worker_validar(${concurrent}) valid`)[0].valid;
  });
  await contenderReady;
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      waiting =
        (
          await sql`select wait_event_type='Lock' waiting from pg_stat_activity where application_name=${application}`
        )[0]?.waiting === true;
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, "A competing consumption waits on the actual ticket row lock");
    assertions++;
  } finally {
    release();
  }
  assert.equal(await writer, true);
  assert.equal(await contender, false);
  assert.equal(await validate(concurrent), false);
  assertions += 3;
  // A validator that waited for a lock cannot accept a ticket that expired while waiting.
  const delayed = await seed({ milliseconds: 250 });
  let markLock, unlock;
  const lockHeld = new Promise((resolve) => {
    markLock = resolve;
  });
  const unlockGate = new Promise((resolve) => {
    unlock = resolve;
  });
  const ownerLock = sql.begin(async (tx) => {
    await tx`select ticket_sha256 from public.nr_imagem_worker_tickets where ticket_sha256=${hash(delayed)} for update`;
    markLock();
    await unlockGate;
  });
  await lockHeld;
  const delayedValidation = validate(delayed);
  await new Promise((resolve) => setTimeout(resolve, 350));
  unlock();
  await ownerLock;
  assert.equal(await delayedValidation, false);
  assert.equal(
    (
      await sql`select consumido_em from public.nr_imagem_worker_tickets where ticket_sha256=${hash(delayed)}`
    )[0].consumido_em,
    null,
  );
  assertions += 2;
  return assertions;
}
