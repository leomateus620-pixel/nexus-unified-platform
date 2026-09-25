# Integração CAD incremental — 3Tentos

## Decisão e domínio da calibração

A identidade da unidade foi confirmada pelo usuário e a integração por uma convenção local foi autorizada. Esta revisão mantém o sistema Nexus e a base fotográfica existentes. O CAD mantém suas dimensões reais depois de converter milímetros para metros. A transformação entre os sistemas é rígida: **não há escala corretiva, deformação nem ajuste independente de cada estrutura**.

`site.json` permanece a fonte central de cadastro, identificação, posição, geometria, câmeras, limites e proveniência. Os nomes exibidos são convenções técnicas relacionadas ao CAD. A numeração SILO-01…04 conserva a identidade Nexus e **não é numeração operacional oficial**. Orientação geográfica e datum vertical de campo continuam `UNRESOLVED`.

O cadastro distingue `name`, `identification.cadName`, `identification.technicalIdentifier`, `identification.associationStatus`, `identification.identityStatus` e `identification.nameStatus`. Os registros alterados preservam os valores fotográficos anteriores em `cad.legacySnapshot`. Edificações ED-02/ED-03, faixa PV-01 e elemento EQ-03 permanecem sem associação inequívoca e conservam sua geometria. Todos os 20 IDs anteriores permanecem presentes.

## Transformação CAD → Nexus

Fonte: objeto raiz 1, “Planta 3D - 3Tentos Agroindustrial - Giruá”, arquivo original reextraído `3dmodel.model`, SHA-256 `bd6767218d609c1e4180e27169fcc5345c56e554e6f320a812e7a7da1ae2702b`. A auditoria fornecida o identificava pelo alias `8ae5c19b-e1af-4dc4-9c7c-215a3f18c58d.model`, preservado em `source.auditFilename`; o hash confirma o mesmo conteúdo.

- Conversão dos vértices CAD: `0.001` mm→m. Matrizes de cadastro já estão em metros; não multiplicar novamente suas translações por `0.001`.
- Centro horizontal dos quatro eixos CAD: `[25.59320947275, -6.15767129525]` no plano XZ.
- Centro horizontal dos quatro silos anteriores no Nexus: `[-0.16, 0]`.
- Referência vertical CAD: plano superior do terreno `Y=0.010 m`; convenção Nexus: `Y=0`. Esta é uma referência local, sem datum de campo.
- Rotação global: `Ry(π)`, sem reflexão ou mudança de escala.
- Translação: `[25.43320947275, -0.01, -6.15767129525] m`.

Assim, para qualquer ponto CAD já convertido em metros:

```text
xNexus = 25.43320947275 − xCAD
yNexus = yCAD − 0.010
zNexus = −6.15767129525 − zCAD
```

Matriz column-major: `[-1,0,0,0, 0,1,0,0, 0,0,-1,0, 25.43320947275,-0.01,-6.15767129525,1]`.

A escolha de π conserva os eixos principais da composição e coloca moegas em +Z, escritório em +X/−Z e pavilhão de agrotóxicos em +X/+Z, de acordo com os setores da base fotográfica. O ajuste não procura encaixar os comprimentos estimados antigos. O CAD passa a ter distâncias entre eixos de aproximadamente 24 × 20,995 m, em vez de 20,8 × 20,48 unidades estimadas. A correspondência é registrada como `local_integration`, `user_confirmed` e `HIGH_CONFIDENCE` da convenção técnica; não é um ajuste fotogramétrico ou georreferenciamento medido.

| ID Nexus conservado | Raiz CAD | Eixo Nexus X,Y,Z em metros           |
| ------------------- | -------: | ------------------------------------ |
| SILO-01             |     4136 | −12.16000048825, .1, −10.49750088525 |
| SILO-02             |     4125 | 11.83999723830, .1, −10.49749523527  |
| SILO-03             |     4147 | −12.15999626180, .1, 10.49749554077  |
| SILO-04             |     1531 | 11.83999951175, .1, 10.49750057975   |

