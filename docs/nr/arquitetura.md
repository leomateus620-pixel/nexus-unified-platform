# Arquitetura e decisões de reuso

## Fronteiras existentes

`ACESSO_POR_PAPEL` em `src/lib/nexus-nav.ts` define menu e gate direto; `MATRIZ` e `public.pode()` definem ações. A organização ativa e a limpeza de caches continuam em `src/features/org/session.ts`. Clientes e unidades usam suas tabelas existentes, com CNPJ canônico conciliado pelo importador; cliente não é tenant.

`createServerFn`, autenticação, Zod e RPCs seguem o padrão do Nexus. Consultas canceláveis usam paginação/filtros no banco. Chaves de cache incluem organização, norma, cliente/unidade e filtros. Comandos usam versão esperada, chave idempotente, validação de campos e autorização no servidor. SQLSTATE `40001` exige comparar versões; não há repetição cega sobre uma edição concorrente.

Espaços confinados conciliados recebem vínculo explícito com `pet_espacos`; quatro locais exclusivamente de altura conservam sua classificação e não recebem espaço PET fictício. Não se alteram os contratos de emissão/assinatura da PET.

## Entidades específicas

`nr_locais`, `nr_sistemas`, `nr_levantamentos` e `nr_modelos` cobrem o inventário, componentes, respostas e versões de modelos. Blocos e respostas extensíveis usam JSON com versão de schema; IDs, organização, cliente/unidade, relacionamentos, estados e versões permanecem relacionais. Levantamento fixa a versão/snapshot do modelo para não reinterpretar respostas anteriores.

Na migração, os 1.344 registros em `nr_sistemas` preservam as 12 avaliações por família de cada um dos 112 locais. `dados.familia_biblioteca` identifica essa natureza e `validacao_nexus: nao_revisado` conserva a revisão pendente. Não são 1.344 equipamentos instalados. Existência, aplicabilidade, condição, ação e validação permanecem independentes; a situação ativa do registro não comprova presença física.

`nr_documentos` representa documento lógico; `nr_documento_revisoes` conserva conteúdo, snapshot, vigência e revisão. `nr_arquivos` representa objeto físico e sua integridade; `nr_arquivo_vinculos` conserva associações adicionais comprovadas, sem duplicar bytes. Uma representação PDF/Word não é outro documento lógico. `nr_pastas` é uma árvore de IDs estáveis; renomear/mover não altera proveniência ou arquivo físico.

`dados.originais_verificados` preserva o snapshot inicial da importação, e `recebimento` mantém a classificação documental cadastrada. Esses campos não substituem o estado atual da transferência. A confirmação atual usa `nr_arquivos.estado`, `bytes_verificados`, tamanho/hash/MIME e os vínculos explícitos; a interface apresenta esses dados no acervo. Confirmar um arquivo não reescreve o snapshot de um documento emitido.

`nr_pendencias` e tratativas conservam abertura, encerramento e autoria histórica. `nr_historico` é imutável. Alterações de locais geram `nr_documento_impactos` apenas para dependências explicitamente vinculadas; conteúdo emitido e snapshot permanecem intactos. A conferência fica em `nr_documento_impacto_revisoes`, com pessoa responsável, executor, motivo e versões.

`nr_import_lotes`, itens e fontes privadas conservam staging, hashes, decisões, resultados por item, erros e retomada. A origem histórica não cria contas Auth nem poderes de aprovação.

As tabelas comerciais `documentos` e `importacao_registros` não foram transformadas em GED. Documentos técnicos não recebem propostas fictícias. O mecanismo de `anexos` operacional conserva a exigência de pai operacional único. O acervo de engenharia e seu leitor continuam independentes; bibliotecas PDF/fontes compatíveis são reutilizadas sob demanda.

## Arquivos e retenção

`nexus-nr-acervo` é privado e separado do bucket operacional anterior. O limite atual é 50 MiB por objeto para PDF, PNG, JPEG, WebP, DOCX e XLSX; o endpoint de limites lê a configuração do banco. DOCX/XLSX validam ZIP, CRC, limites de descompressão e presença de conteúdo ativo, macros, criptografia e pacotes não suportados. MIME real, extensão, tamanho e SHA-256 precisam concordar.

Fluxo: preparar metadados → upload assinado sem sobrescrita → obter bytes no servidor → validar → confirmar por função de serviço → vincular. Estados intermediários e falhas permanecem recuperáveis. A confirmação de importação em lote é restrita ao executor proprietário autorizado; não é exposta aos papéis da aplicação. Credencial de serviço fica exclusivamente no ambiente servidor, nunca no browser/Git. Ausência de configuração gera erro explícito.

