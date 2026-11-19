# Cruz Alta · Revisão industrial

A revisão funciona na rota `/mapas-3d/tres-tentos-cruz-alta` do Nexus. **Camadas → Comparar enquadramentos → Pátio ferroviário · 11/56** entra na faixa de lastro junto ao Armazém 01. Use a busca **Galeria da bateria sul** para percorrer as ligações da torre aos quatro silos e comparar seus fechamentos contra o fundo de mata.

## Quatro câmeras controladas

Cada par mostra a referência `b9e6990822f319f3064b6200b4416880cef6fcc1` à esquerda e a revisão à direita. As poses recompõem os assuntos das quatro capturas fornecidas. A comparação trava posição, alvo, projeção, escala e perfil no mesmo viewport de 1.440 × 900, com 1.440 × 823 pixels úteis de cena. O ensaio usa DPR 1 e perfil Detalhada, com a paisagem carregada. Os dados de câmera registram os valores e a tolerância é 5 mm por coordenada.

| Câmera                      | O que conferir                                                                                                                        | Comparativo                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 01 · Ferrovia e 11/56       | Separação das duas águas, chapa do oitão, rufo do arco, terminais, piso ferroviário e apoios vizinhos.                                | [Comparativo 01](comparativo-01.jpg) |
| 02 · Preparação e caldeiras | Faixas em níveis distintos, beirais, vãos das caldeiras e diferença de resposta entre chapa clara, envelhecida e piso mineral.        | [Comparativo 02](comparativo-02.jpg) |
| 03 · Unidade e implantação  | Pavimentos contínuos, faixa ferroviária, bordas da mata e relação da fábrica com a cidade.                                            | [Comparativo 03](comparativo-03.jpg) |
| 04 · Silos sul e galeria    | Cintas no costado, tampas com pátina diferenciada, caminho contínuo da galeria, apoios junto ao pátio e contorno irregular das copas. | [Comparativo 04](comparativo-04.jpg) |

[Poses da referência](cameras-antes.json) · [Poses da revisão](cameras-depois.json) · [Percurso de 22 s na aplicação](percurso.mp4) · [Vista ao nível dos trilhos](patio-ferroviario.jpg) · [Desempenho](desempenho.md) · [Inventário e vistorias por setor](inventario.md) · [Planta de superfícies e ferrovia](solo-ferrovia.md) · [Interface e pictogramas](interface.md)

## Construção e inspeção

O campo local compartilha as mesmas faces entre triangulação do piso e amostragem de altura. A planta usa as bordas registradas como limites. Os trechos de lastro elevado e a plataforma interna do dique têm linhas de quebra explícitas. O passeio soma 1,70 m ao apoio. Os relevos regionais GLO-30 conservam a grade e o datum anteriores e se ligam ao piso local no perímetro. O greide geral de obra e a amarração vertical continuam pendentes.

O sol, a hemisférica e o ambiente compartilham a mesma direção e balanço de cor. O Three.js pré-filtra o céu para iluminação por reflexão. O sol mantém o azimute do baseline. A revisão ajusta conjuntamente sua intensidade, a exposição em ACES e a luz indireta. A sombra direcional estabiliza a origem em múltiplos inteiros de texel no espaço da luz, com histerese da extensão. O piso conserva a oclusão ambiente suave, sobre a qual sombras de pórticos, volumes e fundações recebem incidência solar. A cena usa MSAA, mipmaps, anisotropia e transições condicionadas ao tamanho projetado. A inspeção usa o renderer da aplicação, sem pós-processamento adicional.

O primeiro quadro oferece implantação, navegação e seleção. O detalhe métrico do solo é produzido por quadrante conforme a proximidade. As texturas de materiais geradas em memória usam albedo sRGB e canais de rugosidade e relevo lineares. O perfil Econômica reduz elementos pequenos na ferrovia e nas copas e o custo das sombras. Continua usando os mesmos contornos, eixos e cotas locais.

## Fontes e distribuição

A implantação, as relações entre estruturas e as interpretações visuais se baseiam na folha 1 do layout rev. 56, nas pranchas de conjunto, nas fotografias DJI e nos quadros descritos no inventário. As quatro capturas do pedido serviram para localizar os problemas. Fotos, pranchas e vídeos originais da unidade permanecem no acervo privado. Os comparativos e o percurso são registros do render do Nexus, com materiais procedurais autorais e contornos interpretados. O repositório não declara licença autônoma para esses novos materiais. Os dados regionais já distribuídos seguem os termos de INPE/CBERS, Copernicus, ESA e OpenStreetMap registrados no levantamento. [Acervo privado](https://drive.google.com/drive/folders/1wexshbdZctbJ5zoLcwmIUh4-xx9kYxf4) · [Origem e licenças da paisagem](../horizonte.md)

## Reprodução

Com os builds de produção servidos no loopback, rode a partir da raiz do repositório. Os dois primeiros comandos produzem um registro de poses e quatro imagens por versão. O terceiro grava as interações da revisão com a própria interface. A última linha exerce a jornada pública em desktop e celular, incluindo busca, LVHF, leitor por URL, navegação de volta à ficha, carga regional, perda do contexto e reconstrução do WebGL.

```sh
NEXUS_TEST_BASE_URL=http://127.0.0.1:4418 node tests/cruz-alta/comparacao-industrial.mjs antes /tmp/cruz-antes
NEXUS_TEST_BASE_URL=http://127.0.0.1:4432 node tests/cruz-alta/comparacao-industrial.mjs depois /tmp/cruz-depois /tmp/cruz-antes/cameras.json
NEXUS_TEST_BASE_URL=http://127.0.0.1:4432 node tests/cruz-alta/percurso-industrial.mjs /tmp/cruz-percurso
NEXUS_TEST_BASE_URL=http://127.0.0.1:4432 CRUZ_EVIDENCIAS=/tmp/cruz-validacao node --import tsx tests/cruz-alta/visual.mjs
```

`CRUZ_LAYOUT_A1` e `CRUZ_DJI_44` apontam para os originais privados locais quando autorizados. O ensaio confere os hashes e as sobreposições somente no navegador. A jornada sem sessão verifica a barreira do acervo na URL do leitor e o retorno à ficha com a mesma câmera. A leitura autenticada de arquivos privados requer uma sessão autorizada da unidade. [Conferência de permissões e leitor no baseline](../acervo-verificacao.md)