`cad.worldMatrixCadMeters` conserva a matriz do pivô de origem; `cad.worldMatrixNexus` é a composição com a matriz global. `position` e `anchors` são referências de apresentação/foco (eixo/base nas formas circulares, centro da base/parede nas demais), não autorização para aplicar uma segunda transformação à malha.

`cad.geometryFrame` explicita que `geometry.width/depth` descrevem partes/envelopes nos **eixos mundiais finais do Nexus**, enquanto `rotation` e `worldMatrixNexus` descrevem o pivô da ocorrência CAD. Não combinar width/depth com rotation para reconstruir uma caixa orientada: isso pode girar uma segunda vez medidas já expressas no mundo. Consumidores geométricos usam a matriz completa de origem ou o footprint explícito; a rotação real não é zerada para compensar um erro de interpretação.

## Partições de renderização e identidade

Cada `sourcePaths` inclui a respectiva subárvore. `excludedPaths` remove subárvores já pertencentes a outro elemento. A associação deve ser feita pelo **caminho da instância**, pois o mesmo `objectId` pode aparecer em mais de um lugar. Não importar a raiz completa e os componentes separados simultaneamente.

| Elemento proprietário  | Subárvore incluída         | Subárvores excluídas | Observação                                                                                      |
| ---------------------- | -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| SILO-01…04             | raízes 4136/4125/4147/1531 | nenhuma              | Mantém corpo, cobertura e acessórios de cada montagem                                           |
| ED-01                  | 480                        | 487                  | Arquitetura do pavilhão, sem duplicar moegas/poços                                              |
| ED-04                  | 4120                       | nenhuma              | Escritório e cobertura arquitetônica                                                            |
| ED-05                  | 903                        | nenhuma              | Pavilhão de agrotóxicos                                                                         |
| EQ-01                  | 1511                       | nenhuma              | Elevador dos silos                                                                              |
| EQ-02                  | 1009                       | 1508 e 1511          | Conexões, acessos, plataformas e escadas dos silos; substitui a ligação estimada sob o mesmo ID |
| CAD-HOPPER-PITS        | 487                        | nenhuma              | Moegas e poços; filho lógico de ED-01                                                           |
| CAD-HOPPER-ELEVATOR-01 | 489                        | nenhuma              | Elevador das moegas 01                                                                          |
| CAD-HOPPER-ELEVATOR-02 | 505                        | nenhuma              | Elevador das moegas 02                                                                          |
| CAD-SILO-PIT-TUNNELS   | 1508                       | nenhuma              | Poço e túneis subterrâneos dos silos                                                            |
| CAD-HOPPER-CONNECTIONS | 5                          | 480, 489, 505        | Conexões/acessos e complementos da cobertura da montagem de moegas                              |
| CAD-WATER-TANK         | 4117, 4113, 858            | nenhuma              | Caixa d’água, sua escada e montagem superior, uma identidade                                    |
| CAD-OFFICE-ROOF        | 912                        | nenhuma              | Conjunto superior da cobertura; filho lógico de ED-04                                           |

São 27 registros e 16 proprietários CAD. `parentId` é vínculo lógico para a interface; as matrizes já são de mundo, portanto esse vínculo **não deve reaplicar o movimento de seu pai**. Os novos objetos entram nos setores existentes; a presença de sete novos registros não implica sete novos downloads.

O elemento circular fotográfico EQ-03 continua distinto da caixa CAD-4117: suas posições não coincidem depois de uma transformação global coerente. Não renomear EQ-03 como caixa d’água apenas por sua forma.

## Limites, cotas e colisões

`bounds` descreve o envelope do conjunto efetivamente atribuído ao elemento; `anchors.base/center/top` sustentam seleção e câmera; `footprint` é envolvente convexa XZ dos vértices reais da partição atribuída, usada no mapa/inspeção. Filhos de `excludedPaths` não contribuem. A convexificação pode preencher espaços entre peças desconectadas, e a projeção inclui beirais, saliências e peças elevadas: **não é footprint arquitetônico nem automaticamente um obstáculo no solo**. Os silos conservam a envolvente convexa do corpo como referência do símbolo em planta.

