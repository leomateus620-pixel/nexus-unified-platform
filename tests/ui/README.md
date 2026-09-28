# Laboratório de apresentação NEXUS

Este diretório não é uma rota da aplicação e não participa do build de produção. Importa o JSX real e os hooks existentes, substituindo somente Router/Start, sessão e cliente Supabase durante o teste. Nenhum usuário é criado, nenhum banco é acessado e nenhuma fixture é inserida em `src/`.

## Executar

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test:ui
```

`test:ui` inicia e encerra um servidor Vite isolado em `127.0.0.1:4190`, executa a matriz visual, verificações de acessibilidade e contratos de interação de OC/OP e das etapas. `NEXUS_UI_PORT` permite outra porta. Evidências são gravadas em `docs/ui/evidence/`; o workflow Operational UI publica esses arquivos como artifact. Os testes abortam requisições externas, exceto as fontes já usadas pela aplicação. Tentativas de injeção do antivírus local são bloqueadas e registradas separadamente.

Para inspeção interativa: `bun run dev:ui-lab`, endereço `http://127.0.0.1:4182/?page=dimensionamento`. `page` aceita `itens-comerciais`, `orcamento`, `compras`, `producao`, `resumo-executivo`, `parametros`, `historico`, `list`, `oc`, `op`. `count=17`, `100` ou `500` seleciona a carga de teste. Consulte `data.ts` para cenários. Estes parâmetros pertencem apenas ao laboratório.

## Comparar uma base

Defina `NEXUS_UI_SOURCE` para um checkout da base e `NEXUS_UI_PORT=4181`, inicie `dev:ui-lab` e execute `node tests/ui/capture.mjs before`. O teste usa as mesmas fixtures e dependências para as duas versões. Não execute builds, outros benchmarks ou edições durante a medição.

Auditoria desta entrega: `bun run test:ui:contracts -- 5286881c`. O argumento é a revisão Git contra a qual comparar declarações de rotas, consultas, mutations, invalidações, handlers e arquivos protegidos. A auditoria de escopo é explícita e separada do CI visual, pois futuras entregas podem legitimamente alterar domínio ou backend.

## Refinamento das oito abas de revisão

`test:ui` também executa `revision-checks.mjs`: 390/1024/1440/1920 px, cards com painel
aberto e 100 itens carregados, identificação repetida, zero legítimo, ausência de cálculo,
pendências de fornecedor/ordem, produção e histórico vazios, 22 parâmetros, salvamento
da fração decimal, permissões e impressão A4 nas visões comercial e interna.
As evidências específicas ficam em `docs/ui/evidence/revision-refinement/`.

`NEXUS_UI_CAPTURE_LABEL=revision-after` permite separar as capturas gerais de uma entrega
das evidências históricas `catalog-after`. Os seletores de lote e o stub da RPC de
componentes acompanham o contrato atual: inclusão no orçamento e seleção de lote são
controles independentes. `revision-edge` é exclusivamente um cenário do laboratório.
`NEXUS_UI_EVIDENCE_DIR` permite gravar toda a execução em uma pasta nova, preservando
evidências anteriores (útil também quando o Windows mantém arquivos anteriores em uso).

## Limites do laboratório

Os perfis simulam respostas autorizadas e restritas, não exercitam autenticação ou RLS. O proxy de feedback mede eventos até o segundo `requestAnimationFrame`; não mede rede nem confirmação de gravação. Zoom CSS de 200% e viewport reduzido representam ensaios de layout, não substituem zoom nativo, teclado virtual ou dispositivos físicos. Não declarar homologação ponta a ponta ou conformidade WCAG completa a partir destes testes.

## Catálogo operacional e checkpoint

A carga count=17 tem 21 componentes e 17 sistemas; 100/500 preservam a quantidade indicada. capture.mjs aceita catalog-before e catalog-after. NEXUS_UI_PHASE=visual preserva a medição anterior; performance mede novamente. catalog-checks.mjs verifica a fila, edições durante gravação, retry, seleção filtrada e a prévia de colagem.

O comparador de contratos usa a base 5286881c e enumera a exceção de coordenação de salvamento. Fórmulas, rotas, guards, migrations anteriores e transições comerciais/operacionais continuam protegidos. Os testes SQL de checkpoint estão em tests/db; no Windows, executar run.ps1 com -PostgresBin apontando para um runtime PostgreSQL isolado.
