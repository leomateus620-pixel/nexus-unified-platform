import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceFingerprint, validateAcceptanceException } from "./acceptance-contract.mjs";

const before = 'const x=1; if(data.acao === "aceitar") { oldWork(); } else { preserve(); }';
const after = 'const x=1; if(data.acao === "aceitar") { atomicWork(); } else { preserve(); }';
test("allows the reviewed acceptance body and preserves every other byte", () => {
  const result = validateAcceptanceException(before, after, acceptanceFingerprint(after));
  assert.equal(result.restUnchanged, true);
});
test("rejects changes to the preserved formula or another transition", () => {
  for (const changed of [after.replace("x=1", "x=2"), after.replace("preserve()", "changed()")])
    assert.throws(
      () => validateAcceptanceException(before, changed, acceptanceFingerprint(after)),
      /outside/,
    );
});
test("rejects an unreviewed acceptance body, missing branch or duplicate", () => {
  assert.throws(
    () =>
      validateAcceptanceException(
        before,
        after.replace("atomicWork()", "differentWork()"),
        acceptanceFingerprint(after),
      ),
    /differs/,
  );
  assert.throws(() => acceptanceFingerprint("const x=1"), /exactly one/);
  assert.throws(() => acceptanceFingerprint(after + after), /exactly one/);
});