- Silos: obstáculo conservador do envelope externo do corpo. Ø≈18,816 m inclui detalhes externos; diâmetro nominal permanece `UNRESOLVED`. A altura 14,5 m é envelope do corpo CAD, não altura nominal certificada da chaparia.
- `geometry.baseHeight=0` nos silos significa que não se acrescenta uma segunda base procedural: a região de base já está incluída no corpo CAD. Não significa ausência física de base nem confirma uma altura nominal zero; a definição está explícita em `baseHeightDefinition`.
- ED-01/ED-04/ED-05: colisão fechada derivada da **face exterior das paredes** 481/4123/906, não do telhado ou da AABB de uma montagem que inclui equipamentos. O fechamento mantém a navegação externa existente; a remoção de obstáculos do beiral não cria um recurso de exploração de interiores.
- Elevadores: envelope estreito do próprio corpo, sem bloquear a área entre tubos.
- EQ-02/conexões: sem bloqueio pelo envelope integral da montagem.
- Poço/túneis CAD-1508: base `Y=−6.764 m`; moegas/poços CAD-487: base `Y=−9.825 m`. Permanecem subterrâneos. Sem deslocamento para Y=0 para facilitar a visualização.
- `terrain.surfaceHeights` descreve pisos **já existentes**: site .005, yard .08, islands .12, access .085, highway .0875 m. São offsets da base Nexus preservada, não nova altimetria CAD. O passeio usa o piso local e a altura de observação, sem alterar as estruturas CAD.
- Também são registrados os pisos preservados do entorno: environment −.1, northSoil −.07, yardShoulder .04, com início da faixa norte em Z=−68. TR-02 mantém `geometry.width=7.2` como estimativa histórica e `geometry.renderedWidth=9` como largura que o gerador já desenhava; o acesso não foi estreitado para esconder essa divergência.

As matrizes CAD completas são a referência geométrica; `rotation` contém somente o yaw diagnóstico para consumidores simples. Escadas, plataformas, equipamentos e tubulações devem ser processados pela hierarquia/matriz, não reconstruídos a partir de AABBs. Na caixa d’água, `bodyWidth/bodyDepth=1.62` e `bodyHeight/height=7.8` descrevem o reservatório; `bounds` inclui escada e montagem superior até Y≈10.096887. O foco usa o envelope completo sem modificar a altura do reservatório.

### Recortes e fechamentos de fachada existentes no CAD

A inspeção das malhas 481/4123/906 encontrou quatro vãos nas moegas, oito recessos/recortes no escritório e um recorte no pavilhão de agrotóxicos. As quatro aberturas das moegas estão livres no teste de raio central através de .5 m da parede. Os oito recessos do escritório já possuem superfícies de fechamento na própria malha a .20 m da face exterior; o pavilhão de agrotóxicos possui fechamento a .15 m. Portanto não se acrescentam aberturas nem planos duplicados para recuperar acabamento.

No escritório, as seis superfícies elevadas medem 2 × 1.5 m, com Y CAD [.835,2.335]; são os triângulos originais 144–151 e 154–157 (índices base zero). Os dois fechamentos baixos são os triângulos 152/153 e 158/159. Materiais de esquadrias podem ser reaproveitados nessas faces existentes, preservando posição e topologia. A interpretação visual do material permanece `INFERRED`, separada da geometria CAD verificada. Evidência: `evidence/cad-wall-openings.json`, reproduzida por `scripts/cad/inspect-wall-openings.py`; raios centrais não equivalem a prova completa de topologia sólida.

## Conflitos localizados identificados antes de alterar a base

Os conflitos abaixo foram apresentados antes da intervenção. O usuário autorizou as correções localizadas de duas árvores, cerca, contorno e piso da caixa; o migrador registra os pontos anteriores e os adicionados em `cadRegistration.localAdjustments`. Pátio, ilhas, acesso e rodovia permanecem iguais, assim como os vértices originais de contorno/cerca e 151 das 153 posições vegetais. Os números abaixo são análises em planta, não declaração de interseção de todos os triângulos.

