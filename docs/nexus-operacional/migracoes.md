# Migrações e reconciliação

## Base examinada

Auditoria local em 22/10/2026 a partir de `820c79d60055a25e2d56bf60a091f032c5e7a8bf`.
A base tem **18 arquivos Supabase + 12 Drizzle**, que declaram 46 tabelas de aplicação.
O runner histórico aplica todas as Supabase em ordem de nome e depois todas as Drizzle.
As migrações históricas permanecem intactas. Não aplicar as duas pastas como representações alternativas:
elas são cadeias complementares, com funções substituídas progressivamente.

Dependências decisivas:

| Objeto                                                                      | Origem                                             | Dependência posterior                    |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| Organizações, memberships, papéis, clientes, catálogo, revisões, documentos | Supabase inicial                                   | Todas as features                        |
| `public.pode()` e comandos de suprimentos                                   | Supabase `20260927212855…`                         | Policies, ordens, catálogo               |
| Checkpoints e salvamentos                                                   | Supabase `20260928010000…` e correções posteriores | Coordenador de proposta                  |
| Códigos oficiais e séries                                                   | Supabase `20261001140449…` e `20261001140514…`     | Drizzle `0000`, `0002` e importação      |
| Estrutura, itens avulsos, custos e aquisições                               | Drizzle `0000`–`0008`                              | Motor canônico e suprimentos             |
| Matriz vigente histórica de `pode()`                                        | Drizzle `0009`                                     | Novos comandos devem preservá-la         |
| `hash_tecnico`, geração transacional                                        | Drizzle `0010`                                     | Drizzle `0011`                           |
| `_plano_ordens`, `travar_revisao`, chave contextual                         | Drizzle `0011`                                     | Operação integrada; não duplicar geração |

Não existe DDL histórico local de bucket Storage, scheduler, `pg_cron`, reservas temporais ou
cadastro de pessoas. A disponibilidade real do banco conectado precisa ser registrada separadamente
pelo responsável pela reconciliação; ausência no SQL local não comprova ausência remota.

## Trilha de evolução

Novos arquivos seguem **somente `drizzle/migrations/0012_…` em diante**, depois das 30 migrações
históricas. Isso mantém disponíveis os objetos criados em Drizzle quando a fundação operacional roda.
Nenhum DDL novo é duplicado em Supabase. Não editar uma migração já aplicada; uma correção posterior
ganha outro arquivo.

Ordem desta entrega: `0012` fundação/pessoas/ações/autorização; `0013` clientes;
`0014` projetos de engenharia; `0015` anexos privados; `0016` fundação temporal;
`0017` arquivos de engenharia; `0018` worker/scheduler; `0019` administração de vínculos.
`0020` corrige a revalidação do autor na confirmação privilegiada de anexos operacionais e originais
de engenharia. `0021` acrescenta Levantamentos Técnicos, coleta/revisão, arquivos privados e adoção
explícita de medidas no dimensionamento existente. O manifesto contém 40 arquivos; seus hashes
finais ficam no próprio manifesto. Até `0021` estão aplicadas no ambiente confirmado; novos arquivos
começam em `0022` e não podem alterar os checksums publicados.

`scripts/migrations/manifest.json` define ordem e SHA-256 do SQL UTF-8 com CRLF normalizado para LF.
A normalização permite comparar checkouts Windows/Linux sem mascarar mudança de conteúdo SQL.
Acrescente arquivos ao fim, explicitamente, após terminar a revisão:

```powershell
node scripts/migrations/append.mjs drizzle/migrations/0012_operational_foundation.sql [demais arquivos novos]
node scripts/migrations/run.mjs --check
node scripts/migrations/run.mjs --plan
node --test scripts/migrations/manifest.test.mjs
```

O manifesto recusa checksum divergente, caminho fora das pastas, duplicação e SQL não inscrito.
DDL não deve conter `BEGIN;`, `COMMIT;` ou `ROLLBACK;`: o executor controla a transação que une DDL e
ledger. Os comandos acima conferem arquivos; não acessam o banco.

## Execução e ledger

```powershell
# A URL é recebida apenas do ambiente seguro, nunca impressa.
node scripts/migrations/run.mjs --apply
```

`--apply` usa `LOVABLE_DB_MIGRATION_URL`, uma conexão, advisory lock e uma transação para SQL e ledger
privado `nexus_migrations.applied`. O resultado só é reportado depois do commit. Repetição confere o
prefixo aplicado e executa apenas o sufixo pendente; checksum ou posição divergente bloqueiam a operação.
Falha de DDL reverte a transação. O executor não registra conteúdo de linha ou credencial no erro.

