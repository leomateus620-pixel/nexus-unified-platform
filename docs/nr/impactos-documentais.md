# Alterações da base e impactos documentais

A migração aditiva `0042_nr_impactos.sql` registra alterações técnicas de `nr_locais` em `nr_documento_impactos`. Cada impacto referencia organização, cliente, unidade, documento lógico, revisão afetada, local e versões anterior/nova da base. Somente o vínculo explícito `nr_documentos.local_id` cria a dependência. TAGs, nomes semelhantes e outros locais não são usados para inferir associações.

O trigger compara título, descrição, TAG, classificação, família, aliases, normas, vínculo operacional e dados técnicos. Mudanças apenas administrativas de versão/data não criam impactos. O registro guarda os campos e valores anterior/novo; não altera o documento, seu conteúdo, snapshot, hash, autoria ou emissão histórica. Documentos arquivados também conservam seus impactos, que aparecerão ao restaurar o documento.

`nr_documento_impacto_revisoes` conserva conferências imutáveis por impacto, com revisão de destino, versão da base considerada, hash da revisão/conteúdo/base, pessoa responsável, usuário executor, motivo e data. As duas tabelas têm FKs compostas, RLS, índices e bloqueio de alteração/exclusão. Papéis da aplicação recebem apenas leitura direta; a conferência passa pelo RPC autorizado.

`nr_documento_revisar_impactos` exige uma nova revisão vigente em rascunho, diferente das revisões afetadas, motivo e versões esperadas do documento e da base. Confere `revisar_nr`, `editar_nr` e o mecanismo profissional existente `lev_profissional`: pessoa ativa vinculada ao usuário, registro profissional declarado e permissão operacional de revisão. Ser administrador do software não basta. Essa declaração não substitui a verificação externa de habilitação ou ART.

O comando toma os locks na ordem local → documento → revisão e usa a infraestrutura canônica de idempotência. Uma resposta perdida pode ser repetida com a mesma chave; alterações posteriores da base continuam pendentes. Mudanças concorrentes recusam a versão antiga. O vínculo local não pode ser substituído enquanto houver impactos pendentes, evitando torná-los inacessíveis à conferência.

A confirmação de impactos **não aprova, emite ou assina documentos, nem emite PET ou autoriza entrada**. Alterações do conteúdo e dos parâmetros devem ser conferidas pelo responsável na nova revisão antes de registrar a decisão. O comando não reconstrói documentos automaticamente.

A consulta documental traz os impactos recentes, quantidade pendente, indicação de revisão necessária, versão atual da base e disponibilidade/bloqueio da ação. Listas recebem indicadores por uma única consulta em conjunto; o painel conta documentos afetados dentro da organização/norma/cliente/unidade. Não há requisição individual por documento da lista. A projeção de levantamentos continua usando a versão fixada do modelo.

A interface mostra os valores preservados, solicita nova revisão e oferece a conferência somente quando disponível. Sem vínculo profissional autorizado, apresenta o motivo sem conceder poderes. As configurações consultam o consumo real informado pelo banco, discriminado por unidade/bucket, revisões, uploads, falhas e lotes; capacidade de armazenamento e memória informadas não são tratadas como quota ou consumo medido quando seu escopo não está confirmado.

## Validação

`tests/db/nr-impactos.mjs` usa somente PostgreSQL descartável em loopback. As 25 verificações cobrem preservação do snapshot/conteúdo/hash emitidos, alteração real do local, ausência de impacto em locais/unidades sem vínculo, identidade compartilhada NR-33/NR-35, profissional obrigatório, papéis/organizações indevidos, RLS, eventos imutáveis, nova revisão, versões esperadas, idempotência e edição concorrente. O ensaio não escreve em dados reais.

As capturas `laboratorio-impactos-conferencia.png` e `laboratorio-consumo-configuracoes.png`, em `docs/nexus-operacional/nr/evidencias`, são do laboratório com fixtures sintéticas. Mostram apresentação e interação dos componentes reais; a persistência e as permissões são verificadas separadamente no PostgreSQL descartável. Não constituem prova de uma conferência profissional em produção.