| Conflito                                                   | Evidência                                                                                                                                                                              | Menor intervenção proposta                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duas plantas podadas dentro de ED-05 corrigida             | `trees[70]=[50.56,0,58.24]`, `trees[71]=[54.4,0,58.24]`; paredes CAD transformadas X[48.306209,58.706209], Z[48.842329,59.242329]                                                      | Deslocar apenas essas duas instâncias dentro do canteiro inferior, propondo Z≈61.0, mantendo ID, tipo, variante, rotação e altura; verificar copas/fence antes de consolidar         |
| Caixa d’água atravessa o cercamento e contorno fotográfico | Eixo [−59.953791,0,62.860329]; montagem X[−60.981034,−59.143791], Z[62.050329,63.670329]. Cerca CE-01 passa a cerca de 1 cm do eixo; 18/37 pontos do casco ficam fora do contorno site | Ajustar somente o trecho frontal junto à caixa com um pequeno desvio, preservar demais segmentos; estender somente o contorno/piso nesse ponto. Não mover a caixa nem escalar a cena |
| Silos inferiores ultrapassam o canteiro central estimado   | Novos envelopes chegam a Z≈19.90, enquanto parte da borda da ilha central está em Z≈16.4                                                                                               | Revisar exclusão local de grama e encontro base/piso; manter implantação real CAD e não alargar toda a ilha sem confronto visual                                                     |

### Correções aplicadas e medidas

- Árvores 70/71: novo Z=61.0, mantendo X/Y, ID VG-02, tipo trimmed, altura 1.8, variantes e rotações. Usando os vértices dos protótipos GLB preservados: 5.225/5.170 vértices estavam no volume fechado das paredes de ED-05 antes; **zero** depois. Distâncias mínimas dos vértices à cerca: 3.06235/2.94208 m.
- CE-01: adicionados `[-63,62.79320498301]`, `[-63,65]`, `[-57,65]`, `[-57,62.90192525481]` entre os vértices existentes `[-67.04,62.72]` e `[74.24,65.28]`. Nenhum vértice original foi removido.
- Contorno site: adicionados `[-57,62.89856]`, `[-57,65.5]`, `[-63,65.5]`, `[-63,62.80256]` entre `[91.84,65.28]` e `[-68.16,62.72]`. Acréscimo localizado **15.89664 m²**, preservando o restante do traçado.
- Montagem completa caixa/escada: folga mínima do retângulo envolvente à cerca **1.32967 m**, superior à margem de .5 m. Todos os cantos ficam dentro do contorno ajustado.
- Piso `CAD-WATER-TANK-PAD`: retângulo X[−61.48103376525,−58.64379052725], Z[61.55032870475,64.17032870475], material concreto, topo Y=.008. A margem é .5 m ao redor dos bounds completos, e o topo fica .003 m acima da superfície site existente para evitar sobreposição visual. `relatedElementId=CAD-WATER-TANK` mantém a ligação ao cadastro; o piso não movimenta a caixa.

Esses novos pontos de terreno/cerca são **compatibilização local autorizada**, não medições CAD do terreno. Evidência reprodutível em `evidence/cad-local-compatibility.json`, gerada por `node scripts/cad/audit-local-compatibility.mjs`. Inspeção visual da geometria regenerada continua necessária.

## Reprodução e validação

`assets/industrial/cad/registry-source.json` é uma redução numérica dos anexos auditados: 25 estruturas, quatro registros de silos e 258 nós necessários para bounds e partições; contém nomes/caminhos/matrizes/footprints/cotas e hashes de entrada, sem malhas CAD. Não depende de `Downloads` ou de paths locais do usuário na execução do aplicativo.

`assets/industrial/cad/partition-footprints.json` contém envolventes convexas obtidas dos **vértices efetivos** do CAD reextraído, para cada partição. `scripts/cad/project-partition-footprints.py` calcula os hulls projetados por instância e a envolvente da união, considerando matriz completa e caminhos excluídos. O cálculo trabalha em metros CAD e só depois recebe o registro global; não usa AABBs como substituto das projeções. O resultado compacto versionado permite reproduzir a migração sem o cache privado.

