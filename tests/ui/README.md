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

Auditoria desta entrega: `bun run test:ui:contracts -- e6c765f4`. O argumento é a revisão Git contra a qual comparar declarações de rotas, consultas, mutations, invalidações, handlers e arquivos protegidos. A auditoria de escopo é explícita e separada do CI visual, pois futuras entregas podem legitimamente alterar domínio ou backend.

## Limites

Os perfis simulam respostas autorizadas e restritas, não exercitam autenticação ou RLS. O proxy de feedback mede eventos até o segundo `requestAnimationFrame`; não mede rede nem confirmação de gravação. Zoom CSS de 200% e viewport reduzido representam ensaios de layout, não substituem zoom nativo, teclado virtual ou dispositivos físicos. Não declarar homologação ponta a ponta ou conformidade WCAG completa a partir destes testes.
