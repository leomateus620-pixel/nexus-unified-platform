# Conferência visual de Cruz Alta

A referência anterior é o commit `56b0b57`. As duas pastas de capturas usam 1280 × 721 pixels de cena, sem rótulos ou realce de seleção. Os arquivos `cameras.json` guardam olho, alvo, projeção, zoom e tamanho do quadro. A posição é relativa à origem da unidade, com Y para cima e distâncias em metros.

## Comparações

| Conjunto e referência | Diferença encontrada | Interpretação testada e critério visual | Conferência ainda necessária |
| --- | --- | --- | --- |
| Armazém 01 e anexo, itens 11 e 56. DJI 0044 de 14 de maio de 2026 e conjunto 11/56 | A curva se confundia com o oitão. Faltavam a caixa do anexo, os terminais junto à cumeeira e a diferença de acabamento entre os lados do arco. | Compare `armazem-01-dji.png` e `encontro-11-56.png`. A borda superior curva deve passar por trás da caixa de chapa. As águas do 56 se encontram abaixo do arco. A junta central e as quatro fileiras de terminais devem aparecer na oblíqua. A oxidação se concentra no oitão presente na fotografia. | Há interpretação na extensão da caixa, no relevo dos terminais e na cor das chapas. Levantar o corte do encontro e as fachadas para confirmar o fechamento junto ao piso e identificar portões. |
| Preparação, itens 27, 27.1, 28 e 28.1. Perspectiva da prancha de conjunto | Os dois níveis altos pareciam paredes maciças até o beiral. O telhado superior do 28.1 ficava pouco distinto do plano inferior. | Em `preparacao.png`, procurar a faixa aberta sob as coberturas da torre. O 28.1 sobre pilares tem uma platibanda superior cinza e outra vermelha ao nível do 28. As duas águas, o telhado de uma queda e o desnível devem permanecer discerníveis no estudo de volumes. A seleção do 28.1 identifica só o componente. | Espessura visual, abertura, seção dos pilares e altura da platibanda cinza são estimadas. Verificar o corte da torre, a elevação transversal e a medida vertical a partir de uma referência de piso. |
| Bateria de silos sul, torre e transportador. Folha 1 do layout 56 e panorâmica de fevereiro | As tampas pareciam idênticas e o costado não mostrava a concentração de anéis no terço superior. O apoio da galeria era difícil de reconhecer contra o céu. | Compare `galeria.png`. Contar quatro corpos, identificar o intervalo entre eles e acompanhar a galeria desde a torre até as quatro conexões no topo. A fotografia distingue dois tetos mais oxidados próximos à torre e dois galvanizados além deles. O modo fosco conserva os anéis salientes, o cone e os vãos de treliça. | Diâmetro e implantação são interpretados na imagem. Alturas, bases, seção dos reforços e conexão superior precisam de levantamento de fundações e de corte longitudinal do transportador. Atribuição de conteúdo e capacidade requer cadastro de equipamentos. |

A pose DJI utiliza a posição do horizonte e das duas extremidades da cumeeira na fotografia. A diferença horizontal entre a posição reconstruída e o GPS EXIF é 4,66 m. O levantamento tem RMSE horizontal de 3,97 m e desvio máximo independente de 5,52 m. A conferência planimétrica adota 6 m como referência de leitura para os pontos verificados. Os testes de câmeras e de precisão numérica não fornecem cotas altimétricas de campo. O registro por setor e as fontes identificam quais posições tiveram checagem independente. [Levantamento](../levantamento.md) · [Registro dos pontos](../registro.json) · [Lacunas por estrutura](../lacunas.md)

## Demais setores

| Setor | Elementos distinguidos no modelo |
| --- | --- |
| Armazém Casca | Nave longitudinal, plano lateral, duas sequências de lanternins e retorno em L. O conjunto traz inclinação de 25° nas naves e queda de 7,7% na extensão. As quatro LVHF do 06 permanecem segmentos nas coberturas. |
| Caldeiras | No conjunto de 35 t as duas meias-águas têm queda no mesmo sentido e platibandas. No conjunto de 20 t o 62 fica na frente do 09, com quatro pórticos vistos através do vão e eixo transversal. |
| Moegas e expedição | O desenho de recebimento informa três planos escalonados em 67/68/69. Pilares e treliças deixam livres os vãos documentados das coberturas 14/15/65/66 e 18/19/54. O sentido de queda acompanha o lado ferroviário em 18/19/54. |
| Barracão 57 e laje 57.1 | O conjunto mostra cabeceiras e fundos fechados, frente sobre apoios e laje adjacente. A posição dos apoios foi interpretada, com colisão nas partes fechadas durante o passeio. |
| Reservatórios e faixa limítrofe | Os reservatórios usam acabamento de costado e tampa distintos dos silos. Edificações cuja pertença cadastral continua pendente integram o entorno reduzido. |