```sh
node scripts/cad/integrate-site.mjs
node scripts/cad/integrate-site.mjs --check
npm run test:industrial:cad
# Verificação local adicional com o cache extraído do CAD original:
npm run test:industrial:cad -- --source
```

O teste CAD decodifica os GLBs compactados com meshopt, confere envelopes a **5 mm**, compara high/low/blockout, matrizes e eixos com as referências CAD, valida `elementId`, proprietário único e a contabilização de peças mantidas/omitidas na geração. O modo padrão usa somente arquivos versionados e roda em clone/CI. `--source` acrescenta uma checagem de cada ocorrência contra `assets/industrial/raw/cad/cad-manifest.json`, sem torná-lo dependência da CI. Saída: `docs/industrial/evidence/cad-glb-audit.json`. Essas verificações de envelope não certificam erro de superfície de cada detalhe simplificado.

Além do envelope completo, o teste mede os vértices efetivamente referenciados dos grupos `zinc` (somente corpo 3730) e `roof` (somente cobertura 3728) dos quatro silos em high/low/blockout. São 24 comparações independentes de base, topo e altura; para o corpo, calcula também duas vezes a distância radial máxima ao eixo CAD confirmado. Essa medida inclui detalhes externos e não é um diâmetro nominal nem a largura de uma AABB. Os seis afastamentos entre eixos também são comparados às referências independentes.

### Contagem de faces na conversão Blender/GLB

`scripts/cad/audit-export-topology.py` inspeciona a última fonte Blender **sem modificá-la**, comparando os triângulos reais com os índices das faces no cache de redução. A fonte 487 contém oito triângulos com índices repetidos; as definições reduzidas 791 e 873 contêm duas faces duplicadas cada. A diferença entre a contagem de entrada e a malha Blender é exatamente a soma desses casos. O relatório distingue `omittedDegenerateTriangles` e `omittedDuplicateTriangles`; não classifica toda diferença como uma tolerância admissível. Outros triângulos de área zero existentes na fonte não são certificados ou removidos por essa auditoria.

Após uma nova geração, produzir essa evidência local com Blender 4.5:

```powershell
& $env:BLENDER_BIN --background --disable-autoexec assets/industrial/source/3tentos-reconstruction.blend --python scripts/cad/audit-export-topology.py
```

O executável pode ser substituído pelo caminho local do Blender quando `BLENDER_BIN` não estiver definido. A saída versionada `evidence/cad-export-topology.json` inclui hashes da geração e da fonte Blender, índices das faces e contagens por partição. O teste CAD exige igualdade exata entre a contagem GLB decodificada e a malha Blender inspecionada, além de reconciliar a entrada com os descartes comprovados. Esse relatório compacto evita exigir Blender/cache privado para o teste em CI.

O bootstrap fotográfico `scripts/create-industrial-data.mjs` agora interrompe a execução antes de qualquer escrita quando encontra `cadRegistration`; mudanças futuras devem passar pelo migrador incremental.

O comando normal atualiza os registros ligados ao CAD e as intervenções locais expressamente listadas acima, mantém IDs e campos externos à integração e preserva câmeras. Os dois segmentos de contorno/cerca precisam corresponder aos pontos aprovados antes de receber o desvio; qualquer divergência interrompe o migrador para revisão. `--check` recalcula em memória, falha se o cadastro divergir e não escreve arquivos. O migrador verifica unicidade de IDs e não sobreposição de proprietários nos nós da fonte compacta; o extrator/validador CAD completo deve conferir a propriedade de todas as instâncias e comparação independente das cotas.

Verificações de cadastro realizadas: 27 IDs únicos, 16 bindings, quatro eixos com a mesma transformação rígida e repetição idempotente. A preservação semântica da base é verificada dentro do migrador a cada execução. Esses controles não substituem a posterior inspeção de GLB, seleção, navegação, cortes subterrâneos, visual PBR ou desempenho. Relatórios antigos de 2026-09-14 continuam sendo a linha de base da implementação fotográfica; não comprovam a revisão CAD.
