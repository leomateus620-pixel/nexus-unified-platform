<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Business routes live under `src/routes/_authenticated/` (client-only gate + organization onboarding); `/auth` and the 3D map routes stay public. Why: session is in browser storage and all data is organization-scoped.
- Budget formulas live only in `src/features/calculo/domain.ts` (pure, versioned `MOTOR_VERSAO`, tested in `tests/calculo.test.ts`); pages never compute business values themselves. Why: preview and server calculation must share one rule set.
- `sistema_componentes` is the single source of quantities; the canonical recalculation runs in `recalcularRevisao` (server function) and persists `calculo_execucoes`. Why: traceability and no diverging totals.
- `revisao_componentes.incluido_orcamento` is the versioned inclusion switch; only included items enter the canonical engine, while excluded rule dependencies become explicit pending items. Why: selection must persist without deleting the revision snapshot.
- Multi-step writes (proposal creation, revisions, sending/accepting, demand, purchase/production orders) go through `src/features/propostas/propostas.functions.ts` with idempotent upserts on unique keys. Why: repeated actions must not duplicate documents.
- Sent/accepted revisions and issued documents are protected by database triggers, not just the UI. Why: issued commercial documents must never change silently.
- No sample/mock data in app code; missing integrations show "Integração não configurada". Why: every number shown must come from real records.
- The authenticated application rail has one route-independent visual identity; route-specific themes may style only the workspace content. Why: navigation must not shift when users move between modules.
- Item codes ([FAMILY]-NXS-[TYPE][SEQ]) are generated only by database functions (`cadastrar_produto_codificado`, `recodificar_produto`) with per-organization family+type series; a trigger blocks manual code writes. Why: no duplicates, no reused numbers, retry-safe.
- Product composition lives only in `produto_estrutura` (child quantity per parent unit, cycle-blocking trigger); revisions copy it into `revisao_componentes.estrutura` (local, editable) with `estrutura_origem` for restore. Why: catalog changes never silently alter a proposal.
- Manual/standalone items use `revisao_componentes.quantidade_avulsa` and are expanded by `expandirAvulsos` in `domain.ts` (composite = priced by children, complete = priced whole). Why: one calculation path, no double-charging parent and children.
- Reclassifying an already-coded product only via `reclassificar_produto` (records `codigo_equivalencias`, new active rules version). Why: codes are never edited freely or reused.
- Acquisition cost formulas live only in `src/features/custos/domain.ts` (versioned `CUSTO_VERSAO`, tested in `tests/custos.test.ts`); purchases go through `registrar_aquisicao` (idempotent key) and the suggested catalog cost is the weighted average written to `produto_custos`. Why: last purchase, average and adopted cost must never be swapped silently.
- Officially issued codes from spreadsheets are inserted only via `importar_produto_oficial` (not granted to app roles), which advances the series and never lowers it; supplier references are unique per supplier+code. Why: imports must not duplicate products or free used numbers.
