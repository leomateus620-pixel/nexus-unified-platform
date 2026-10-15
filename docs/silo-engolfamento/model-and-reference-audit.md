# Modelo paramétrico, recursos de referência e inspeção LVHF

Auditoria local em 15/10/2026. O runtime continua nativo da Nexus, em Three.js 0.186.0, com uma cena e sem carregar o site de referência. Os três GLBs públicos foram encontrados e medidos somente em `%TEMP%`; seus binários não foram adicionados ao projeto. A publicação de uma URL não comprova autorização para redistribuir o recurso. O STEP original, a autoria de engenharia, a licença dos modelos e a aprovação mecânica do conjunto permanecem pendentes.

## Recursos efetivamente obtidos para leitura

Os hashes, transformações, bounds, nomes de peças, materiais e contagens estão em [reference-assets-audit.json](evidence/reference-assets-audit.json). A leitura usa o glTF Transform já instalado, sem achatamento, junção, simplificação ou regravação dos recursos externos.

| Recurso publicado                                                                 | Bytes originais | Triângulos | Observação medida                                                                                                                                               |
| --------------------------------------------------------------------------------- | --------------: | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [lvhf_silo.glb](https://lvhfinternsilo.pplx.app/assets/lvhf_silo.glb)             |       2.702.532 |    128.808 | Cinco meshes: costado, dez passantes agregados, Ancopro, esticador e trechos do cabo. Envelope 22,5953 × 24,875 × 22,6400 m; transformações dos nós identidade. |
| [silo_com_chapeu.glb](https://lvhfinternsilo.pplx.app/assets/silo_com_chapeu.glb) |       1.406.480 |     62.796 | Um mesh agregado. Topo medido 30,40299988 m, compatível com os 30,403 m publicados.                                                                             |
| [trole_passante.glb](https://lvhfinternsilo.pplx.app/assets/trole_passante.glb)   |         126.352 |      5.356 | Quatorze peças nomeadas; envelope de 105 × 62 × 100 mm. As coordenadas são métricas, mas o eixo vertical local ainda é Z antes da montagem.                     |

Nenhum arquivo possui texturas ou animações na auditoria. O gerador original informado é `https://github.com/mikedh/trimesh`. O script registra o gerador do JSON GLB original, evitando confundi-lo com o gerador que o glTF Transform atribui ao documento em memória.

O código público [scene.js](https://lvhfinternsilo.pplx.app/scene.js), também lido somente em TEMP, tem SHA-256 `70332213a4c62f825e83acdfc4175e5560583da3f133732b5463b32e9b311281` e 53.402 bytes. A região 467–503 explicita a montagem do trole. Não foi incorporado código externo desse recurso à aplicação.

## Reconciliação do trole

A medida de 90 mm da página não é diretamente o afastamento final entre olhal e eixo do cabo. A montagem pública aplica rotação X de −90° e deslocamento `(0; −0,004; +0,0205)` m. Os centros originais das roldanas são `(±0,0355; 0,0205; −0,017)` m. Depois da montagem:

- O eixo do cabo é a origem local do conjunto; X é tangente, Y é vertical e Z aponta radialmente para fora.
- As roldanas de raio 17 mm ficam com centros em Y = −21 mm. Seus topos estão em Y = −4 mm, tangentes à face inferior do cabo de Ø8 mm. Elas ficam **sob o cabo**.
- O ponto de apoio inferior do olhal passa a `(0; −0,094; +0,0155)` m: 94 mm abaixo e 15,5 mm radialmente para fora do eixo do cabo. Esse datum não é o centro geométrico da abertura.
- A abertura tem extremos de centroline no GLB original em Z = −73,5 e −90,5 mm: centro Z = −82 mm e raio 8,5 mm. Na montagem, seu centro fica 86 mm abaixo do eixo do cabo.
- A chapa do corpo fica do lado radial externo e possui abertura real para o olhal. Os eixos e roldanas conservam pivôs próprios.

Essas medidas alimentam a configuração e a reconstrução paramétrica. Não foram copiados vértices dos GLBs. O domínio emite o ponto móvel já transformado; a representação subtrai o deslocamento radial para reconstruir o eixo do trole. O mosquetão vertical de apresentação tem aproximadamente 58 × 30 mm e atravessa a abertura medida, contornando a ponte metálica inferior. Seu arco vai de 11 mm acima a 47 mm abaixo do datum de apoio. A origem central da corda fica 52 mm verticalmente abaixo do datum. Uma terminação arredondada da própria corda, de raio 5 mm e centrada nessa origem, encosta no ponto inferior do arco. Esse acabamento é aproximado, sem introduzir outro acessório ou alegar um engate estrutural certificado. Orientar o mosquetão rigidamente para a dorsal faria o arco atravessar a ponte metálica, portanto essa hipótese foi corrigida.

Os 52 mm são uma hipótese visual Nexus, não uma dimensão publicada. Domínio e representação usam a mesma origem inferior da corda. O comprimento do conector não é acrescentado silenciosamente aos 0,95 m totais: restam até 0,898 m para a corda até o ponto dorsal atualizado do rig. A restrição usa 52 mm mais a distância da origem inferior ao ponto dorsal; a distância reta do olhal à dorsal continua disponível como medida distinta. O desenho completo de transposição do produto, tolerâncias, cargas, fixações e compatibilidade continuam sem validação de fabricante.

## Estrutura e aproximações declaradas

O costado de raio nominal 11 m começa no piso de fundo plano em Y = 0,18 m e termina em 24,88 m. A auditoria do recurso externo mede 24,875 m; a Nexus conserva o valor publicado arredondado, sem alegar que os 5 mm são uma medição do fabricante. O envelope externo de 11,32 m não foi convertido em chapa de 320 mm.

A fundação de concreto tem centro na origem e vai de −0,18 a +0,18 m. O pátio toca sua base, o plinto é visível e não existem tremonha elevada, oito pilares ou pórtico externo ocultos sob o terreno. Fundação, escada, patamares, passagem à cobertura, piso e canal de inspeção são hipóteses de apresentação identificadas no catálogo. A saída não é uma causa oculta do colapso localizado da simulação.

A cobertura usa o beiral medido da malha pública: R = 11,10299952–11,10300037 m em Y = 24,875 m. A extração identifica 2.460 triângulos exclusivos da cobertura, com 288 ocorrências de vértices na borda correspondentes a 50 posições únicas. A reconstrução adota R = 11,103 m, cota publicada arredondada 24,88 m e topo 30,403 m. O envelope externo 11,32 m do conjunto não é o raio do beiral. Colar e tampa central não criam um novo pico acima da cota; apenas as nervuras de apresentação acrescentam até 38 mm ao envelope visual.

O recorte retangular da boca está ausente na própria triangulação e tem aro, ferragens e tampa com dobradiça. `setPresentation({ hatchOpen: true })` abre somente a tampa para inspeção; o padrão é fechado. No centro X/Z publicado, a superfície do cone com beiral medido fica perto de Y = 25,155 m, cerca de 0,052 m abaixo da cota publicada de 25,207 m; essa divergência está visível na ficha. Não se declarou uma malha de fabricante corrigida.

O anel é nominalmente circular, enquanto a malha de referência contém desvios locais próximos de guias e terminais. Os passantes e terminais da Nexus são **uma representação cinemática aproximada**, com guia superior e placas externas visíveis. O modelo não esconde suportes nem teletransporta o trole. A folga geométrica dessa reconstrução pode ser verificada; isso não valida a passagem mecânica do equipamento real.

A rotação das duas roldanas deriva da distância de arco, com sinal positivo ao avançar no eixo tangente local X. Como o contato com o cabo está acima da roda, `v + ω × r` tem componente tangencial nula nesse contato. O teste confronta essa identidade em avanço, seek reverso e cruzamento angular; não equivale a um ensaio mecânico do produto.

## Prova geométrica e inspeção

`model-inspection.test.ts` verifica, além de bounds e perfuração, cada triângulo dos dez passantes, Ancopro e esticador contra o envelope varrido do trole e conector. Para cada triângulo, todos os vértices devem estar acima do máximo Y das peças móveis ou além do raio máximo varrido. Esses semiespaços são separadores para todos os ângulos, inclusive o fechamento da volta; a prova é mais forte que uma amostragem de screenshots. Cabo e roldana têm contato tangente intencional. A prova se limita aos sólidos paramétricos construídos, sem alegar tolerância de fabricação ou teste do GLB original.

A abertura do olhal e o mosquetão também são verificados como sólidos: mais de 5.000 arestas do arco e do gatilho foram consultadas contra os triângulos da chapa em quatro ângulos da volta, com zero cruzamentos. Um segundo plano separador verifica que os sólidos do arco ficam acima de 47 mm abaixo do apoio e toda a corda fica abaixo desse plano. Em 24 poses, incluindo corda vertical e diagonal, o topo da terminação arredondada coincide com o ponto inferior do arco dentro de 10⁻⁸ m; os semiespaços admitem somente contato tangente, sem interseção de área. Não se usou desativação de colisões visuais ou ocultação da chapa como solução.

O `ComponentRegistry` é independente de React/Three; o `InspectionController` associa IDs a objetos, mede bounds atuais, filtra hits recortados e usa proxies para peças pequenas. Cada realce clona e restaura somente os materiais selecionados. Isolamento guarda a visibilidade anterior; `sync()` reaplica o isolamento após as alterações de LOD dos técnicos. O campo opcional `isolationContext` define companheiros visíveis sem falsear as relações físicas: para o piso, mantém a saída e omite a soja opaca e a fundação coincidente que o esconderiam. Selecionar chapéu ou boca após a visão LVHF restaura a cobertura por uma política única para índice e raycasting. Não existe patch global de raycasting ou uma segunda autoridade de câmera. Os testes confirmam que selecionar a peça 04 no modelo resolve o mesmo ID do índice e que uma chapa recortada não bloqueia a peça visível atrás dela.

O percurso LVHF começa com cobertura revelada e massa íntegra, para conservar o apoio visual durante a volta completa. Quando o usuário solicita corte técnico, `WorkerPool.setCut` aplica o mesmo plano a A/B, preservando os materiais do vigia externo. Os técnicos possuem materiais próprios, mas continuam compartilhando as texturas e geometrias imutáveis. O plano alcança tanto os materiais originais quanto os clones de realce; encerrar a seleção não restaura um corte antigo. Primeira pessoa e prevenção desligam o corte por uma política comum da cena. Um teste separado com os GLBs reais valida aplicação, vigia intacto, realce e alternância reversa.

Localizar piso ou extração revela a cobertura, aplica a seção e oculta visualmente a massa; isso não altera seu volume nem os dados de apoio do domínio. A cena também oculta os técnicos e a corda nessa inspeção, evitando representações suspensas no vazio. Isolamento oculta o técnico comparativo B, que não integra o catálogo individual. Nova seleção restaura o conjunto anterior antes de aplicar outro filtro. Selecionar o sistema ou entrar em LVHF, incidente ou prevenção reexibe a massa; retornar à exploração restaura suas opções salvas. A extração externa usa materiais próprios sem corte, como contexto da fundação e do piso: seleção, realce e raycasting preservam essa política, sem alterar o mecanismo do incidente.

Cada carga GLB possui um `LoadingManager` local. Uma falha de imagem que o `GLTFLoader` absorveria é registrada; a cena parcial é descartada e a interface recebe erro de textura recuperável por nova tentativa. Cancelamento continua prioritário e `Promise.allSettled` descarta o outro técnico já carregado. O teste no navegador corrompeu 32 bytes da primeira imagem embutida mantendo cabeçalho, JSON e BIN válidos: o estado anterior liberava prontidão silenciosamente; o estado corrigido informa a indisponibilidade e permite recuperar a carga normal. A evidência completa de falhas pertence ao relatório geral.

## Orçamento geométrico e acabamento

Após a redução dirigida, o modelo estático possui **126.044 triângulos principais, 16 chamadas e 7 meshes que projetam sombra**, incluindo as 672 instâncias de cabeças de parafusos. Isso é um orçamento do modelo, não uma aprovação automática do total de cena.

O costado conserva 512 amostras verticais para cerca de 162 ondas, e usa 80 amostras circunferenciais. O erro nominal da corda de um polígono de 80 lados no raio de 11 m é 8,5 mm. As emendas milimétricas usam seção simplificada; o plinto de concreto mantém seção arredondada. Foram removidas somente as seis faces traseiras de cada cabeça de parafuso, permanentemente embutidas no montante. Essa composição removeu 35.840 triângulos principais sem alterar diâmetro, alturas, pontos de conexão ou roteiro.

Zinco, roughness e cascalho procedurais usam mipmaps, filtros lineares e anisotropia limitada a 4. As células de zinco ocupam cerca de 21 × 5 mm no costado, com UV da cobertura corrigido para escala comparável. Costado e cobertura projetam sombras, mas não recebem o mapa grosseiro em cada vale de 12 mm da corrugação, evitando acne de auto-sombra. O terreno usa faixas adjacentes sem sobreposição para concreto, cascalho e pastagem, mantendo galpão e árvores instanciadas econômicas sem RAF ambiental. Concreto, zinco, aço dos equipamentos, corda e borracha têm materiais separados. Avaliação visual final e orçamento total pertencem às capturas e métricas da cena completa.

O ambiente neutro próprio foi pré-filtrado offline na mesma resolução PMREM 256. O PNG local de 75.806 bytes conserva os valores lineares com erro máximo de 1/510; o roundtrip de PNG e upload GPU mudou no máximo um nível RGB8 nas três sondas de materiais. A geração, configuração de upload, propriedade do bitmap e evidências estão em [environment-map.md](environment-map.md). Não se carrega HDR externo nem se executa o filtro PMREM novamente durante a abertura.

## Reprodução

Para atualizar a auditoria, obtenha os três URLs da tabela em `%TEMP%/nexus-reference-{nome}.glb` e `scene.js` em `%TEMP%/nexus-reference-scene.js`, preservando os originais fora do repositório. Execute:

```text
node scripts/silo-engolfamento/audit-reference-assets.mjs
npx tsx --test tests/silo-engolfamento/model.test.ts tests/silo-engolfamento/model-inspection.test.ts
```

Resultado local dos testes focados: **18 aprovados, 0 falhas**. Incluem dimensões atuais, ausência de tremonha/pórtico, fechamento/corte/primeira pessoa, tampa abrindo e fechando, pontos exatos da corda, envelope/tangência do trole e sentido físico de rotação das roldanas, varredura contínua sem interpenetração dos sólidos paramétricos, contato tangente e separação do conector e da corda em seis ângulos e quatro direções, passagem do mosquetão pela abertura medida sem cruzar a chapa, seleção/realce/isolamento, piso observável sem soja/fundação, extração visível e selecionável com corte e descarte idempotente por proprietário. A execução conjunta com `resources.test.ts` terminou com **23 aprovados, 0 falhas**, incluindo incidente, volta completa e seek reverso com comprimento total fixo de 0,95 m; os valores finais constam na auditoria de domínio. Esses testes não aprovam estética, telefone físico, capacidade da LVHF ou resgate; essas evidências são separadas na entrega geral.