**Banco existente sem esse ledger é recusado.** Os históricos nativos de
`supabase_migrations.schema_migrations` e `drizzle.__drizzle_migrations` não são prova suficiente de
ausência de drift: é necessário conferir versões, SQL/checksums disponíveis e objetos/policies do schema.
Depois dessa conferência, a adoção da baseline deve registrar as 30 entradas verificadas sem
reexecutar seu DDL. Não existe opção que presuma schema reconciliado ou transforme `IF NOT EXISTS` em
prova de equivalência. Uma aplicação pelo conector deve manter os mesmos nomes, ordem e hashes e
registrar ambiente e commit efetivos; o conector não deve receber fixtures de teste.

Para instalar uma baseline isolada antes de exercitar upgrade:

```powershell
node scripts/migrations/run.mjs --apply --through drizzle/migrations/0011_ordens_idempotencia_contexto_trava_revisao.sql
# Preparar dados apenas no cluster descartável; depois aplicar o sufixo.
node scripts/migrations/run.mjs --apply
node scripts/migrations/run.mjs --apply
```

## Segurança da fundação

`0012` mantém a matriz histórica e passa a exigir membership ativa em `pode`, `has_org_role` e
`can_see_costs`. Antes, uma role órfã podia continuar autorizando acesso após remover membership.
Pessoas, equipes, qualificações, ações e anexos têm organização e FKs compostas nos vínculos novos.
Writes autenticados passam pelos comandos; author e histórico são produzidos no banco, com
`expected_version`, chave idempotente, conflito de payload e locks. Recibos idempotentes não são
consultáveis diretamente pelo usuário porque contêm snapshots que poderiam sobreviver à revogação do papel.

Buckets e jobs são operações separadas: o teste SQL de Storage contém apenas seu schema mínimo de
metadados, para verificar policies e comandos. Ele não comprova upload/download de binário, hash
calculado no servidor, assinatura temporária ou funcionamento do serviço remoto.

## Recuperação

Antes de qualquer aplicação compartilhada: conferir projeto/repositório/banco, ledger, drift, snapshot
de recuperação e compatibilidade com o frontend atual. Novas tabelas e comandos são expansão; não
há truncamento, reset, regravação de documento emitido nem backfill de pessoas fictícias.

Se a transação falhar, corrigir o SQL ainda não aplicado e repetir com o mesmo manifesto revisado.
Se uma migração já foi confirmada, criar correção append-only; não modificar o hash do histórico.
Desativar uma feature por código/configuração pode limitar efeitos novos, mas não autoriza remover
seus dados ou histórico. Restauração de backup é decisão operacional distinta, dependente do ambiente.

## Evidência executada

| Verificação                                                   | Ambiente                                                    | Resultado observado                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 30 migrações históricas, cenários S/T/C, ordens e checkpoints | PostgreSQL 16.15 portátil; cluster descartável; porta 55445 | Passaram; includes 25 cenários e concorrência de ordens/checkpoints                           |
| 30 históricas + `0012`, `0014`, `0015`, regressão histórica   | PostgreSQL 16.15; cluster descartável; porta 55446          | Instalação e regressão histórica passaram antes de acrescentar os novos cenários operacionais |
| Manifesto/ordem/checksums                                     | Node local                                                  | 9 testes passaram com as 30 históricas; novas migrações exigem inscrição final                |

Rodada final local (PostgreSQL 16.15, cluster descartável, porta 55446):

- 38 migrações em instalação limpa e upgrade 30 → 38, preservando cliente existente.
- Retry sem reexecução de migração; drift e schema preexistente sem reconciliação rejeitados.
- DDL que falha reverte tanto objetos quanto ledger.
- Nove testes de manifesto/checksums; regressão histórica de isolamento, imutabilidade, ordens e checkpoints.
- Clientes 28 cenários, projetos de engenharia 19, arquivos de engenharia 19,
  fundação/pessoas/qualificações/ações/Storage 45, agenda temporal 38, administração 16 e scheduler 3.
- Oito cenários operacionais com sessões concorrentes, além das concorrências históricas:
  retries, versão de pessoa, vínculo temporal, payload divergente, publicação de evento,
  reagendamento, dez retries da publicação e remoção simultânea de administradores.

Comando da rodada final:

```powershell
& tests/db/run.ps1 -PostgresBin 'C:\Users\Leonardo\Desktop\expo-logistics-hub\.git\dashboard-db-runtime\postgresql\pgsql\bin' -Port 55446
```

O runtime foi verificado como PostgreSQL 16.15; não faz parte das dependências distribuídas da aplicação.
O mesmo runner em Linux é `tests/db/run.sh`, usando PostgreSQL instalado no ambiente de CI.
A execução Linux não foi feita nesta rodada local.

## Conector e baseline do ambiente confirmado

`schema-fingerprint.sql` consulta somente catálogos. A comparação do snapshot local das 30 migrações
com o remoto revelou relações, constraints, índices, triggers e policies equivalentes. A única
diferença de função (`diferencas_comerciais`) é indentação: corpo normalizado por linha,
`search_path`, volatilidade e `security_definer` coincidem. Os privilégios remotos incluem defaults
Supabase adicionais: 74 diferenças em grants de função e 480 em tabela. Isso não é tratado como
prova de privilégio mínimo; `0012` revoga TRUNCATE/REFERENCES/TRIGGER de anon/authenticated em todas
as tabelas públicas, mantendo DML legado sob RLS e restringindo os objetos novos.

Há uma equivalência explícita de identificador: o conteúdo local
`20260928010000_proposta_checkpoints.sql` corresponde ao histórico nativo `20260928034547`, nome
`e46c9068-5882-42ae-bb5d-032c68da19aa`. As 195 linhas não vazias coincidem após normalizar CRLF,
indentação e linhas em branco. O manifesto registra `nativeVersion`, sem renomear ou alterar SQL.
As outras 17 versões Supabase e os 12 hashes Drizzle coincidem. Evidências estão em
`evidencias/schema-diff-antes.json`, `checkpoint-native-equivalencia.json` e `ledgers-nativos-antes.json`.

Para o conector que recebe uma instrução por chamada:

```powershell
node scripts/migrations/connector-batch.mjs --output DIRETORIO_TEMPORARIO --baseline-evidence docs/nexus-operacional/evidencias/schema-remoto-antes.json
```

O gerador produz uma única instrução `DO` por arquivo. O primeiro `DO` verifica os históricos nativos
18+12 e o fingerprint capturado do projeto confirmado, então registra a baseline com
`origin=baseline_reconciled` e SHA-256 da evidência. Nenhum DDL histórico é reexecutado. Os `DO`s
seguintes validam todo o prefixo de hashes/posições, retornam sem DDL quando já aplicados e unem
o SQL original ao INSERT do ledger (`origin=applied`) na mesma instrução PostgreSQL. Um erro reverte
ambos. Não há suposição de transação abrangendo várias chamadas do conector.

O gerador foi provado em PostgreSQL real: baseline/fingerprint/hash nativo divergentes rejeitados,
proveniência registrada, oito migrações e retries aplicados e falha de DDL revertida com ledger.
Os históricos nativos usados nesse teste são metadados de teste isolados; a conferência remota usa
os snapshots reais separados. Nenhum registro operacional de teste é enviado ao ambiente conectado.

## Aplicação compartilhada em 22/10/2026

**APLICADA + VERIFICADA SCHEMA** no projeto Lovable confirmado com este repositório:
baseline reconciliada e oito novas migrações (`0012`–`0019`), totalizando 38 entradas no ledger.
Foram executados os envelopes únicos na ordem revisada; os hashes foram comparados após a aplicação.
As migrações novas passaram a ser histórico publicado e não devem ser editadas; correções usam `0020+`.

Pós-aplicação observado pelo responsável pela conexão:

- Bucket `nexus-operacional` privado, limite de 20 MiB.
- `pg_cron` 1.6.4 instalado e job `nexus-agenda-notificacoes` ativo a cada minuto.
- Disparo automático observado às 09:05:00 UTC com estado de sucesso, zero itens processados e zero falhas.
- Nenhuma fixture operacional inserida no banco conectado.

O disparo com fila vazia comprova o agendamento e a execução do worker. Não comprova uma jornada
de atribuição/notificação com usuário real, RLS remoto com perfis distintos, upload/download HTTP,
hash de binário remoto ou E2E autenticado. Esses alcances permanecem separados das evidências
locais de banco e da verificação de schema. O fingerprint local posterior (`schema-local-depois.json`)
contém 73 relações, 106 funções, 136 policies, 406 constraints, 168 índices e 63 triggers de aplicação;
a comparação por objeto com o snapshot remoto posterior documenta o estado reconciliado.

