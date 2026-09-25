# Geometria CAD: fonte, cache e redução

Este documento descreve o caminho técnico entre a fonte CAD confirmada pelo usuário e as partições da planta existente. O cadastro e a transformação local ficam em [`site.json`](../../src/industrial/data/site.json). A confirmação da identidade da unidade não transforma a implantação fotográfica em levantamento geográfico ou a geometria do arquivo em verificação de campo.

## Fonte e cobertura da revalidação

A entrada é o XML `3D/3dmodel.model` extraído do arquivo 3MF da planta de Giruá. A fonte tem **322.380.101 bytes**, unidade declarada em milímetros e SHA-256:

```text
bd6767218d609c1e4180e27169fcc5345c56e554e6f320a812e7a7da1ae2702b
```

O original fica fora do repositório. O extrator não executa código contido no XML, não resolve entidades externas e verifica o hash antes de produzir o cache. A leitura em fluxo valida índices dos triângulos, referências, ciclos e a hierarquia `build`/`components`.

| Inventário da fonte | Contagem |
|---|---:|
| Recursos | 4.157 |
| Objetos / grupos de cores | 2.150 / 2.007 |
| Definições de malha / montagens | 2.007 / 143 |
| Referências de componentes | 2.639 |
| Vértices / triângulos únicos | 2.263.469 / 4.536.256 |
| Nós expandidos / ocorrências de malha | 16.254 / 15.621 |
| Triângulos após expandir todas as ocorrências | 32.966.484 |

Todos os objetos são alcançáveis; a auditoria não encontrou IDs duplicados, referências ausentes, índices de triângulos inválidos ou ciclos. Os limites foram medidos nos **vértices originais transformados**, não nos cantos de caixas previamente calculadas. As 13 raízes, 25 métricas de estruturas, quatro eixos de silos e seis distâncias entre esses eixos estão em [`cad-source-goldens.json`](evidence/cad-source-goldens.json). A revalidação direta encontrou diferença zero frente aos derivados fornecidos para os limites e eixos comparados. O teste de ida e volta pelo cache encontrou erro máximo de `1,421085e-14 m` nas métricas verificadas.

Essas verificações abrangem a geometria presente no arquivo. Não revalidam volumes sólidos, folgas entre superfícies, diâmetros nominais de fabricação, capacidade dos equipamentos, OBBs ou posição real no terreno. Uma caixa alinhada aos eixos de uma montagem inclui seus acessórios e não equivale ao diâmetro do corpo de um silo.

## Extração reproduzível

Requisitos: Python com NumPy e lxml; Blender é necessário somente na geração seguinte. [`run-cad.mjs`](../../scripts/run-cad.mjs) usa `CAD_PYTHON` quando definido, procura o runtime local disponível e testa as dependências antes de iniciar [`extract_model.py`](../../scripts/cad/extract_model.py).

```powershell
npm run assets:extract -- --source "C:\caminho-local\3D\3dmodel.model"
```

`--reference-dir` permite conferir novamente os derivados de auditoria fornecidos; `--cache-dir` altera o destino local. `--help` lista os parâmetros. O hash esperado está vinculado à fonte acima: apontar o extrator para outro modelo exige uma revisão explícita de fonte, cadastro e referências de teste.

O destino padrão, `assets/industrial/raw/cad/`, é ignorado pelo Git. Não é necessário publicar o XML nem o cache para o navegador. Um clone precisa da fonte local autorizada para regenerar o CAD; os GLBs de `public/models/3tentos/` são suficientes para executar a aplicação. Esta execução altera somente arquivos locais.

| Arquivo local | Contrato |
|---|---|
| `geometry-cache.npz` | `v_<objectId>`: matriz `float64`, N×3, vértices locais em **metros**. `f_<objectId>`: `uint32`, M×3, índices de triângulos. |
| `cad-manifest.json` | `objects` por ID e `instances` por caminho original, com nomes técnicos, pais, filhos, matrizes locais/mundiais e limites. |
| `cad-geometry-costs.json` | Custo único e expandido por definição, frequência, dimensões e montagens pais. |
| `cad-cache-validation.json` | Resultado da validação do cache e da fonte correspondente. |

As matrizes do manifesto são listas **4×4 em ordem de linhas**, aplicadas a vetores coluna. Já `site.cadRegistration.matrixColumnMajorMeters` usa a convenção column-major explicitada no nome. Os vértices do NPZ já passaram de milímetros para metros: multiplicá-los novamente por `0,001` é incorreto.

## Posicionamento e identidade

Cada folha mantém `sourceObjectId` e `sourceInstancePath`. As partições selecionam caminhos e excluem subárvores atribuídas a outros elementos; o gerador rejeita uma ocorrência CAD atribuída a dois proprietários. Repetir a mesma definição em posições distintas não constitui duplicação indevida: são instâncias originais da montagem.

O caminho de transformação é:

```text
vértice CAD local em metros
  → matriz mundial da ocorrência original
  → registro rígido CAD/Nexus, escala 1
  → base Blender (x, -z, y)
  → GLB com Y vertical
```

