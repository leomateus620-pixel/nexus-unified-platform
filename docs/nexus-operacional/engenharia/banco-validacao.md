# Estudos técnicos: modelo e evidências de banco

Checkpoint41, migração0022 aplicada às 12:12:30.11955 UTC de 22/10/2026 e verificada por catálogos
às 12:13:17.36794 UTC no projeto conectado. Os cenários de negócio abaixo foram executados em
PostgreSQL16.15 descartável; a inspeção remota foi somente de schema, configuração e ledger.

## Domínios e histórico

`estudos_tecnicos` mantém a identidade e os vínculos canônicos de cliente/unidade/projeto/pessoa.
Código, tipo, cliente e unidade não são trocados. Cada `estudo_revisoes` fixa método, conteúdo,
responsável técnico e revisor. Perigos e medidas têm versões próprias; exclusão do perigo também
compara a versão da revisão para não apagar uma medida recém-alterada por outra sessão.

O fluxo é elaboração → em revisão → aprovado, com devolução para elaboração e cancelamento
justificados. Cada envio cria `estudo_submissoes` com snapshot/hash imutáveis. A decisão profissional
aponta para aquela submissão; uma correção gera outra submissão e preserva a devolvida. A aprovação
fixa snapshot final e identificação profissional declarada. Uma nova revisão copia a linhagem dos
itens, sem copiar arquivos/aprovação. Ao aprovar a sucessora, `estudo_substituicoes` relaciona ambas;
o estado “substituído” é uma projeção, sem alterar a revisão anteriormente aprovada.

`est_metodos` e `est_metodo_versoes` registram procedimento, fontes bibliográficas identificadas
por título/edição/emissor e requisitos booleanos validados por profissional cadastrado. Não há
normas, fórmulas estruturais, limites, periodicidades ou conclusão automática de conformidade.
O cadastro/registro declarado não substitui habilitação ou ART. Admin sem a atribuição profissional
necessária não submete/aprova a análise.

## Fontes e acesso

`estudo_fontes` usa FKs compostas específicas para levantamento/revisão aprovada, PE/versão
congelada ou documento emitido. O DTO traz identificação/hash/justificativa; não copia snapshots
brutos de proposta/PE, custos ou parâmetros para a ficha. Toda a leitura do estudo, seus históricos
e arquivos exige a autorização **atual** de todas as fontes históricas, inclusive as desativadas.
Isso impede que remover uma fonte da revisão libere uma submissão antiga para outro usuário.

PE novo congelado pelo comando canônico0022 fixa IDs de organização/cliente/unidade. Apenas versões
com IDs congelados verificáveis do contexto são fontes elegíveis. Versões antigas permanecem no
acervo; para utilizá-las, conferir contexto e congelar nova versão. Nomes não são convertidos em IDs.
O teste de upgrade cria o congelado antes da migração, comprova original/hash intactos e executa a
recuperação sem backfill. A função PE é comparada integralmente à0014, exceto pelos três campos.

Documentos sem `snapshot.contexto` verificável e nexo de revisão são recusados. O emissor Comercial
existente foi preservado; habilitar documentos contextuais depende do domínio de documentação.
Referências bibliográficas do método não dependem desse emissor. A relação com ativos instalados,
entregáveis do projeto, emissão PDF/dossiê e visita da Agenda ainda depende dos respectivos módulos.

## Execução, arquivos e concorrência

`estudo_medida_linhagens` associa uma única ação canônica à medida entre revisões. Somente a revisão
aprovada vigente libera nova instrução. O profissional escreve a instrução explicitamente; o sistema
não copia análise/fonte privada para a tarefa de Campo. Alterar a execução usa o domínio de ações,
preservando os snapshots técnicos anteriores.

`estudo_arquivos` pertence à revisão e opcionalmente ao perigo exato. Staging, confirmação e
cancelamento novos avançam a versão da revisão; retry/dedup não avançam. O perigo não é sobrescrito
pelo upload. Confirmação só pelo serviço, após validação de bytes no servidor e metadados Storage,
revalida papel, registro/atribuição e acesso às fontes sob locks. Envios pendentes bloqueiam submissão;
o manifesto só contém arquivos confirmados. Binário/metadados confirmados não são sobrescritos.

Comandos usam o ledger idempotente compartilhado, incluindo conflito da mesma chave com payload
diferente. A ordem de locks de ator é a mesma da administração de acesso; o estudo/revisão/fontes
são travados antes da decisão. Revogação de papel/registro, troca de revisor e restrição de fonte
durante espera são verificadas novamente, inclusive ao repetir um recibo/confirmar arquivo já ligado.

## Provas e limites

| Evidência | Resultado local |
|---|---|
| Instalação limpa41, upgrade40 → 41 e envelopes | Passou, sem reexecutar histórico ou perder snapshot antigo |
| `tests/db/estudos.sql` | 56 cenários de regra, revisão, isolamento e fontes |
| `tests/db/estudo-arquivos.sql` | 32 cenários de arquivo/pai/ACL/manifesto |
| `tests/db/estudos-concurrency.mjs` | 12 cenários concorrentes e invariante final de snapshot |
| Regressões anteriores de banco | Passaram no mesmo runner |
| Manifesto e scripts | 9 testes e lint passaram |
| DTOs reais locais | 5 formatos conferidos nos schemas da aplicação |

Fonte: `../evidencias/banco-local-41.json`, `schema-local-41.json`,
`schema-diff-local-40-41.json`, `verificacao-remota-0022.json` e `schema-diff-41.json`.
As 41 posições/checksums e os objetos novos foram conferidos remotamente; não houve novo grant
inesperado de aplicação. O stub Storage local testa metadados/policies; não é upload binário
por HTTP. Esses resultados não comprovam E2E conectado com Auth, sessão, binários nem emissão PDF.
Não houve fixture no banco operacional. Desempenho de carga e métricas de produção não foram medidos.