No checkpoint de 38 migrações, `schema-diff-depois.json` confirma igualdade por objeto de todas as
73 relações, 406 constraints, 168 índices, 136 policies e 63 triggers. Das 106 funções, a única
diferença permanece em `diferencas_comerciais`, anterior a esta entrega e comprovada como indentação.
Os grants remotos têm 125 diferenças em funções e 415 em tabelas. As diferenças de anon/authenticated
continuam em objetos históricos; os objetos novos não têm divergência de grants desses dois papéis.
Os privilégios TRUNCATE/REFERENCES/TRIGGER de anon/authenticated foram removidos como previsto.
Os demais defaults de plataforma/service_role e o DML legado foram preservados e não representam
paridade irrestrita de privilégio mínimo. O resumo classificado está em
`evidencias/reconciliacao-depois-resumo.json`.

## Correção de confirmação de arquivo — `0020`

A revisão após aplicar `0015`/`0017` identificou uma janela entre a checagem feita pelo handler e a
confirmação service-only. Membership existente não basta quando o papel/capacidade foi revogado ou
quando o pai foi reatribuído durante o upload. `0020` é append-only e não modifica o SQL publicado.

O predicado operacional de papel/capacidade passa a receber autor explícito internamente, e o
predicado da sessão delega a ele; a matriz não é duplicada. O leitor de anexo e a confirmação usam
o mesmo escopo. Os helpers de autor explícito não são executáveis por anon/authenticated/service_role.
As confirmações travam dados atuais do autor e pai antes de revalidar permissão, inclusive em retry
de arquivo já vinculado. Revogação de papel/capacidade, alteração da pessoa e reatribuição do pai
não podem atravessar a gravação sem que uma das transações espere. Deadlock de uma transação
administrativa direta excepcional é abortado pelo PostgreSQL e exige retry; não autoriza confirmação.

O contrato de bytes permanece no servidor: a migração não transforma metadados Storage em prova
de conteúdo nem substitui download, MIME, tamanho e SHA-256 verificados pelo handler.

Rodada local final com `0020`: PostgreSQL 16.15 descartável, porta 55450, exit 0. Instalação limpa
e atualização 30 → 39 passaram, com preservação do cliente existente, retry, rollback DDL/ledger e
envelopes DO. A regressão anterior passou novamente. Os 12 cenários novos de autorização e cinco
disputas reais comprovam espera em lock e rejeição após revogação de papel, capacidade, atribuição
da ação e escopo de projeto de engenharia, inclusive retry já vinculado. A evidência permanece de
banco local/metadados Storage. `banco-local-final.json` registra hashes; `schema-local-39.json`
registra o catálogo esperado. A aplicação remota desta corretiva é registrada a seguir.

**`0020` APLICADA + VERIFICADA SCHEMA** às 09:23:13.760269 UTC de 22/10/2026, pelo mesmo conector
no ambiente confirmado. O ledger tem 39 entradas e o checksum da fonte é
`0f9e80d67f56addacbb7ef305a7e2a803c622b29286e888704111bc22c87bccc`.
`verificacao-remota-0020.json` confirma que a função de confirmação não é executável por
authenticated e é executável por service_role, e que o helper de autor explícito é privado.
Nesse checkpoint, a sequência corretiva iniciou em **`0021+`**, sem alterar as nove migrações então aplicadas nesta entrega.

O diff final `schema-diff-final39.json` compara os snapshots local e remoto após `0020`:
73 relações, 406 constraints, 168 índices, 136 policies e 63 triggers coincidem por objeto.
Das 108 funções, somente `diferencas_comerciais` mantém a divergência histórica de indentação já
comprovada. Permanecem as mesmas 125 diferenças de grants de função e 415 de tabela do checkpoint38,
sem grants novos inesperados de anon/authenticated. Nenhuma fixture foi usada no banco conectado.
Essa prova de catálogo e aplicação não substitui os testes remotos autenticados e de bytes HTTP
explicitamente pendentes.

Para recuperar falha futura: conservar o ledger e as fontes atuais, conferir o checksum da migração
e o prefixo completo antes de retry. Não remover a entrada39 nem restaurar a função vulnerável.
Qualquer mudança no contrato ou incompatibilidade deve receber migração corretiva `0021+`, testada
tanto em instalação limpa quanto no upgrade39 → próximo checkpoint. Revogações confirmadas não
podem ser desfeitas para permitir reprocessamento; o usuário precisa recuperar acesso por comando
administrativo autorizado ou outro responsável deve preparar seu próprio envio permitido.