## Reprodução

1. No mapa, use **Camadas → Comparar enquadramentos → Vista DJI 0044**. A opção de arquivo aceita o original DJI ou o layout A1 registrado. O navegador verifica o hash. A foto permanece em memória e a sobreposição desaparece quando a câmera sai do enquadramento.
2. Escolha **Encontro de coberturas · 11/56** para ver o encontro do lado do pátio. Use **Estudo de volumes** para examinar as formas com material fosco uniforme. **Ver toda a unidade** recupera a abertura.
3. Procure **Preparação**, depois **28.1**. A ficha mantém o ID da cobertura durante o foco e a troca de detalhe. Procure **Galeria da bateria sul** para a terceira comparação. O modelo com o painel fechado ocupa toda a largura.
4. O script `tests/cruz-alta/comparacoes.mjs` produz as câmeras comparáveis, a planta, o pátio junto ao Armazém 01 e três estudos foscos. A coleção privada de comparação coloca cada imagem de origem junto aos renders anterior e revisado. O repositório contém os renders da geometria própria.

A cena começa com a geometria de menor detalhe. O arco passa de 18 para 72 subdivisões conforme seu tamanho projetado, mantendo a normal contínua. Os cilindros passam de 32 para 64 lados. Limiares distintos de entrada e saída conservam o nível durante pequenas oscilações da câmera. A seleção usa o mesmo ID nas duas representações. Corpos e coberturas repetidos compartilham geometria e material.

O perfil econômico usa um pixel de framebuffer por pixel CSS em telas Retina, o automático equilibrado chega a 1,5 e o detalhado chega a 2. Os mapas de sombra correspondentes têm 768, 1536 e 2048 pixels de lado. Texturas próximas usam mipmaps e filtragem anisotrópica. A iluminação do céu e a neblina conservam contraste da paisagem ao fundo. O relevo carrega depois do primeiro quadro. Órbita, zoom e passeio permanecem limitados à implantação técnica.

Os números de chamadas e triângulos nas capturas descrevem aquele quadro em Chromium com SwiftShader. A medição de fluidez usa Metal no MacBook e contabiliza a produção real de quadros. A densidade da neblina exponencial é 0,000062 m⁻¹. A transmitância calculada a 5 km é 91%, com redução progressiva do contraste em planos mais distantes. A distância e a elevação do terreno regional são preservadas. A escala das juntas de chapa do oitão é interpretada a partir da largura comparada ao vão na DJI 0044.

Ao fundo da DJI 0044 aparecem torres, linhas de transporte e equipamento mecânico parcialmente encobertos pelo Armazém 01. A cena inclui os eixos confirmados de galeria e a torre da bateria sul. Para completar a silhueta industrial nesse rumo, identificar as bases e extremidades dos equipamentos em planta, fotografar as duas fachadas e obter o corte longitudinal. O conteúdo dos vãos da caldeira e do Cavaco está limitado às travessas e apoios visíveis.

A conferência de cor inclui os RGB da foto e os valores usados no material em 37 regiões. As capturas adicionais de Cavaco, Casca, caldeira de 35 t e reservatórios usam a opção `--materiais` do mesmo script. [Paleta das superfícies e dos vãos](paleta.md)

Nas capturas da versão revisada, o contexto regional incorpora INPE/CBERS, Copernicus WorldDEM e ESA WorldCover. Os volumes urbanos próximos usam contornos de © OpenStreetMap e colaboradores. Os créditos, datas, licenças e produtos derivados constam no levantamento da paisagem. [Fontes do horizonte](../horizonte.md) · [OpenStreetMap e colaboradores](https://www.openstreetmap.org/copyright)
