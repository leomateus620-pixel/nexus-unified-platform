# Fábrica de Ração — Santa Rosa: refinamento visual

Entrega de 05/11/2026 na branch `codex/cotrirosa-visual-quality`. Checkout recebido: `dbe4560d3fc4c5e8eaab3e4b16b0c35d72ddb2a9`. Após fetch, a base de execução foi `origin/main` em `9cc9603e42c4930c6d7df5986c176aac5b1ea635`, exatamente a referência do pedido. Alterações locais anteriores fora do mapa foram preservadas. Não houve escrita em produção, migração, rebase ou alteração de histórico publicado.

Prévia compilada local: <http://127.0.0.1:4197/nr-33/mapa-3d?cliente=9d6dfbe8-285a-44e5-9ea1-2574daa7cb28&unidade=6a454dcc-82b2-4506-aca3-410a3cc820f2&camera=normal>. Caminho: **NR-33 ou NR-35 → COTRIROSA → Fábrica de Ração — Santa Rosa → Mapa 3D**. Usa componentes, rotas e RPCs reais do Nexus no laboratório SQL isolado existente, com autenticação e registros de teste identificados. Não é uma publicação em produção nem homologação remota.

## Comparação e reprodução

A base foi gravada antes de editar a cena. Os três primeiros anexos foram comparados com a implantação, a bateria de cinco silos, as três massas Union e a ficha existente. Os modos continuam livres: sem a pose original das capturas, não se afirma igualdade de enquadramento com cada anexo. Os pares antes/depois usam poses e dimensões de viewport idênticas registradas pelo roteiro.

A galeria privada gerada em `docs/cotrirosa/visual-local/comparativos.html` reúne escada/fachada no mesmo quadro, vista superior, anexo 5/6 lado a lado com a prévia, testes de luz, planta e vídeos do primeiro zoom/giro. Fotografias originais, páginas renderizadas do EC 28 e vídeos locais permanecem ignorados pelo Git. O relatório público sanitizado é `refinamento-validacao.json`, incluindo hashes das fontes medidas.

Com o PostgreSQL descartável em loopback e `PGTEST_EPHEMERAL=1`, `PGTEST_HOST=127.0.0.1`, `PGTEST_PORT=55xxx`, usar o laboratório descrito no README. Compilar `tests/cotrirosa/vite.config.mjs`, manter o transporte na porta 4196 e executar `tests/cotrirosa/preview.mjs` na 4197. `visual-capture.mjs before`/`verified` registra cache frio, rede emulada de 20 Mb/s e RTT de 40 ms, Normal, painel fechado e gesto imediato após liberação. `validate-visual.mjs` exercita a cena integrada; `export-access.ts` gera a planta; `visual-report.mjs` reúne as evidências locais.

## Escada, torre e implantação

`sa05-access.ts` define os controles em coordenadas locais, +Y vertical, aplicando a posição do manifesto. Referência externa: câmera `[-22,13,62]`, alvo `[3,16,-1]`, FOV 38°, Union à direita. O arco percorre a frente em +Z com ângulo decrescente, independentemente da câmera ativa.

| Controle                     | Posição local X,Y,Z (m) | Azimute          |
| ---------------------------- | ----------------------- | ---------------- |
| Centro do SA 05              | 0, 0, 0                 | —                |
| Início elevado               | -5,456; 7,360; 0,900    | 170,6°           |
| Setor frontal de controle    | 0; 16,397; 5,530        | 90°              |
| Desembarque alto             | 5,283; 23,790; 1,634    | 17,2°            |
| Escotilha preservada         | -4,860; 8,260; 0,900    | posição anterior |
| Encaixe superior da torre    | 7,550; 33,310; -5,350   | —                |
| Encaixe sobre o teto do silo | 0; 25,730; 0            | —                |

O acesso inferior, quatro lances elevados, três patamares intermediários e a saída ao topo são modelados separadamente. Pisos permanecem nivelados e seguem a tangente; longarinas, postes, travessas e corrimãos usam os mesmos controles. Grelha próxima e piso filtrado distante compartilham geometria. A torre tem carenagens metálicas, montantes externos, plataformas em alturas/lados diferenciados, escada vertical, gaiola visível, carenagens azuis e tubo cilíndrico segmentado entre encaixes reutilizáveis. Torre, tubo e escada selecionam **EC 28 · sa05**, mantendo **SA 05 / AS 05**; não foi criada identificação operacional própria para a torre.

A implantação, UUIDs, dimensões de cadastro, manifesto, câmeras, permissões e ficha/PET não foram alterados. Base da torre, apoios encobertos, alturas de plataformas, extensão/inclinação dos lances e detalhes de fixação são proporções visuais, pendentes de campo. O PDF original do EC 28, páginas 10–13, orientou escotilha, piso e acesso; as imagens não certificam estruturas, ancoragens ou circulação operacional.

## Fachada, materiais e luz

As três massas e seus recuos foram preservados. Chapa vertical com normais na escala da fachada, quinas verdes, embasamento, portão e duas marquises recebem a mesma iluminação. Os contornos vetoriais Union/Cotrirosa têm relevo e afastamento da parede. A variante oficial disponível difere da fotografia; os SVGs são aproximações dos elementos confirmados no anexo 6, com origem e limites em `src/features/nr/mapa/assets/README.md`. Não foram reproduzidos veículos, pessoas ou marcas secundárias.

O ambiente procedural original usa céu/horizonte HDR e PMREM, em coordenadas do mundo, com cache máximo de dois estados por renderer. Dia/Fim de tarde mudam posição e cor do sol, intensidade, céu, ambiente e sombras conjuntamente, mantendo a exposição. A órbita muda a resposta especular sem regenerar o ambiente. Dois testes independentes passaram nos três perfis: câmera fixa com troca de hora; hora fixa com órbita, sol e cache ancorados. Aço, galvanizado, pintura e pavimentos têm rugosidades distintas; pátio e concreto são dielétricos, sem pressupor água ou poças.