## Levantamentos Técnicos — `0021`

**APLICADA + VERIFICADA SCHEMA** às **11:19:38.549955 UTC de 22/10/2026**, no projeto Lovable
`91380c2d-559c-4527-b3a4-1a8bc1e19f69` confirmado pelo responsável antes da aplicação. Foi usado o
envelope atômico `0040_0021_levantamentos_tecnicos.sql`, após conferir ledger39 e ausência dos novos
objetos. O SHA-256 normalizado da fonte é
`c1d415564f7ff3974655d6076be5aa61ffb75d0a7270918f1a050fc90ef80027`.
O envelope revisado tem SHA-256 `1474f0936acd2d66e9b1e93d87294729dfc5f07e54765fba4b3bcf0ee1c2c95e`.

A verificação posterior foi somente leitura de catálogos, configuração do bucket e ledger. As 40
entradas coincidem com o manifesto por nome, posição e checksum. As nove novas tabelas têm RLS,
SELECT autenticado sujeito a RLS e nenhuma escrita direta de aplicação. Helpers internos
privilegiados não têm EXECUTE para anon, authenticated ou service_role; a confirmação de arquivo
permanece somente service_role. Upload e download usam duas policies específicas no bucket privado
`nexus-operacional`, cujo limite continua em 20 MiB. Não foram consultados registros pessoais nem
inseridas fixtures no ambiente conectado.

`schema-diff-40.json` confere os snapshots local/remoto por objeto: **82 relações, 503 constraints,
204 índices, 145 policies públicas e 74 triggers coincidem**. Das 129 funções, só permanece a
indentação histórica já comprovada de `diferencas_comerciais`. Há 126 diferenças de grants de função
e 415 de tabela. A única diferença nova de grant é EXECUTE de service_role no predicado dimensional
puro e imutável `lev_unidade_compativel`, sem SECURITY DEFINER e sem leitura de dados. Os defaults
legados de plataforma permanecem documentados; não há grant novo inesperado de anon/authenticated
nem exposição de helper privilegiado. As duas policies Storage foram verificadas separadamente,
pois o fingerprint público não inclui o schema Storage.

Evidências: `evidencias/verificacao-remota-0021.json`, `schema-local-40.json`,
`schema-remoto-40.json`, `schema-diff-40.json` e `banco-local-40.json`. Localmente passaram a
instalação limpa40, upgrades30 → 40 e **39 → 40 preservando pessoa e auditoria**, retries,
rollback de DDL/ledger, envelopes DO, regressão anterior, 47 cenários de levantamento, 28 de arquivos
e 12 interleavings com sessões concorrentes. Os testes de banco usam PostgreSQL16.15 descartável;
Storage local comprova metadados/policies, sem simular bytes HTTP.

O schema compartilhado está verificado. E2E remoto com Auth, perfis, Storage HTTP e binários continua
separado e não foi comprovado por esta inspeção. Vínculo de visita à Agenda, fila offline e emissão
PDF permanecem dependências explicitadas no alcance desta etapa. Nenhuma norma ou certificação
foi embarcada; registro profissional no cadastro é informação declarada e não substitui habilitação
ou responsabilidade técnica aplicável.

**Novas migrações usam `0022+`.** `0021` e seu envelope agora são histórico aplicado. Não remover
entrada40, rebaixar permissões ou alterar fonte/checksum para recuperar falha. Antes do próximo
upgrade, conferir os 40 hashes e o catálogo esperado; usar nova migração aditiva, testar instalação
limpa e upgrade40 → próximo checkpoint. As constraints novas são compatíveis com a aplicação atual,
e não há backfill operacional, reset, truncamento ou modificação de revisão comercial emitida.

## Estudos Técnicos — `0022` / checkpoint41

**APLICADA + VERIFICADA SCHEMA** às **12:12:30.11955 UTC de 22/10/2026**, no projeto Lovable
`91380c2d-559c-4527-b3a4-1a8bc1e19f69`. A inspeção posterior ocorreu às 12:13:17.36794 UTC.
A fonte
`drizzle/migrations/0022_estudos_tecnicos.sql` tem SHA-256 normalizado
`0ea1a9597eebb66f835a3d017c00d3697bff3a314522366889ffdd689d7e004b` e ocupa a posição41 do
manifesto, depois das 40 migrações aplicadas. Não reaplicar as cadeias históricas por outro runner.