Downloads revalidam autorização e geram URL temporária; apenas PDF/imagens permitem prévia controlada. Caminho e nome originais, hash e MIME são imutáveis. `nome_exibicao` atende renomeação. Mover preserva bytes e identidade. Lixeira conserva retenção; qualquer revisão emitida ou superada, seja vínculo primário ou secundário, impede ocultar o original. Associação e arquivamento serializam pelo lock do objeto. Não há exclusão física genérica pelo cliente.

Consumo é medido nos metadados de `storage.objects`, separado por bucket/unidade e sem somar cada vínculo como outro objeto físico. Espaço informado de 10 GB e RAM informada de 2 GB são referências de infraestrutura cujo escopo precisa ser confirmado; não são quota disponível nem consumo medido. Banco e Storage não compartilham transação: reenvio, verificação e limpeza de órfãos exigem conciliação, nunca exclusão automática por ausência no snapshot.

## Proteções

Todas as entidades novas usam RLS e FKs de contexto; busca/listas não ampliam acesso. RPCs revalidam organização, ação, autoria e relacionamento. Modelos globais da organização podem aparecer no filtro de unidade sem ganhar cliente/unidade por edição. Eventos e fontes não aceitam escrita direta dos papéis da aplicação.

Revisões emitidas e superadas são protegidas por triggers; alterações exigem nova revisão. Substituição manual de campo vinculado exige motivo. Cálculos ficam em `src/features/nr/domain.ts`, com motor versionado, unidades explícitas e dados desconhecidos preservados. Os cinco eixos de avaliação são independentes. Resultado matemático não emite PET ou conclusão de segurança.

## Publicação técnica e leitura progressiva

A publicação interna de regras/critérios passa por `nr_modelo_publicar_tecnico`, com autenticação, capacidade de configuração e revisão, versão esperada, chave idempotente e vínculo profissional determinado no servidor. `nr_modelo_publicacao_fontes` conserva fontes oficiais correspondentes às normas, datas, versão e confronto; referências licenciadas exigem arquivo privado confirmado e declaração de autorização. O snapshot profissional e o conteúdo publicado são imutáveis. A retenção impede arquivar arquivos utilizados como evidência. As 15 regras/critérios importados permanecem em rascunho; o fluxo disponível não cria aprovação documental, assinatura, emissão ou aplicação automática.

Histórico e revisões usam páginas de metadados, normalmente 25 registros. O conteúdo atual permanece disponível ao editor e às exportações; versões anteriores, eventos completos e fontes de publicação são obtidos por RPC autorizada somente quando selecionados. IDs BIGINT de eventos são serializados como texto. Contextos derivados e indexados no histórico evitam descompactar seus snapshots na listagem; eventos novos recebem contexto ausente somente por identidade exata de registro e organização. Eventos de origem sem classificação conservam esse estado explícito.

`nr_importacao_inspecionar` oferece consulta administrativa dos lotes e itens, filtros no servidor, resultados por categoria e payload/evidência/snapshot de um item sob demanda. Exige visualização e configuração NR, como a política de fontes privadas. A inspeção não altera ou reexecuta importações. O lote capturado conserva 4.300 resultados terminais, estado `com_pendencias` e 1.040 recursos ainda sem bytes/correspondência confirmados.

## Trilha aplicada

O manifesto e o ledger conectado têm 64 entradas. As oito migrações aditivas `0038_nr_base.sql` a `0045_nr_historico_paginado.sql` foram aplicadas efetivamente pelo Lovable em envelopes transacionais; `0037_pet_listagem.sql` permanece com seu checksum histórico. As posições 63/64 e seus horários/checksums constam em `evidencias/production-migrations-63-64.json`. Instalação limpa e upgrade do manifesto, replay, rollback e preservação de auditoria preexistente foram verificados em PostgreSQL descartável; a geração oficial de tipos usa o catálogo completo de 64 entradas.

A comparação somente leitura do catálogo conectado de 64 entradas, às 20:56 UTC, confirmou 21 tabelas NR com RLS, 237 constraints validadas, 102 índices válidos e 44 funções NR sem divergências do catálogo isolado. Grants e funções proprietárias mantêm os escopos de acesso; a prova está em `evidencias/producao-catalogo-64-verificacao.json`. A consulta proprietária não substitui testes de sessão/browser ou testes negativos de papéis, executados no ambiente isolado.