Correção confirmada pelo usuário: a marca Cotrirosa fica no mesmo plano frontal da Union, alinhada abaixo dela, e foi retirada da massa intermediária adjacente. As duas peças têm o mesmo X local e o mesmo Z de fachada; as alturas dos grupos são 21,5 m (Union) e 13,3 m (Cotrirosa). A prévia corrigida foi conferida de frente e em ângulo e passou novamente pelos 29 checks.

## Piscagem e qualidade

**Causa confirmada das manchas do terreno:** camadas com triangulações recursivas diferentes interpolavam o relevo não linear de modos diferentes. A separação nominal de 4 cm podia se inverter entre vértices. Faixas comuns em Z tornam as camadas paralelas, também nas vias e no terreno exterior. A intervenção isolada foi registrada em `terrain-auto-desktop.webm`; um teste por raios verifica mais de 250 pontos na região inclinada. O percurso antes/depois foi repetido em build compilado, sem espera de estabilização.

A preparação de shaders, ambiente e primeiro passe de sombras antecede a liberação dos controles, evitando apresentar a cena ainda incompleta. Um experimento adicional de cerca GPU não removeu os picos e levou a abertura automática a 5,299 s: foi descartado. Há picos de tempo de quadro remanescentes no primeiro percurso; a correção visual do terreno não equivale à eliminação de todo travamento de CPU/driver.

O popover acessível oferece Automática, Baixa, Equilibrada e Alta, mais hora do dia. Em 390 px, fica na parte inferior em duas colunas para liberar o alvo. Escape fecha e devolve foco. A escolha manual validada persiste localmente. Automática começa de forma conservadora segundo WebGL, software, CPU/memória e usa janelas de interação, histerese, três janelas rápidas para promoção e intervalo mínimo de 15 s. A proposta só é aplicada depois do gesto e do amortecimento. Repouso sob demanda não é medido como GPU lenta. Limites de resolução/sombra preservam a opção manual e são informados por recurso.

Um único canvas/contexto é mantido nas trocas, assim como seleção, modo, posição, alvo, zoom, painel e hora. Geometria/material/buffers são reaproveitados, mapas de sombras substituídos são descartados e PMREMs são liberados na desmontagem. Perda de contexto tem restauração controlada; após 5 s sem restauração, abre a lista de locais existente. Os ciclos testados mantiveram 137 geometrias e 31 texturas antes/depois, com dois ambientes preparados.

O primeiro CI identificou timeout de captura no renderer por software. O custo foi reproduzido com SwiftShader no Windows (24,119 s para a captura). O orçamento específico de software foi reduzido para DPR 0,35, sombras de 256 px e no máximo 12% das instâncias de vegetação periférica, preservando a estrutura industrial e a opção manual. A captura posterior com seleção e ficha compacta levou 16,490 s; a ficha expandida, 3,337 s. O canvas pausa quando coberto pela ficha expandida e retoma sem recriar contexto. Em CI Linux, somente a captura de evidência tem prazo de 60 s; os testes funcionais mantêm seus limites. Não é prova de desempenho de celular. A capacidade agora é resolvida na sonda anterior ao canvas, evitando submeter primeiro o orçamento Equilibrada num dispositivo por software.

## Desempenho e validação

Chromium 153, Windows, Intel UHD / ANGLE D3D11, DPR do dispositivo 1. Cache frio, 20 Mb/s emulados, RTT 40 ms, SQL loopback, órbita de 30 s. A base usa a decisão legada por largura; na versão final o perfil ativo foi Equilibrada nos três casos. A opção manual não existia na base; seu comparativo usa o mesmo perfil legado de desktop. Não houve medição de telefone físico.

| Caso                      | Interação antes → depois | FPS mediano antes → depois | p95 antes → depois | Maior intervalo antes → depois |
| ------------------------- | ------------------------ | -------------------------- | ------------------ | ------------------------------ |
| Desktop, Automática       | 4,394 → 3,996 s          | 52 → 55                    | 33,3 → 34,1 ms     | 948,6 → 701,8 ms               |
| Desktop, Equilibrada      | 3,846 → 2,607 s          | 52 → 58                    | 30,9 → 36,5 ms     | 1.293,7 → 711,5 ms             |
| 390 px, mesma GPU emulada | 3,628 → 2,403 s          | 60 → 60                    | 17,7 → 17,6 ms     | 442,0 → 86,7 ms                |

Repouso pausado nos seis casos. Transferência até interação: 662.275 → 683.368 bytes. As metas de interação e mediana do notebook foram atendidas nesta máquina; o p95 desktop piorou e há picos iniciais registrados. Os 60 FPS em 390 px não comprovam a meta de celular físico. Não se afirma ganho universal.

Passaram TypeScript, lint do escopo, build principal e laboratório, 193 testes NR, 95 PET, 29 verificações visuais novas, 13 v2, 15 de demonstração, 7 de resiliência, 30 checks SQL mapa/PET e 42 da demonstração. O CI NR passou a incluir as 29 verificações visuais. O teste legado `validate-ui.mjs` passou os oito checks de mapa anteriores à etapa PET e parou no seletor obsoleto “Operação da PET”, ausente já na base `9cc9603e`; o componente de ficha e esse roteiro não foram modificados. As suítes atuais da PET passaram.

Renderização sob demanda e reutilização seguem a [documentação do React Three Fiber](https://r3f.docs.pmnd.rs/advanced/scaling-performance). O aceite final continua pela navegação da unidade; publicação da interface e validação em dispositivos físicos são etapas distintas desta prévia local.
