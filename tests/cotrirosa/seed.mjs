import { fixture } from "./fixture.mjs";
const f = await fixture(process.env.NEXUS_COTRIROSA_LAB_DB || "cotrirosa_lab");
try {
  await f.authorizeModel();
  console.log(
    JSON.stringify({
      org: f.org,
      unit: f.unit,
      client: f.client,
      locals: f.locals,
      spaces: f.spaces,
      legacy: f.legacy.id,
    }),
  );
} finally {
  await f.sql.end();
}