A transformação global é aplicada uma vez no Blender e fica incorporada aos vértices do GLB. O React não aplica novamente posição, rotação ou escala do cadastro ao ativo CAD. A convenção local aprovada usa rotação de π em Y e mantém a média dos quatro eixos no centro local escolhido; orientação geográfica e datum vertical de campo continuam `UNRESOLVED`. As cotas subterrâneas permanecem relativas ao CAD, inclusive valores abaixo do plano local.

O cadastro preserva IDs Nexus e separa nome exibido, nome CAD, identificador técnico, confirmação e estado da associação. Os arquivos compactos em [`assets/industrial/cad`](../../assets/industrial/cad) permitem reproduzir a integração do cadastro sem depender de uma pasta Downloads ou do cache de malhas.

## Redução por definição, sem alterar a montagem

[`cad_geometry.py`](../../scripts/blender/cad_geometry.py) reduz uma definição uma vez por LOD e reutiliza o resultado em todas as suas ocorrências. O casco convexo, planos de suporte e estruturas de consulta também são compartilhados entre LODs. A redução não desmonta escadas, plataformas ou tubulações para reposicioná-las visualmente.

1. Trabalha sobre os triângulos originais. Os experimentos descartaram soldagem e dissolução coplanar anteriores ao Decimate porque alteravam topologia ou extremos em amostras da fonte.
2. Protege pontos de suporte da geometria. Peças secundárias começam com 26 direções do cubo e 32 direções distribuídas na esfera; componentes principais e cotas críticas protegem todos os vértices do casco mais os suportes de referência.
3. Usa Decimate com peso 1 nos pontos protegidos, grupo invertido e fator 1.000. A semântica da inversão foi verificada em Blender 4.5.10.
4. Projeta pontos novos que ultrapassem o casco de volta à superfície desse casco. O deslocamento dessa correção é registrado separadamente do erro final. Os planos de suporte usam o máximo sobre todos os vértices da fonte para evitar erro numérico em facetas quase colineares.
5. Compara os limites locais e os suportes em **518 direções** — seis eixos e 512 direções na esfera. Se exceder 2 mm, acrescenta os suportes que falharam e tenta novamente a partir da malha original. A última tentativa protege todo o casco; uma falha remanescente interrompe a geração.

Os alvos são 300/100 triângulos para peças secundárias high/low e 100/40 para peças com maior dimensão até 15 cm. São alvos, não garantias: furos e pontos protegidos podem impedir atingir esse número. O corpo do silo `3730` usa 22.000/8.000; a cobertura `3728` tem apenas 480 triângulos na fonte e permanece integral nos dois níveis. Paredes, bases e subterrâneos identificados têm tratamento conservador próprio.

O limite de 2 mm mede envolventes e suportes amostrados. **Não certifica erro máximo em toda a superfície** nem distância de Hausdorff. Essa limitação fica explícita em `surfaceErrorCertified: false`. Por exemplo, uma correção exterior de 22,424 mm observada no corpo low é a distância do ponto criado pelo Decimate antes da projeção; o erro final de suporte desse ensaio foi menor que 0,001 mm.

### Perfurações omitidas somente em painéis low identificados

Uma lista explícita de sete folhas permite remover furos de painéis finos no low/blockout. Mantém o contorno convexo original, espessura, posição e material da folha. Os mesmos painéis high preservam a topologia perfurada. Não se aplica a escadas completas, longarinas, tubulações, corpo ou cobertura dos silos.

| IDs de definição | Identificação na montagem | Resultado low de referência |
|---|---|---:|
| 640, 752 | Pisos 2×1 m de `PLTF4X2-ST-M000 Superior Elevador` | 12 triângulos por folha |
| 1041 | Piso 1,025×1 m de `PLTF2X1-ST-M000 Lat Dir Aberta Elevador` | 12 |
| 1381, 3747 | Pisos 2×1 m de `PLTF2X1-ST-M000` | 12 por folha |
| 1496, 1498 | Painéis finos de `Grade de Proteção`, 1×2,23 m e 0,89×2,23 m | 228 / 244 |

Esses valores são de ensaios por definição; não são a contagem total dos ativos finais. Os sete casos mantiveram limites locais com erro inferior a `0,000108 mm` e suportes amostrados com erro inferior a `0,095 mm`. O painel 3747 high permaneceu em 11.076 triângulos mesmo com somente oito pontos protegidos: nesse caso os furos, e não a quantidade de pontos protegidos, determinam o custo mínimo.

Ferragens muito pequenas podem ser omitidas por ocorrência conforme o LOD. Os caminhos omitidos são registrados e qualquer peça necessária para preservar um extremo da montagem é restaurada. Os limites da montagem são conferidos novamente depois das transformações mundiais; esse teste não pode ser substituído por um teste apenas no eixo local de cada peça.

## Geração parcial e evidências

`--sectors` controla a geração parcial. Alterar um setor de silos inclui high, low e blockout como dependências. O gerador abre o `.blend` existente quando disponível, substitui as coleções selecionadas e registra setores gerados e hashes dos GLBs preservados em `assets/industrial/raw/generation-manifest.json`. Uma execução parcial não demonstra, por si só, que todas as coleções de uma fonte `.blend` recém-criada estão presentes.

