# Importação, retomada e recuperação

## Material privado e identidade

O diretório privado de trabalho contém captura estruturada, inventário, arquivos originais, metadados Drive, arestas de pastas, revisões expostas, hashes, de-para, ID de lote e planos. Esses dados não entram em Git público. Relatórios públicos guardam somente contagens agregadas, provas técnicas e fixtures sintéticas. URLs assinadas, tokens, credenciais e nomes pessoais não devem aparecer nos relatórios.

Identidade de entidade usa organização + sistema de origem + tipo + ID externo. Para locais/documentos, o ID externo inclui unidade. Sem ID próprio, a estratégia determinística e suas limitações são documentadas. Hash identifica conteúdo, não identidade de cliente ou documento. Arquivo físico não é inferido de URL de prévia/login.

## Pipeline

1. Capturar o snapshot acessível, incluindo todas as unidades, grupos, revisões e campos; registrar janela temporal e hash. `scripts/nr/inventory.mjs` normaliza e enumera referências sem executar código da origem.
2. Obter arquivos por API/exportação permitida. `reconcile-files.mjs` valida bytes, tamanho, MIME e hash; `reconcile-revisions.mjs` separa arquivo atual de revisões históricas acessíveis/indisponíveis.
3. Usar staging privado e `nr_importar_item`, por lote e em transações curtas. `prepare-import.mjs` gera planos privados por fase: clientes → unidades → modelos → locais → levantamentos → sistemas → documentos → pendências → referências/eventos. Resolver dependências por UUID persistido antes da próxima fase.
4. `prepare-files.mjs` gera pastas, preparações e vínculos confirmados por ID. `package-storage.mjs` valida novamente caminhos/bytes/hashes ao produzir o pacote privado; preparação ainda não significa upload. A transferência exige o mecanismo autorizado do ambiente conectado e confirmação canônica depois da validação.
5. `prepare-terminal-reconciliation.mjs` gera decisões finais de referências, versões históricas indisponíveis e eventos. Planos pós-Storage só atualizam sucesso quando arquivo, contexto, SHA, tamanho, MIME, estado confirmado e objeto Storage coincidem.
6. Conferir `nr_import_lotes`/itens, resultados por categoria/unidade e bytes físicos. Concluir lote somente depois de todos os itens terem resultado rastreável; declarar originais indisponíveis explicitamente.

Os scripts geram material de operação privada para o executor autorizado. DDL é aplicado exclusivamente pelos envelopes do mecanismo de migrações no projeto confirmado. Planos gerados e não executados não são migrações nem importações concluídas.

## Derivados editáveis dos DOCX

`convert-docx.mts` lê os bytes preservados em staging privado e grava conteúdo nativo, limitações e imagens extraídas, sem executar código do documento ou gravar no banco. A comparação textual independente é uma evidência separada da inspeção visual; notação matemática, mesclas, imagens e formatos não suportados conservam seus avisos e o acesso ao original.

`prepare-docx-derived.mjs` gera primeiro preparações de imagens por organização/unidade/SHA-256. Depois de receber os IDs confirmados no contexto correto, substitui somente as referências OOXML comprovadas por imagens nativas. Preparação ou arquivo local não satisfaz essa dependência. A identidade do documento derivado usa unidade + Drive ID + versão do conversor; o hash do payload cobre conteúdo, imagens, contexto e limitações, sem incorporar timestamp de captura ou caminhos locais.

`compile-docx-derived.mjs` valida os planos e produz envelopes privados para o executor autorizado; não executa SQL. Cada envelope trava os arquivos em ordem estável e revalida estado confirmado, bytes, MIME, tamanho e contexto. As relações documentais da origem exigem ID/revisão, vínculo com o arquivo e correspondência no de-para. Só cria vínculos após resultado válido do importador. Uma reexecução usa a revisão congelada em `nr_fontes.snapshot_destino`, conservando edições posteriores do usuário e os conflitos de comparação em três vias.

Os derivados são documentos adicionais em rascunho. Não substituem o arquivo, os 736 documentos originais importados ou suas revisões emitidas/superadas; não produzem aprovação ou assinatura. As 65 associações documentais explícitas permanecem ligadas aos originais corretos. Os 168 DOCX recebidos sem documento lógico explícito conservam apenas os vínculos comprovados de arquivo/local, sem inventar correspondência por nome ou TAG.

## Retomada e comparação

Guardar o mesmo lote, captura, de-para e chaves determinísticas. Em falha de conexão, consultar primeiro o resultado por identidade; repetir a mesma operação idempotente evita duplicação quando a resposta foi perdida. Lotes avançam item a item, com checkpoint e erros; não dependem da aba permanecer aberta.

Atualização compara snapshot anterior da origem, nova origem e destino atual. Se apenas a origem mudou, aplicar a evolução permitida; se o Nexus também mudou, registrar conflito sem sobrescrever edição. Ausência em nova captura não exclui entidade anterior. Corrigir associação exige evidência e nova decisão auditável, nunca UPSERT cego.

Upload interrompido conserva a preparação; retomar exige autor e permissão atuais. Se o objeto já existe, verificar seus bytes antes de confirmar, sem sobrescrever. Falha de hash/MIME/tamanho conserva o erro. Limpeza de órfãos é operação controlada após conciliação do banco/Storage, com retenção e referências verificadas.

## Recuperação

Cada migração é transacional com o ledger e lock canônico. Uma falha no envelope reverte DDL e registro juntos. Migração aplicada é histórica: nunca editar seu checksum, limpar ledger ou refazer baseline. Corrigir por nova migração aditiva. Antes de aplicar, comparar ordem/hash do manifesto com `nexus_migrations.applied`; drift impede execução.

Para retirar um lote problemático, suspender novas fases e identificar entidades pelo lote/fonte/de-para. Preservar originais, revisões emitidas/superadas, fontes e auditoria. Preferir arquivamento recuperável dos registros que permitirem essa ação. Não apagar dados anteriores ou edições posteriores do usuário, nem desfazer em cascata PET/evidência/documento retido. Decisão de compensação precisa de plano específico por item e autorização correspondente.

## Validação de entrega

`tests/db/run.sh` e `run.ps1` aplicam bootstrap isolado e ambas as pastas históricas. `scripts/migrations/test-installation.mjs` verifica instalação limpa, upgrade, repetição sem DDL, drift e rollback. As suítes NR usam somente PostgreSQL descartável em loopback. Esses testes de metadados Storage não substituem upload/download real no serviço conectado.

Tipos são gerados pelo procedimento oficial fixado em `scripts/supabase-types`, usando catálogo isolado com o manifesto completo. Build, tipagem e regressões pertinentes ficam registrados em `docs/nr/evidencias`. Capturas de laboratório são rotuladas como fixtures; a persistência real e a conciliação do lote são provas separadas.
