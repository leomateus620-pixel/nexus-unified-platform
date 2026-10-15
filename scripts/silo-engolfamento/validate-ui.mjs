// Keep the established package command, now exercising the grounded LVHF upgrade.
await import("./validate-upgrade.mjs");
// Full validation also covers asynchronous shader readiness, cancellation and
// restored contexts. Targeted upgrade filters keep their original narrow scope.
if (!process.env.SILO_CHECKS) {
  const previous = process.env.SILO_OUTPUT;
  process.env.SILO_OUTPUT = `${previous ?? "docs/silo-engolfamento/evidence/upgrade"}/startup-state`;
  try {
    await import("./validate-startup.mjs");
  } finally {
    if (previous === undefined) delete process.env.SILO_OUTPUT;
    else process.env.SILO_OUTPUT = previous;
  }
}