A migração acrescenta 13 tabelas com RLS e leitura autenticada autorizada; escrita apenas pelos
comandos de domínio. Métodos/fontes bibliográficas, submissões e decisões são versionados; snapshots
aprovados são imutáveis. Revisões substituídas recebem uma relação posterior, sem UPDATE no original.
Fontes operacionais têm FKs explícitas e interseção atual de acesso inclusive às fontes históricas
desativadas. A confirmação de evidência é exclusivamente service_role, com revalidação de autor,
papel/registro/atribuição e fontes depois dos locks. As duas novas policies Storage não permitem
sobrescrita ou remoção do original; permanece o bucket privado existente de 20 MiB.

Há uma evolução deliberada em função existente: o ramo `congelar` de `pe_executar` passa a incluir
IDs de organização, cliente e unidade no snapshot **novo**. O teste compara a função completa com
a fonte0014, retirando somente os três campos adicionados, para preservar seus demais ramos. Não
existe backfill por nomes. PE congelado sem esses IDs continua intacto no acervo e é recusado como
fonte de estudo; a recuperação consiste em conferir contexto, criar nova versão e congelar.

Documentos legados sem contexto congelado também não são apresentados como fontes de unidade.
O contrato aceito exige `snapshot.contexto` com IDs de organização/cliente/unidade e nexo comprovado
documento → revisão → proposta. O emissor Comercial não foi alterado; a biblioteca técnica/emissão
contextual continua como dependência explícita. As fixtures contextuais só exercitam esse contrato
no banco descartável, sem representar uma emissão disponível em produção.

Passaram PostgreSQL16.15 em instalação limpa41 e upgrade40 → 41, pessoa/auditoria preservadas,
PE congelado antes do upgrade com snapshot/hash intactos, recusa de fonte legada e recuperação por
nova versão, retries, rollback de DDL/ledger, envelopes atômicos, todas as regressões anteriores,
56 cenários SQL de estudos, 32 de arquivos e 12 cenários concorrentes reais mais a invariante final
dos snapshots. Revogações durante espera usam `pg_blocking_pids`, não apenas execução sequencial.
Também passaram nove testes do manifesto e lint dos scripts alterados; cinco DTOs reais de fixtures
locais foram conferidos nos schemas da aplicação. Comando e alcance: `evidencias/banco-local-41.json`.

`schema-local-41.json` contém 95 relações, 643 constraints, 254 índices, 158 policies, 87 triggers e
158 funções. `schema-diff-local-40-41.json` registra 284 objetos adicionados, nenhum removido e
somente `pe_executar` alterada entre os objetos anteriores. A pós-verificação comparou esses objetos
com `schema-remoto-41.json`: relações, constraints, índices, policies e triggers coincidem. A única
diferença de definição permanece a indentação histórica de `diferencas_comerciais`; o novo corpo PE
coincide, incluindo os IDs de contexto. As 541 diferenças de grants são as 126 de função e 415 de
tabela já conhecidas na plataforma; **nenhuma diferença de grant do novo módulo**. Os 13 novos
cadastros têm RLS e SELECT autenticado, sem escrita direta de aplicação ou SELECT de anon/service.
Helpers internos continuam sem EXECUTE de aplicação; confirmação de arquivo é somente serviço.
As duas policies Storage e o bucket privado20MiB foram conferidos separadamente.

Storage local cobre metadados/RLS; Auth, sessão e upload/download de bytes pelo serviço conectado
continuam como E2E separado. Não houve fixture operacional no projeto conectado. Evidências remotas:
`preflight-remoto-0022.json`, `schema-remoto-pre-0022.json`, `verificacao-remota-0022.json`,
`schema-remoto-41.json` e `schema-diff-41.json`.

A aplicação usou o envelope único da posição41, SHA-256
`f1350231f06bba47a21b9006abad9cba1fff2281ef4fe5c0a508d1199aae1a2a`, após conferir o ambiente,
os 40 hashes, a ausência das novas tabelas e o catálogo inteiro sem drift desde checkpoint40.
O ledger posterior tem 41 entradas exatas; DDL e recibo foram gravados na mesma transação.
Não editar esta fonte nem apagar a posição41: qualquer correção recebe `0023+`. O código anterior
continua compatível com as tabelas aditivas e os campos extras de novos snapshots PE. Uma falha
posterior deve ser diagnosticada sem revogar proteção de arquivos/revisões ou inferir contexto por
nomes; usar correção aditiva e repetir instalação limpa/upgrade41 → próximo checkpoint.
