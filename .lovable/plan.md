# NR image worker on the existing app runtime — findings and recommendation (read-only)

No writes performed: no code, SQL, secrets, Vault URL, schedules, deploy or jobs.

## 1. Private bindings
- Observed in repo: `src/features/nr/files.functions.ts` (line 10) and the levantamentos/pe/estudos/pet `*.functions.ts` files read `process.env["SUPABASE_SERVICE_ROLE_KEY"]` / `SUPABASE_URL` inside handlers. `supabaseAdmin` is loaded with `await import("@/integrations/supabase/client.server")`.
- Observed in sandbox (names only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `LOVABLE_CRON_SECRET` are set. `LOVABLE_CRON_SECRET_PREVIOUS` is not.
- Documented guarantee: on Lovable Cloud these are server-only runtime values, read per request on the Worker. The preview gets new values right away; the published app gets them at publish.
- Deployment evidence: indirect only. Authorized NR uploads in production work, and they go through these handlers. I have no tool that lists bindings on the deployed Worker, so per-binding production presence is inferred, not read back.

## 2. Fixed internal POST route
- Supported: a TanStack server route with `server.handlers.POST`. It has a stable path, needs no page or menu, and avoids server-function hash URLs. The repo already uses this pattern (`src/routes/mcp.ts`).
- Recommended file: `src/routes/api/public/nr/image-worker.ts`, giving `/api/public/nr/image-worker`. The `/api/public/*` prefix is required so external callers (pg_net or the scheduler) get past published-site auth, so the handler must authenticate every request itself.
- Modules: `src/features/nr/image-worker/core.ts` and `image-info.ts` (plus the other reviewed runtime files) as plain modules. They need no `*.client.*` names, must not read env at module scope, and must make no random/crypto calls at global scope. Load `client.server` dynamically inside the handler.
- Handler order: check method and content-type → reject any body fields beyond the ticket (no org or path in the body) → service-only RPC check of the ticket (64 hex, 120 s, single use) → claim 1 job → keep a 45 s budget → private Transform → immutable upload (`x-upsert:false`) → GET and hash check → complete the job. Roles do not change.

## 3. Continuous scheduling
- Option A, Lovable managed HTTP schedule. Available here: the generated `src/integrations/supabase/cron-auth.ts` exists and `LOVABLE_CRON_SECRET` is set, and the platform owns that credential, so no new secret is needed. Call `authenticateCronRequest(request)` first, then do the ticket check, or let the scheduler auth replace the ticket for scheduled calls. Create the schedule with `supabase--create_http_schedule` (relative path, cron, exact JSON body) and inspect it with `supabase--list_http_schedules`. It targets the published deployment.
- Option B, the existing pg_cron + pg_net calling the fixed route with a one-time ticket minted in SQL. This keeps the 0059 design, but the 0059 allowlist is exact to the Edge URL, so it needs a reviewed append-only 0060 that adds only the approved Nexus worker URL.
- Recommendation: B fits the ticket model you already reviewed. A removes the Vault URL and pg_net hold but changes the auth boundary. Pick one; do not run both.
- Timing: managed schedules that fire at most twice per hour can land up to about 30 s late. Every-minute schedules run on time. Each call claims 1 job, so the number of calls per minute sets throughput.
- Verification: check the handler's status codes (401/403 without auth or ticket, 200 with job outcome) with `stack_modern--server-function-logs`, the `net._http_response` rows (B) or the schedule run history (A), and the queue counts in `nr_imagem_representacoes`. Retries use the existing lease expiry and retry limit of 3. A failed call leaves the job queued, so a missed tick is safe.

## 4. Deployment boundary
- A server route ships with the app bundle. There is no backend-only deploy for it, and only Publish brings it to production. Publishing also ships every frontend change made since the last publish, so the frontend cannot stay frozen. To limit this, publish from a tree where the only diff is the worker route plus its modules.
- Preview: the route runs in preview, and `project--{id}-dev.lovable.app` is the stable preview host. Preview is gated by Lovable login and tracks the latest build, not a release, so it is not a production cron target. Use preview only for manual tests, such as 401/403 checks and a single-ticket run.
- Production target: the stable `project--{id}.lovable.app` host, or `nexusgestao.app`. Only that exact URL goes into 0060.

## 5. Controls kept
1 claim per call, 45 s budget, private bindings only, no org or path from the request body, roles unchanged. Any URL switch happens only through a reviewed append-only 0060 that adds one exact worker URL.

## Missing capability
- No readback of the bindings on the deployed Worker.
- No backend-only publish: production rollout requires a full app Publish.
- No Edge function creation in my flow (already known).

## Implementation steps after approval (not now)
1. Add the route and the 5 runtime modules (as reviewed).
2. Run tests in preview: no-auth 401/403, one ticketed run.
3. Publish a minimal diff.
4. Apply 0060 (exact URL) or create the managed schedule.
5. Release the Vault URL hold; observe logs and queue counts.
