# Levantamento da unidade de Cruz Alta

## Rotas e controles conferidos

| Entrada de referência | Contrato preservado |
| --- | --- |
| Biblioteca em `/mapas-3d/unidades` | Pesquisa pelo parâmetro `q`, cartões por cena e abertura por link. O cartão Cruz Alta aponta diretamente para sua rota. |
| Mapa industrial em `/mapas-3d` | Entrada própria da unidade já modelada, com painel recolhível, busca, camadas, qualidade, vista superior, passeio, foco e retorno à visão geral. |
| Trevisan em `/mapas-3d/trevisan` | Visualizador próprio, navegação de volta à biblioteca, setores, camadas e consulta de fontes e limites. |
| Mapa NR da Cotrirosa | Acesso pelo módulo autenticado, escopo de organização/cliente/unidade, modelo técnico e vínculos de acervo próprios. |
| Cruz Alta em `/mapas-3d/tres-tentos-cruz-alta` | Cena pública dedicada, ficha privada por ID estável e acesso ao acervo específico por `vista=acervo`. Um link pode identificar objeto, aba, documento e revisão. |

As rotas do catálogo e de seus dois visualizadores públicos anteriores continuam com os respectivos componentes. A cena e o acervo novos usam a tripla de IDs registrada na [verificação do banco](acervo-verificacao.md).

## Base documental

A folha 1 do layout rev. 56 de 18/11/2026 contém 74 registros e 73 chamadas sobre a fotografia. A folha 2 registra as modificações. A leitura recursiva alcançou a pasta principal, LINHAS JÁ MONTADAS e CONJUNTOS. Havia 87 PDFs, 11 JPEGs, quatro PNGs e um vídeo. A revisão 43 de 28/10/2026, recebida separadamente, acrescenta um original ao histórico. Os carimbos e quadros de revisão identificam as pranchas. O inventário privado conserva o ID externo, SHA-256, tipo, tamanho, página, data, revisão, vínculo e interpretação de cada fonte.

A origem do layout expunha 16 versões de arquivo na consulta. A versão mais recente correspondia à revisão técnica 56. A árvore consultada não mostrava layout posterior aprovado. Falta um documento de aprovação editorial que estabeleça a vigência de execução. O status “Montada” reproduz a instalação descrita nessa revisão. Para autorizar trabalho é necessária a documentação operacional aplicável.

| Originais verificados | Quantidade | Destino |
| --- | ---: | --- |
| Individuais atuais | 73 | Itens LVHF, conservando o código textual |
| Individual histórica | 1 | 29.2, retirado na revisão 44 |
| Desenhos de conjunto | 11 | Um documento lógico com vários destinos |
| Layouts | 2 | Unidade, revisões 43 e 56 |
| Detalhes padrão | 1 | Unidade, referência reutilizável |
| Fotografias e PNGs | 15 | Evidência com nota sobre a relação observada |
| MP4 | 1 | Original privado, cinco quadros temporizados, prévia integral pendente |

A conferência do vídeo abrangeu 156 segundos em 1.920 × 1.080. Os quadros de 0, 36, 72, 108 e 150 s sustentam, respectivamente, a bateria de silos e o pátio, o Cavaco junto à vegetação, a diferença entre caldeiras e reservatórios, o escalonamento da Preparação e o dique junto ao reservatório. Os rumos interpretados são NO, ONO, O, OSO e SO. A data de captura das tomadas de maio consta nos metadados. PNGs sem data interna permanecem com a data técnica desconhecida.

## Coordenadas e precisão

A origem WGS 84 está em latitude −28,66355384°, longitude −53,60602301°. O norte aponta para −Z, o leste para +X e a vertical para +Y. O piso técnico usa cota relativa zero. Não há amarração altimétrica de campo entre ele e o modelo digital do terreno. O centro e a altitude do link Earth descrevem a câmera. A malha técnica é gerada diretamente em metros locais.

A transformação geográfica usa Mercator esférico com raio de 6.378.137 m. Translada as coordenadas projetadas da origem para zero e multiplica as diferenças pelo cosseno da latitude de origem. O sentido da coordenada norte é invertido para formar Z. O inverso remove esses fatores antes de recuperar latitude e longitude. A aproximação é local à unidade.

Para a folha A1, as coordenadas U/V da matriz serviram à identificação. A geometria foi traçada em pontos PDF multiplicados por 0,7, com origem no canto superior esquerdo da folha. Nesse sistema, o comprimento da barra de 80 m é 198,425 unidades gráficas, equivalente a 0,403175 m/unidade. O ajuste independente pela imagem forneceu 0,403899 m/unidade, diferença relativa de 0,18%. A fotografia embutida coincide entre as folhas das revisões 43 e 56.

