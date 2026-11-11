# Aplicar migração 0067 (coleta de campo NR-33/NR-35) — posição 90

Pré-checagem já feita: commit local b8dafafc6116b7c3de0d767e0cc45660e4e23256; arquivo drizzle/migrations/0067_nr_coleta_campo.sql com SHA-256 da5e135d…9008 (confere).

Observação: esta sessão é o chat do Lovable; a aplicação usará as ferramentas de banco desta sessão (leitura + escrita de dados), não um conector externo `query_database`.

## Passos
1. Somente leitura: identidade do projeto/banco; comparar `nexus_migrations.applied` com `scripts/migrations/manifest.json` (posição, caminho, checksum); ler históricos nativos (supabase_migrations, drizzle.__drizzle_migrations).
2. Posições 86–89 (PET 0012–0015): para cada uma, verificar hash e objetos do schema. Se aplicada nativamente, reconciliar o registro pelo procedimento Nexus (scripts/migrations/append.mjs) guardando evidência. Se pendente, aplicar o arquivo original em ordem. Parar sem escrever em caso de histórico incompleto, schema parcial ou checksum divergente.
3. Posição 90: se já registrada com o checksum, só verificar. Senão, gerar o envelope `DO` com `loadManifest` + `migrationEnvelope` e enviar em uma única chamada. Em timeout, consultar ledger/catálogo antes de repetir.
4. Verificações (leitura): registro da posição 90; `nr_coleta_revisoes` com RLS; privilégios das funções de coleta; gatilhos de proteção dos relatórios; `nr_coleta_pdf_preparar` restrita a `service_role`; bucket `nexus-nr-acervo` privado. Sem criar levantamentos, PETs ou arquivos.
5. Comprovante: projeto, commit, estado 86–90, horário UTC, caminho, posição, checksum, resultado; status aplicada / já aplicada / bloqueada. Sem validação no app publicado (não será executada).

## Risco conhecido
Em tentativa anterior (0048) o envelope não pôde ser aplicado porque a ferramenta de escrita aceita só INSERT/UPDATE/DELETE e o terminal não tem DDL. Se isso se repetir, paro no passo 3 e reporto como bloqueada.
