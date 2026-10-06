# Endurecer geração de OC/OP: idempotência por contexto, escopo único, revisão de OP antiga e concorrência

Preserva: `gerar_ordens` transacional, reconciliação, `hash_tecnico` v2, testes G01–G08/A01–A04. Nada é aplicado em produção nem executado sobre ordens reais sem autorização; as OPs de teste existentes não são apagadas.

## O que muda para o usuário
1. **Um único botão "Gerar ordens"** no Planejamento (Compras e Produção mostram o mesmo resumo): "Gerar 2 OC (Fornecedor A, B) e 1 OP". A prévia vem do servidor com a mesma função usada na execução, então as quantidades e pendências exibidas são exatamente as que serão gravadas. Se o estado mudar entre prévia e clique, a geração é recusada com "O planejamento mudou, revise a prévia".
2. **OP em rascunho desatualizada**: aparece como "Rascunho com composição antiga" com comparação item a item (antes / agora / diferença). Botão "Revisar rascunho" ajusta as quantidades do próprio rascunho e grava o novo fingerprint; a liberação continua exigindo aprovação técnica do conteúdo novo. OPs liberadas nunca são alteradas — a diferença vira pendência.
3. **Edição simultânea**: se alguém editar a proposta ou atualizar a demanda durante a geração, uma das operações espera a outra e a segunda revalida o estado; nunca gera ordens a partir de um planejamento antigo.

## Detalhes técnicos

### Banco (nova migration aditiva `drizzle/migrations/0011_...`)
- **Idempotência por contexto**: `geracao_ordens` ganha `escopo text`, `pedido_hash text`; nova unicidade `(organization_id, revisao_id, chave)` (a PK global atual deixa de ser usada para lookup; nova chave técnica `id uuid`). Em `gerar_ordens`, o lookup filtra organização + revisão + chave; se encontrado com `pedido_hash` diferente (escopo/versão/fingerprint diferentes) → erro "Chave já usada para outro pedido". Mesma chave em outra organização/revisão não devolve nem vaza resposta alheia; validação de `pode(org,'emitir_ordem')` e `is_member` ocorre **antes** do lookup.
- **Escopo explícito**: assinatura `gerar_ordens(_rev, _chave, _escopo text default 'ambas', _previa_hash text)` com `_escopo in ('ambas','compra','producao')`; UI usa `'ambas'`. `_previa_hash` = hash do plano calculado; divergente → recusa.
- **Prévia compartilhada**: `planejar_ordens(_rev, _escopo) returns jsonb` (STABLE, mesma lógica de saldo/arredondamento/reuso de rascunho, sem gravar) devolvendo ordens previstas, itens, pendências e `plano_hash`. `gerar_ordens` chama internamente a mesma rotina e grava.
- **Revisão de OP antiga**: `revisar_rascunho_op(_op uuid, _chave text)`: só `status='rascunho'`; recalcula itens pelo saldo da demanda atual descontando compromissos de **outras** ordens, ajusta/insere/remove itens do próprio rascunho (sem item duplicado), grava `hash_tecnico` atual, registra auditoria com antes/depois; idempotente por chave. `reconciliar_demanda` passa a sinalizar `op_rascunho_desatualizada`.
- **Concorrência compartilhada**: função `travar_revisao(_rev)` = `pg_advisory_xact_lock(hashtext('revisao:'||_rev))` + `select ... for update` da revisão. Chamada por `gerar_ordens`, `revisar_rascunho_op`, por um novo RPC transacional `atualizar_demanda` (substitui as gravações soltas de `gerarDemanda`) e por gatilho BEFORE em `revisao_componentes`/`sistema_componentes`/`sistemas_dimensionados` (edição da proposta). Dentro do lock, `gerar_ordens` relê revisão, `version`, `desatualizada`, `hash_tecnico` das demandas e recusa divergências.

### Servidor / interface
- `previaOrdens` passa a chamar `planejar_ordens`; `gerarOrdens` envia `escopo:'ambas'` + `plano_hash`; `gerarDemanda` chama `atualizar_demanda`.
- `Etapas.tsx`: botão único com texto vindo da prévia; painel de rascunhos desatualizados com comparação e "Revisar rascunho"; mensagens de recusa por mudança concorrente com "Atualizar prévia".

### Testes
- `tests/db/ordens.sql` novos: I01 mesma chave em outra organização/revisão não retorna resposta anterior; I02 retry legítimo devolve resposta idêntica; I03 mesma chave com escopo diferente é recusada; E01 prévia == execução (contagem e quantidades); E02 `plano_hash` divergente recusado; R01 revisar rascunho OP antigo ajusta sem duplicar e grava fingerprint; R02 OP liberada não é tocada; R03 liberação ainda exige aprovação nova.
- `run.sh`: C01 edição de `revisao_componentes` em sessão paralela durante `gerar_ordens` (pg_sleep dentro da transação) → geração recusa ou edição espera; C02 `atualizar_demanda` paralelo a `gerar_ordens` sem compromisso duplicado.
- `run.ps1`: incluir `ordens.sql` e os cenários paralelos equivalentes (Start-Job) com verificação de "FALHOU".
- Vitest/typecheck/build. Limite: banco efêmero apenas; a migration fica preparada e aplicada ao ambiente somente após aprovação deste plano.

## Limites e decisões pendentes
- Cancelamento/redução de OC/OP emitida ou liberada segue manual.
- Revisar rascunho exige nova aprovação técnica antes de liberar (comportamento intencional).