O ajuste de similaridade utiliza quatro feições distribuídas da imagem do solo. Cinco outras feições verificam os resíduos na referência métrica World Imagery, Web Mercator, nível 18, aproximadamente 0,524 m/pixel no centro. As duas matrizes, os pares de coordenadas e os resíduos individuais estão em [registro.json](registro.json). A sobreposição da imagem original com o ajuste fica no material privado de conferência.

| Ponto independente | Afastamento horizontal |
| --- | ---: |
| Farelo, aresta externa de cobertura | 4,37 m |
| Silos sul, borda visível do costado | 5,52 m |
| Pátio do Armazém 01, aresta do depósito | 2,45 m |
| Oeste, canto de cobertura baixa | 3,54 m |
| Extração, aresta junto ao pátio | 3,29 m |

O RMSE horizontal é **3,97 m** e o resíduo máximo é **5,52 m** nesses cinco pontos. A tolerância de 6 m serve à comparação visual horizontal desta implantação com essas imagens, arredondando para cima o maior resíduo observado. Ela não se transfere automaticamente a outras feições. Arestas altas incluem paralaxe. Um levantamento no chão com pontos de controle e cotas de referência resolveria a diferença entre posição aparente dos beirais e implantação. Em código, a maior diferença na ida e volta geográfica dos nove pontos foi 1,05 × 10⁻⁹ m.

A matriz de semelhança não é uma certificação das dimensões de cada estrutura. Os polígonos têm contornos interpretados; o erro individual continua desconhecido nos setores sem ponto independente. Alturas visuais e larguras de telhado não têm residual altimétrico medido. O anexo [lacunas por estrutura](lacunas.md) identifica a medição necessária para cada caso.

## Estruturas, superfícies e contexto

A cena contém 96 volumes técnicos, 86 traçados que representam 73 itens posicionados, sete setores e 56 estruturas físicas. Uma estrutura pode agrupar componentes ou galpões contíguos com pisos e níveis distintos. O item 20 mantém sua ficha como “Fora do projeto”, com localização individual pendente. O item 29.2 conserva a individual histórica e a retirada do layout 44. O item 28.1 aparece desde a revisão 47. O 39.1 consta como aprovado e “A montar” desde a 49.

| Setor | Evidência usada na representação | Divergência ou limitação |
| --- | --- | --- |
| Armazém 01 | Arco, anexo de duas águas e cumeeira na DJI 44 e conjunto 11/56 | Vão estimado 28,80 m. Linha 56 de 13,20 m no conjunto e individual, 15 m no quadro geral |
| Casca | Naves, lateral, dois lanternins, retorno em L. O conjunto informa inclinação de 25° para 04/05 e 7,7% para 03/46 | Quatro trechos em 06 no quadro, seis na descrição herdada. Faltam cotas de piso e beirais |
| Preparação | Torre, níveis, platibanda e teto alto do 28.1 documentados em conjunto | Níveis mostrados como estimativa no desenho. Faltam cortes cotados referindo-se a um piso comum |
| Caldeiras | Caimentos paralelos em 16/35 e posição frontal de 62 perpendicular ao 09 | A LVHF 62 mede 12 m no desenho e 15 m no quadro. A figura de conjunto fornece comprimento e vão aproximados para 62 |
| Ferrovia | Dois eixos no corredor visível, corrigidos na imagem da prancha girada para alinhar os trilhos | Bitola, dormentes, greide e término fora do recorte requerem planta de via permanente |
| Moegas e carregamento | Divisão em faixas e diferenças de nível pelos conjuntos de recebimento e expedição | Corte transversal do encontro com Armazém 02 e levantamento de pilares confirmariam pés-direitos e contatos |
| Silos e reservatórios | Centros e intervalos lidos individualmente na fotografia, galeria da bateria sul e travessia sobre as naves | Identificação descritiva para corpos sem plaqueta visível. Capacidade, conteúdo e níveis requerem documentação própria |

O perímetro usado na navegação é um envelope dos sólidos técnicos. A área operacional interpretada, as continuidades visíveis no entorno e o limite de propriedade são conceitos distintos. O limite patrimonial ainda depende de base cadastral. Três silos pequenos e as coberturas na divisa oeste integram o contexto de menor detalhe. O rótulo “Sementes Aurora UBS” visível no Earth não estabelece a titularidade daquelas edificações.

O pavimento tem diferentes acabamentos nas imagens. Há pátio de manobra com rastros de giro, trechos de terra avermelhada, bordas irregulares junto à vegetação e limites duros em torno dos reservatórios. As manchas de cor e o agregado são gerados para a cena. O detalhe de grão usa escala de 1,60 m por textura, com variação independente de 18,5 e 122 m. Onde a composição do piso não pôde ser identificada, a cena usa um piso mineral interpretado. No corpo norte 6, o acabamento claro se limita ao dique visto no vídeo a 150 s. A mediana sRGB do trecho iluminado foi (227, 229, 228), e o material local usa #dcdedd com rugosidade 0,88. O ressalto visual de 0,60 m depende de confirmação em corte. Uma vistoria de materiais ou projeto de pavimentação definiria composição e espessura.

