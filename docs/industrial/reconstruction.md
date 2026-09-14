# Leitura das referências e hipóteses

## Convenções e escala

Origem próxima ao centro dos quatro silos. +X aponta para a direita e +Z para baixo na Foto B; Y é vertical. Não se atribui norte/leste geográfico. Um diâmetro de **17,6 unidades** foi adotado como hipótese de trabalho, com corpo de 17,6 e cone de 3,8 unidades. A convenção de metro é **estimada**, sem medida de campo. Não há capacidades, áreas, cotas oficiais ou ferramenta de medição ativa.

A Foto B não é ortofoto. Os pontos de apoio foram traçados manualmente, usando 0,16 unidade/pixel como conveniência de implantação. Os pontos altos dos silos são tratados como correspondências elevadas, sem aplicar a eles uma homografia do solo. O terreno é conservador e plano; pequenas separações entre superfícies são construtivas/renderização, não altimetria medida.

## Leitura por fotografia

**A — aérea oblíqua:** quatro silos, galpão na frente, rodovia à direita, entrada superior e circulação envolvente. Permite comparar bases, largura dos pátios e relação de altura entre silos, distribuição central e galpão. O bosque à esquerda e o alinhamento de palmeiras à direita são distintos.

**B — superior:** principal referência de implantação. Conjunto 2 × 2, galpão abaixo, edificação lateral e faixa longitudinal à direita; dois volumes no setor superior esquerdo e edificação/elemento circular no inferior direito. Ilhas verdes foram traçadas separadamente da circulação. A faixa externa de acesso não é confundida com a rodovia nem com a via interna.

**C — lado oposto:** mesma implantação vista com câmera do outro lado. Confirma cobertura do galpão e circulação atrás dele, os volumes periféricos, a relação do elemento circular e as conexões metálicas longitudinais. Nenhum espelhamento da geometria foi empregado.

**D — solo:** comprova a leitura das chapas corrugadas, montantes, juntas entre anéis, cones, tubulações inclinadas, escadas e elementos amarelos. A correspondência exata entre os dois silos desta foto e os quatro IDs do cadastro permanece pendente. Vegetação podada e cercamento são representados; não se deduz espécie botânica ou conformidade de segurança.

## Inventário

O cadastro completo por elemento, com posição/rotação/parâmetros e pendências, está em [`site.json`](../../src/industrial/data/site.json). As funções da tabela são deliberadamente conservadoras.

| ID provisório | Existência e forma | Fotos | Função |
|---|---|---|---|
| SILO-01 a SILO-04 | Quatro cilindros com cone, base e coroamento em 2 × 2 | A, B, C; detalhes tipológicos D | Silo identificável; capacidade desconhecida |
| EQ-01 | Conjunto central de estruturas verticais, plataformas e quatro tubos inclinados | A–D | Elevação/distribuição provável; fluxo não modelado |
| EQ-02 | Ligação longitudinal elevada e suportes junto ao galpão | A, B, C | Tipo de transporte não confirmado |
| ED-01 | Galpão adjacente, cobertura em duas águas, fachadas e portas aparentes | A, B, C | Uso interno desconhecido |
| ED-02, ED-03 | Dois edifícios no setor superior esquerdo, coberturas baixas | A, B, C | Não classificados como escritório/laboratório/residência |
| ED-04 | Edificação lateral com cobertura e faixa adjacente | A, B, C | Não confirmada |
| PV-01 | Faixa estreita de concreto, alinhada à ED-04 | A, B, C | Pesagem provável; mecanismo não representado |
| ED-05 | Edificação inferior direita com cobertura clara | A, B, C | Não confirmada |
| EQ-03 | Elemento circular junto à ED-05 | A, B, C | Reservatório possível; conteúdo desconhecido |
| TR-01 | Pátio cinza, solo vermelho e ilhas verdes | A, B, C | Circulação identificável |
| TR-02 | Acesso superior externo curvo | A, B, C | Acesso identificável |
| TR-03 | Rodovia lateral contínua | A, B, C | Rodovia; identificação geográfica desconhecida |
| VG-01 | Palmeiras ancoradas nos alinhamentos visíveis | A–D | Grupo vegetal; espécie desconhecida |
| VG-02 | Bosque, árvores podadas, canteiros e gramados | A–D | Grupo vegetal; espécies desconhecidas |
| CE-01 | Trechos de postes/fios do cercamento aparente | A–D | Não é divisa jurídica |
| CE-02 | Subdivisões do acesso e portões | A, B, C | Operação e limites não confirmados |