A revisão regenerou e validou oito setores: `terrain`, `buildings`, `grain-handling`, `silos-high`, `silos-low`, `fences`, `grass` e `blockout`. Os GLBs `vegetation-prototypes` e `vegetation-low` foram preservados, com hashes conferidos. O relatório [`gltf-validation.json`](evidence/gltf-validation.json) distingue as oito validações atuais das duas validações anteriores de ativos preservados; os dez registros têm zero erros e avisos, e os tamanhos registrados correspondem aos arquivos entregues.

O otimizador aceita apenas setores presentes no manifesto atual, valida o conjunto selecionado em uma pasta intermediária e só então promove os GLBs. O relatório distingue `validated-current-generation` de `preserved-asset-prior-validation`. Falha de validação não autoriza publicar parcialmente esse conjunto.

A auditoria [`cad-export-topology.json`](evidence/cad-export-topology.json) explica exatamente as diferenças entre as contagens de entrada e os triângulos presentes no `.blend` final: em cada LOD, a definição `487` contém oito triângulos com índices repetidos, e as definições `791` e `873` contêm duas faces duplicadas cada. Essas entradas não foram materializadas na malha exportável. Contando suas ocorrências nas partições e variantes geradas, são 16 triângulos com índices repetidos e 32 duplicatas omitidos; os números incluem repetições entre LODs. A correspondência usa os índices dos vértices, sem tolerância geométrica. Ela não certifica nem remove indiscriminadamente outros triângulos de área zero que possam existir no CAD.

Evidências de cada etapa:

- [`cad-source-goldens.json`](evidence/cad-source-goldens.json): referências independentes extraídas da fonte original.
- [`cad-reduction-samples.json`](evidence/cad-reduction-samples.json): ensaios locais por definição, incluindo alvos, resultados e limites; não substituem a geração completa.
- [`cad-generation.json`](evidence/cad-generation.json): definições reduzidas, partições, proprietários de ocorrências, omissões e erros de envolvente da geração registrada.
- [`cad-export-topology.json`](evidence/cad-export-topology.json): conciliação das contagens com as faces de índices repetidos e duplicadas omitidas na exportação.
- [`gltf-validation.json`](evidence/gltf-validation.json): validação estrutural dos GLBs compactados e decodificados.
- [`validation.md`](validation.md): conclusão de validação técnica, visual e de desempenho da revisão.

Validade estrutural do glTF, medidas corretas e redução de triângulos são verificações diferentes. A aparência de materiais, perfurações low, escadas, conexões e subterrâneos exige inspeção visual; desempenho exige medição no navegador e não pode ser concluído somente pela contagem de triângulos.

## Tangentes em triângulos estreitos

Alguns GLBs brutos exportados pelo Blender 4.5.10 continham tangentes `[0, 0, 0]` em um canto de triângulos CAD estreitos, apesar de posições, normais e coordenadas UV válidas. O problema já existia antes da compressão. Uma reprodução com apenas o triângulo 2632 do corpo `3730` low produziu novamente o vetor zero; centralizar suas coordenadas eliminou a falha naquele ensaio. Isso demonstra sensibilidade numérica do cálculo de tangentes, sem evidência de uma face de área zero nesse caso.

Uma tangente, junto à normal e ao sinal de orientação, define como aplicar o relevo do material à superfície. [`repair-industrial-tangents.mjs`](../../scripts/repair-industrial-tangents.mjs) corrige somente vetores exportados inválidos, antes de weld/deduplicação:

- Escolhe, entre os triângulos incidentes válidos, aquele com maior área UV.
- Calcula as derivadas da posição em relação a U/V em precisão dupla, remove da tangente sua componente na direção da normal e normaliza o resultado.
- Deriva o sinal de orientação pela bitangente, em vez de copiar o sinal anexado a um vetor zero.
- Confere a base ortogonal depois de gravá-la no atributo e rejeita cantos sem derivada UV válida.
- Compara hashes de todos os demais atributos, índices e modo da primitiva antes/depois. Posições, normais, UVs e topologia permanecem idênticas.

Tangentes válidas são mantidas. O reparo não desativa nenhuma regra do Khronos Validator. O otimizador registra `tangentRepairs` por ativo; a validação do GLB compactado e de sua versão decodificada continua obrigatória.

Os quatro testes incluem o triângulo real que reproduziu a falha, UVs espelhadas, escolha da derivada e rejeição de UVs degeneradas:

```sh
node --test tests/industrial/tangent-repair.test.mjs
```

[`cad-tangent-repair-diagnostic.json`](evidence/cad-tangent-repair-diagnostic.json) preserva a reprodução isolada e o diagnóstico dos intermediários. Os oito GLBs brutos dessa rodada passaram com zero erros e avisos após reconstruir somente as tangentes inválidas. Esse diagnóstico não substitui o relatório de validação dos ativos finais em [`gltf-validation.json`](evidence/gltf-validation.json).