A conferência no Earth com norte para cima abrangeu fábrica, bairro, cidade e arredores. De dentro da unidade, a vizinhança urbana tem maior continuidade para norte e nordeste. A margem leste intercala vegetação densa, águas e áreas abertas. Campos a oeste variam em forma e cor, incluindo trechos de solo exposto e faixas vegetadas sinuosas. O fundo regional serve à leitura desses horizontes. O passeio e os alvos da câmera permanecem na implantação técnica.

## Registro do mosaico óptico e horizonte

A grade regional cobre 59 × 58 km. A grade próxima de 14,4 × 14,4 km tem altitudes a cada 37,5 m e cores naturais reamostradas a 3,516 m/pixel. Nos 3,2 × 3,2 km centrais, o recorte CBERS-4A/WPM de 09/08/2026 mantém 2 m/pixel. Os cinco derivados se identificam por SHA-256 no manifesto regional. As cotas regionais usam o DSM Copernicus GLO-30, datum EGM2008. A altitude de referência para subtração é 464,24 m. A costura preserva a cota local do pátio e interpola para o relevo adjacente. A curvatura da Terra entra no horizonte distante com raio médio de 6.371.008,8 m.

A comparação da folha registrada de 24/08 com o CBERS de 09/08 permitiu conferir um desvio local sistemático. Quatro janelas em feições de chão forneceram o deslocamento de amostragem da cor de **−12 m em X e +1,5 m em Z**. Seis janelas adicionais verificaram a translação. O RMSE dessas verificações passou de **15,23 m para 6,58 m**. O maior resíduo foi **10,69 m**, na entrada da faixa verde junto à nave contígua ao 56. As diferenças incluem resolução, sombra, borda de copas e datas de aquisição. Os controles e os resíduos estão em [registro-cbers.json](registro-cbers.json).

O shader aplica a translação ao mosaico próximo dentro de um raio de 310 m do centro da implantação. A amplitude decresce suavemente até zero a 620 m. O fundo urbano além desse raio conserva o registro do INPE. O DEM, os objetos técnicos e os arquivos de imagem mantêm seus valores originais. A tolerância de 6 m da comparação A1 × World Imagery se refere àquele par de fontes. Para o CBERS, os resíduos acima descrevem o limite verificável da comparação.

A massa do bairro usa **889** contornos externos do OpenStreetMap generalizados em uma malha. Um deles tem número de pisos registrado. Os demais têm altura de silhueta estimada em 3 m. O subconjunto distribuído contém somente contornos e contagem de pisos, em quartos de metro relativos à origem local. O script `scripts/cruz-alta/edificacoes_entorno.py` regenera as feições a partir da consulta pública indicada no JSON distribuído sob ODbL. As formas ajudam a identificar a cidade vista da fábrica e têm finalidade de contexto. [© OpenStreetMap contributors e termos de atribuição](https://www.openstreetmap.org/copyright).

As árvores próximas usam ramos e conjuntos de folhas com transparência recortada, instanciados até 50 m do observador com transição progressiva. As árvores distantes usam massas de copa mais simples. Elimina-se a representação de detalhe nas posições das edificações, pátios abertos, faixas de água e vias traçadas. A presença das árvores individuais representa a massa vegetada observada. O inventário botânico e as alturas individuais continuam pendentes.

## Reprodução

Execute `node --import tsx --test tests/cruz-alta/levantamento.test.ts` para verificar hierarquia, 74 registros, 73 traçados identificados, histórico, caimentos em relação ao eixo, ida e volta dos pontos e continuidade do relevo na borda do piso técnico. O ensaio visual usa as poses guardadas em `refinamento/antes/cameras.json` e `refinamento/depois/cameras.json`. Para reproduzir o cotejo óptico diretamente do anexo, execute `python3 scripts/cruz-alta/verificar_registro_cbers.py --pdf /caminho/para/layout.pdf` com PyMuPDF, Pillow, OpenCV e NumPy. A visualização em planta aceita a prancha local e opacidade ajustável. A DJI 44 oferece a pose oblíqua estimada, e o encontro 11/56 mostra o arco e a cumeeira do anexo.

O script `scripts/cruz-alta/conciliar_inventario.py` recebe a árvore recursiva, os originais e o inventário revisado, e grava um novo snapshot. Para mudança de bytes em uma origem conhecida, exige nova conferência do conteúdo, carimbo e destinos. O sistema guarda a revisão anterior em sua associação lógica. O arquivo de trabalho detalhado, as imagens de controle e os quadros do vídeo ficam no acervo privado da entrega.
