# Perfis de contrato e gates da evolução

O verificador histórico de apresentação e o contrato da evolução operacional têm escopos diferentes. A separação é explícita nos scripts; o histórico permanece disponível e continua falhando quando os seus contratos deixam de ser preservados.

## Perfil operacional

`bun run test:ui:contracts` executa `scripts/nexus-operacional/contracts.mjs`, com base fixa `820c79d60055a25e2d56bf60a091f032c5e7a8bf`, auditada no início desta tarefa.

O gate compara o conteúdo Git dos 134 arquivos protegidos: motores de orçamento/custo, catálogo, comandos transacionais de propostas, 30 migrações históricas, cenas e assets públicos. Também recusa novos arquivos não rastreados nessas áreas. Mudança protegida produz exit code 1 e relatório `evidencias/contratos-preservados.json`. A exceção autorizada é apresentação/acesso da biblioteca, fora do código das cenas.

Esse perfil permite as alterações funcionais autorizadas de acesso, clientes, operação e engenharia documental; não presume que novas consultas devam ser idênticas ao backend antigo. Não comprova sozinho schema novo, RLS, persistência, acessibilidade ou desempenho das cenas.

## Comparador histórico preservado

`bun run test:ui:legacy-contracts` executa `tests/ui/contracts.mjs`. Sua base padrão continua `e4dea2acae5b6649674e4d5640f2b8f02aac03e2`; uma base pode ser informada como argumento, como no uso histórico. Seu relatório continua em `docs/ui/evidence/catalog-contracts.json`, ou no diretório definido por `NEXUS_UI_EVIDENCE_DIR`.

Esse comparador protege hashes e compara AST de rotas, requests, hooks e handlers sob a exceção de salvamento definida naquela entrega. O perfil operacional não muda essa exceção nem redefine silenciosamente sua base. Mudanças funcionais posteriores e autorizadas tornam o resultado histórico diferente, de modo que ele não é o gate de preservação da presente evolução.

Foi corrigido somente o crash do printer TypeScript ao encontrar declaração sem inicializador: nó ausente recebe marcador explícito `<missing-node>`, preservando a comparação. A diferença antes/depois continua registrada e falha com exit code 1. O crash anterior e o resultado histórico posterior devem permanecer em `validacao.md`; não representam uma aprovação do comparador antigo.

## Gates complementares

| Gate                                  | Comprovação e limite                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:operacional`            | Schemas de pessoas/arquivos/clientes/engenharia, roles/nav/cache, paridade TS/SQL das capacidades, manifesto e preservação das áreas protegidas; não é teste de banco real |
| `bun run test:orcamento`              | Referências dos motores, estrutura, aquisição, importação, coordenação de salvamento e autorização existentes                                                              |
| `bun run test:db`                     | Instalação limpa e upgrade, ledger/checksum, FKs, RLS por tenant, comandos, idempotência, versões e concorrência; PostgreSQL isolado não comprova ativação remota          |
| `bun run typecheck` e `bun run build` | Contratos de compilação e produção local                                                                                                                                   |
| `bun run test:ui`                     | Laboratório visual/interação com fronteiras de backend substituídas; não comprova RLS ou Storage conectado                                                                 |
| Scripts 3D existentes                 | Gates específicos conforme CI/arquivos tocados; comparação de conteúdo não substitui teste de câmera/controle ou medição em dispositivo                                    |

Exemplos concretos dos testes novos: papel vazio/desconhecido não concede menu ou custo; `/projetos` não concede `/projetos-engenharia`; coordenação não concede admin ou revisão técnica; schemas recusam IDs extras e limites inválidos; modelo documental exige proveniência e IDs estáveis; banco rejeita vínculo entre tenants e concorrência incompatível.

O workflow `Operational UI` continua executando o laboratório UI. O script de contrato estático é um gate separado; sua existência no package.json não significa que um job remoto já o executou. Resultados locais, CI e aplicação no ambiente conectado devem ser registrados separadamente.

## Execução local deste ajuste

Windows, Node 24.15.0, 22/10/2026; comandos executados com `npm run` sobre o lockfile/dependências existentes, sem alterar dependências:

| Comando                                                                 | Resultado observado                                                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:ui:contracts`                                             | Exit 0; 134 arquivos protegidos, nenhuma alteração e nenhum arquivo inesperado                                                                                              |
| `npm run test:operacional`                                              | Exit 0; 48 testes em seis arquivos, nove testes de manifesto e o contrato dos 134 arquivos passaram                                                                         |
| `npm run test:ui:legacy-contracts`                                      | Exit 1, sem crash AST; 56 arquivos históricos comparados por hash, oito diferentes; transições históricas diferentes; 70 arquivos comparados e 13 com diferenças funcionais |
| ESLint de `tests/ui/contracts.mjs` e Prettier dos arquivos deste ajuste | Sem erros                                                                                                                                                                   |

O [relatório histórico completo](evidencias/legacy-contracts/catalog-contracts.json) conserva as diferenças, inclusive mudanças de motores já presentes entre a base histórica e a base operacional auditada. Sua reprovação não é convertida em aprovação nem atribuída integralmente às mudanças desta branch. Nenhum teste de browser/UI foi executado neste ajuste.
