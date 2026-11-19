import { createInspectionService } from "../../src/features/cruz-alta/inspection-sync/service.server";
import { prepareNextCruzAltaPdf } from "../../src/features/cruz-alta/pdf-representations.server";

const [limitArg = "20", ...rest] = process.argv.slice(2);
const limit = Number(limitArg);
const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (rest.length || !Number.isInteger(limit) || limit < 1 || limit > 500 || !url || !serviceKey) {
  throw new Error(
    "Uso: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente, tsx scripts/cruz-alta/preparar-pdfs.ts [1–500]",
  );
}

const service = createInspectionService({ url, serviceKey });
let prepared = 0;
let failed = 0;
for (let index = 0; index < limit; index++) {
  try {
    if (!(await prepareNextCruzAltaPdf(service, AbortSignal.timeout(43_000)))) break;
    prepared++;
  } catch {
    failed++;
  }
}
console.log(JSON.stringify({ prepared, failed }));
if (failed) process.exitCode = 1;