## Modelagem e limites de evidência

- Silos paramétricos separados: base, corpo, cone, equipamentos superiores, montantes, juntas, guarda-corpos e acessos. Corrugação por normal map, sem nervuras profundas artificiais. Seções de tubos/perfis, número exato de chapas/ventiladores e detalhes ocultos são estimados. Fixadores individuais não foram acrescentados em massa.
- Tubos partem da estrutura central e encontram os coroamentos. Ligação elevada específica da unidade, com suportes e contraventamentos. Nenhum fluxo de grãos ou mecanismo operacional animado.
- Cinco edificações, com coberturas conforme o tipo configurado, espessuras aparentes e portas/janelas nas faces interpretadas. Sem interiores. A inclinação exata, os recuos das portas e as fachadas ocultas precisam de documentação adicional.
- Pátios por polígonos e curvas controlados; vias cinza distintas do asfalto da rodovia. Ilhas, gramados e concreto são superfícies separadas. Arredondamento conservador do traçado; não é pavimentação executiva. Texturas são autorais, não recortes fotográficos com sombras incorporadas.
- Vegetação ancorada, três variantes por grupo, rotações explícitas independentes de setor/qualidade e semente 31028. Palmeiras possuem frondes curvas; copas usam folhas com orientação variada. A vegetação junto à ED-05 foi reduzida a porte baixo e afastada dentro da margem estimada para impedir penetração nas paredes. Espécies/alturas reais continuam pendentes.
- Tufo de grama gerado antecipadamente com exclusões de vias, concreto, silos e edifícios. A versão econômica reduz folhagem e grama antes dos componentes principais dos silos.
- A modelagem das cercas distingue os trechos e portões observáveis. A malha fina exata e alguns apoios pequenos não podem ser resolvidos nas fotos aéreas; fios representativos têm seção estimada. Pequenos equipamentos não identificados e postes isolados sem leitura segura não receberam funções inventadas.
- Iluminação diurna ilustrativa, sem latitude/azimute geográfico confirmado. Ambiente PMREM autoral estático. Reflexos locais dos edifícios não são reconstruídos por sondas dinâmicas; não há custo de recaptura por quadro. Sem bloom, profundidade de campo ou motion blur.

## Comparação e próximos dados necessários

As câmeras A/C foram ajustadas com geometria fixa, usando quatro correspondências de solo e quatro ápices de cobertura por foto. A função minimiza erro de projeção em pixels e limita a câmera ao lado apropriado. Os resíduos estão em `evidence/camera-fitting.json`. São **resíduos do próprio ajuste**, sujeitos a escolha manual de pixels, e não validação independente. A solução A atingiu o limite inferior de FOV de 18°, evidenciando ambiguidade entre distância/focal e dimensões estimadas.

B é um enquadramento ortográfico de comparação da implantação, sem correção artificial dos topos. D aproxima uma vista frontal em relação à estrutura central; seu registro exato e a identidade dos dois silos visíveis continuam pendentes. Todos os enquadramentos têm botão de sobreposição e permitem inspeção de silhueta, profundidade e acabamento.

Para a próxima calibração: diâmetro externo e altura de corpo de um silo; distância entre centros; dimensões do galpão/faixa pavimentada; fotos de fachadas ocultas, equipamentos e cercamentos; origem/autoria das fotos; localização e orientação confirmadas. Nenhuma dessas pendências foi preenchida com dados operacionais fictícios.
