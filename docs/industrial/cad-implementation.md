# 3Tentos — implementação incremental CAD

Edição local na branch codex/3tentos-cad-incremental. Identidade da unidade **CONFIRMADA PELO USUÁRIO**. Mesmo mapa, mesmo cadastro e IDs anteriores. Sem commit, push, merge ou deploy nesta entrega.

## Registro espacial

Convenção local de integração; não é georreferenciamento. CAD em milímetros → metros uma vez, escala geométrica 1, rotação Y de 180°. Âncora CAD: (25,5932; 0,01; -6,1577) m; âncora Nexus: (-0,16; 0; 0) m. Translação: (25,4332; -0,01; -6,1577) m. Critério: centro dos quatro eixos e orientação consistente com moegas, escritório e agrotóxicos. Matriz coluna maior: -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 25.43320947275, -0.01, -6.15767129525, 1.

Terreno CAD Y=0,010 m corresponde a Nexus Y=0. Eixos dos silos ficam em Y=0,100 m. Espaçamentos corrigidos para 24 × 20,994996 m. A rotação abaixo é a orientação da ocorrência; o placement está incorporado aos vértices dos GLBs, sem reaplicação no React. Corpo e cobertura dos silos vêm de peças CAD próprias; Ø é envolvente radial externa, não diâmetro nominal.

## Alterações executadas

Os valores anteriores são parâmetros da representação fotográfica estimada; não são medições da envolvente completa nem dimensões nominais certificadas.

| Estrutura/ID | O que existia | Medida ou referência CAD utilizada | Alteração executada | Estado de validação |
|---|---|---|---|---|
| SILO-01 | Silo 01; Ø paramétrico 17,6; altura paramétrica 23,4; (-10,56; 0; -10,24) | Montagem Silo Adequado · build0/1/11:4136 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| SILO-02 | Silo 02; Ø paramétrico 17,6; altura paramétrica 23,4; (10,24; 0; -10,24) | Montagem Silo Adequado · build0/1/10:4125 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| SILO-03 | Silo 03; Ø paramétrico 17,6; altura paramétrica 23,4; (-10,56; 0; 10,24) | Montagem Silo Adequado · build0/1/12:4147 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| SILO-04 | Silo 04; Ø paramétrico 17,6; altura paramétrica 23,4; (10,24; 0; 10,24) | Montagem Silo Adequado · build0/1/6:1531 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| EQ-01 | Conjunto central de elevação; width=1,4; depth=1,5; height=34; (-0,16; 0; 0,96) | Elevador dos Silos · build0/1/5:1009/12:1511 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| EQ-02 | Ligação elevada com o galpão; height=24; (-0,16; 0; 25,76) | Elevador e Túneis · build0/1/5:1009; exclui: build0/1/5:1009/11:1508, build0/1/5:1009/12:1511 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| ED-01 | Galpão adjacente; width=27,2; depth=17,2; height=6,5; rise=1,8; (-0,64; 0; 26,72) | Pavilhão Moegas(Valor predeterminado)Estado de exibição 1_969ea5 · build0/1/1:5/8:480; exclui: build0/1/1:5/8:480/3:487 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| ED-02 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| ED-03 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| ED-04 | Edificação lateral; width=10,2; depth=13; height=3,5; rise=1; (58,88; 0; -5,76) | Escritório(Valor predeterminado)Estado de exibição 1 · build0/1/9:4120 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| PV-01 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| ED-05 | Edificação inferior direita; width=11,8; depth=11,6; height=3,7; rise=0,9; (50,56; 0; 50,56) | Pavilhão Agrotóxicos(Valor predeterminado)Estado de exibição 1 · build0/1/3:903 | Geometria CAD, posição, cota, rotação, nome e proveniência integrados | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| EQ-03 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| TR-01 | Componente existente | Base fotográfica existente (estimada) | Compatibilização localizada; ver evidência | Identidade preservada; contratos e suíte UI geral aprovados |
| TR-02 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| TR-03 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| VG-01 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| VG-02 | Componente existente | Base fotográfica existente (estimada) | Compatibilização localizada; ver evidência | Identidade preservada; contratos e suíte UI geral aprovados |
| CE-01 | Componente existente | Base fotográfica existente (estimada) | Compatibilização localizada; ver evidência | Identidade preservada; contratos e suíte UI geral aprovados |
| CE-02 | Componente existente | Base fotográfica existente (estimada) | Preservado | Identidade preservada; contratos e suíte UI geral aprovados |
| CAD-HOPPER-PITS | Ausente do cadastro anterior | body2722 · build0/1/1:5/8:480/3:487 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-HOPPER-ELEVATOR-01 | Ausente do cadastro anterior | Elevador das Moegas - 01 · build0/1/1:5/9:489 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-HOPPER-ELEVATOR-02 | Ausente do cadastro anterior | Elevador das Moegas - 02 · build0/1/1:5/11:505 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-SILO-PIT-TUNNELS | Ausente do cadastro anterior | Poço do Elevador e Túneis(Valor predeterminado)Estado de exibição 1_969ea5 · build0/1/5:1009/11:1508 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-HOPPER-CONNECTIONS | Ausente do cadastro anterior | Pavilhão Moegas · build0/1/1:5; exclui: build0/1/1:5/8:480, build0/1/1:5/9:489, build0/1/1:5/11:505 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-WATER-TANK | Ausente do cadastro anterior | Caixa D'Água(Valor predeterminado)Estado de exibição 1 · build0/1/8:4117, build0/1/7:4113, build0/1/2:858 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |
| CAD-OFFICE-ROOF | Ausente do cadastro anterior | LVH-NXS-M00 - Telhado Escritório(Valor predeterminado)Estado de exibição 1 · build0/1/4:912 | Adicionado com hierarquia e ocorrência próprias | Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada |

## Cadastro final

Posições e dimensões em metros; rotações XYZ em graus. Medidas de partes (corpo, paredes e cobertura) estão identificadas separadamente da envolvente mundial do conjunto. X×Z×Y segue os eixos Nexus; não se reaplica a rotação da ocorrência a essas dimensões mundiais. Footprints/colliders de paredes são separados. Bases/topos são cotas Nexus da geometria completa. Subárvores excluídas pertencem aos demais IDs indicados no cadastro, evitando duplicação.

| ID Nexus | Nome exibido | Nome e ocorrência CAD | Posição final Nexus | Rotação | Dimensões | Base/topo |
|---|---|---|---|---|---|---|
| SILO-01 | Silo 01 | Montagem Silo Adequado · build0/1/11:4136 | -12,16; 0,1; -10,4975 | 0; -90; 0 | corpo: Ø radial externo 18,816, H 14,5; cobertura H 5,503; conjunto H 21,1795; envolvente X×Z×Y 18,783; 18,783; 21,1795 | 0,1 / 21,2795 |
| SILO-02 | Silo 02 | Montagem Silo Adequado · build0/1/10:4125 | 11,84; 0,1; -10,4975 | 0; -150; 0 | corpo: Ø radial externo 18,816, H 14,5; cobertura H 5,503; conjunto H 21,1795; envolvente X×Z×Y 18,7971; 19,1432; 21,1795 | 0,1 / 21,2795 |
| SILO-03 | Silo 03 | Montagem Silo Adequado · build0/1/12:4147 | -12,16; 0,1; 10,4975 | 0; 30; 0 | corpo: Ø radial externo 18,816, H 14,5; cobertura H 5,503; conjunto H 21,1795; envolvente X×Z×Y 18,7971; 19,1432; 21,1795 | 0,1 / 21,2795 |
| SILO-04 | Silo 04 | Montagem Silo Adequado · build0/1/6:1531 | 11,84; 0,1; 10,4975 | 0; 90; 0 | corpo: Ø radial externo 18,816, H 14,5; cobertura H 5,503; conjunto H 21,1795; envolvente X×Z×Y 18,783; 18,783; 21,1795 | 0,1 / 21,2795 |
| EQ-01 | Elevador dos silos | Elevador dos Silos · build0/1/5:1009/12:1511 | 0,0662; -6,763; 1,0148 | 0; -90; 0 | width=1,687; depth=0,529; height=41,85 | -6,763 / 35,087 |
| EQ-02 | Conexões e acessos dos silos | Elevador e Túneis · build0/1/5:1009; exclui: build0/1/5:1009/11:1508, build0/1/5:1009/12:1511 | -0,0957; -6,763; 3,8055 | 0; 90; 0 | width=24,7219; depth=54,2657; height=41,8599 | -6,763 / 35,0969 |
| ED-01 | Pavilhão das moegas | Pavilhão Moegas(Valor predeterminado)Estado de exibição 1_969ea5 · build0/1/1:5/8:480; exclui: build0/1/1:5/8:480/3:487 | -0,5568; 0,015; 31,2473 | 0; 90; 0 | paredes X×Z×Y 24,2; 18,3; 6; elevação da cobertura 5,95; conjunto: envolvente X×Z×Y 26,2; 18,82; 11,95 | 0,015 / 11,965 |
| ED-02 | Edificação superior 01 | Sem associação CAD | -57,6; 0; -46,88 | 0; 0; 0 | width=11; depth=10,6; height=3,4; rise=0,65 | Estimado; ver cadastro |
| ED-03 | Edificação superior 02 | Sem associação CAD | -56,32; 0; -33,76 | 0; 0; 0 | width=7,5; depth=11,2; height=3,3; rise=0,65 | Estimado; ver cadastro |
| ED-04 | Escritório | Escritório(Valor predeterminado)Estado de exibição 1 · build0/1/9:4120 | 60,3082; 0,015; -8,9727 | 0; 90; 0 | paredes X×Z×Y 7,7; 11,75; 2,85; elevação da cobertura 1; conjunto: envolvente X×Z×Y 9,9; 13,95; 3,85 | 0,015 / 3,865 |
| PV-01 | Faixa de provável pesagem | Sem associação CAD | 51,2; 0; -5,76 | 0; 0; 0 | width=3,2; depth=24; height=0,18 | Estimado; ver cadastro |
| ED-05 | Pavilhão de agrotóxicos | Pavilhão Agrotóxicos(Valor predeterminado)Estado de exibição 1 · build0/1/3:903 | 53,5062; 0; 54,0423 | 0; -90; 0 | paredes X×Z×Y 10,4; 10,4; 6; elevação da cobertura 1,5; conjunto: envolvente X×Z×Y 12,4; 11; 7,5 | 0 / 7,5 |
| EQ-03 | Elemento circular | Sem associação CAD | 49,12; 0; 41,76 | 0; 0; 0 | Ø paramétrico 4,7; altura paramétrica 2,2 | Estimado; ver cadastro |
| TR-01 | Pátio de circulação | Sem associação CAD | 23,04; 0; 27,36 | 0; 0; 0 | ver cadastro | Estimado; ver cadastro |
| TR-02 | Acesso externo superior | Sem associação CAD | 13,44; 0; -64,8 | 0; 0; 0 | largura estimada histórica 7,2; largura renderizada preservada 9 | Estimado; ver cadastro |
| TR-03 | Rodovia lateral | Sem associação CAD | 104,16; 0; 1,76 | 0; 0; 0 | width=9,8 | Estimado; ver cadastro |
| VG-01 | Alinhamentos de palmeiras | Sem associação CAD | 79,04; 0; 4,96 | 0; 0; 0 | ver cadastro | Estimado; ver cadastro |
| VG-02 | Árvores e vegetação periférica | Sem associação CAD | -55,04; 0; 6,08 | 0; 0; 0 | ver cadastro | Estimado; ver cadastro |
| CE-01 | Cercamento externo visível | Sem associação CAD | 45,44; 0; 63,52 | 0; 0; 0 | height=1,45 | Estimado; ver cadastro |
| CE-02 | Subdivisões e portões | Sem associação CAD | 18,4; 0; -47,36 | 0; 0; 0 | height=1,5 | Estimado; ver cadastro |
| CAD-HOPPER-PITS | Moegas e poços | body2722 · build0/1/1:5/8:480/3:487 | -0,5568; -9,825; 31,2473 | 0; 90; 0 | width=23,8; depth=17,9; height=11,05 | -9,825 / 1,225 |
| CAD-HOPPER-ELEVATOR-01 | Elevador das moegas 01 | Elevador das Moegas - 01 · build0/1/1:5/9:489 | 3,2787; -9,813; 34,0008 | 0; 0; 0 | width=0,529; depth=1,687; height=32,85 | -9,813 / 23,037 |
| CAD-HOPPER-ELEVATOR-02 | Elevador das moegas 02 | Elevador das Moegas - 02 · build0/1/1:5/11:505 | 1,9742; -9,813; 33,7933 | 0; 0; 0 | width=0,475; depth=1,82; height=30,85 | -9,813 / 21,037 |
| CAD-SILO-PIT-TUNNELS | Poço e túneis dos silos | Poço do Elevador e Túneis(Valor predeterminado)Estado de exibição 1_969ea5 · build0/1/5:1009/11:1508 | -0,1088; -6,764; 0,0023 | 0; 90; 0 | width=30,3907; depth=26,8301; height=6,864 | -6,764 / 0,1 |
| CAD-HOPPER-CONNECTIONS | Conexões e acessos das moegas | Pavilhão Moegas · build0/1/1:5; exclui: build0/1/1:5/8:480, build0/1/1:5/9:489, build0/1/1:5/11:505 | 2,4977; -4,5259; 29,2511 | 0; 90; 0 | width=11,295; depth=40,0594; height=26,5581 | -4,5259 / 22,0323 |
| CAD-WATER-TANK | Caixa d’água | Caixa D'Água(Valor predeterminado)Estado de exibição 1 · build0/1/8:4117, build0/1/7:4113, build0/1/2:858 | -59,9538; 0; 62,8603 | 0; 0; 0 | corpo: Ø 1,62, H 7,8; conjunto com escada e acessórios: envolvente X×Z×Y 1,8372; 1,62; 10,0969 | 0 / 10,0969 |
| CAD-OFFICE-ROOF | Conjunto superior da cobertura do escritório | LVH-NXS-M00 - Telhado Escritório(Valor predeterminado)Estado de exibição 1 · build0/1/4:912 | 60,3082; 3,865; -8,9727 | 0; 90; 0 | width=0,15; depth=13,78; height=0,5947 | 3,865 / 4,4597 |

## Preservação e complementação

Preservados: todos os 20 IDs anteriores, seleção e vínculos, materiais PBR/texturas, fotos originais, vegetação com seus protótipos, vias e pátios, entorno rural, iluminação e interface. [Conferência de preservação](evidence/cad-preservation.json). Sete novos IDs de componentes CAD completam moegas, elevadores, poços/túneis, conexões, caixa d’água e acessório do escritório. O elemento circular EQ-03 mantém identidade provisória independente da caixa CAD.

Intervenções locais: árvores 70/71 deslocadas apenas a Z=61 m; desvio CE-01 entre X=-63 e -57 m até Z=65 m; contorno adjacente até Z=65,5 m, acrescentando 15,89664 m²; piso localizado da caixa d’água. Copas verificadas sem vértices dentro das paredes; caixa/escada mantêm 1,32967 m de folga à cerca. [Evidência](evidence/cad-local-compatibility.json).

## Pipeline e limites

Partições por sourceInstancePath impedem peças duplicadas. CAD completo permanece fora de public; o cache intermediário é ignorado pelo Git. Gerador seleciona setores/dependências, inclui high/low/blockout no .blend e preserva GLBs não afetados. [Auditoria numérica](evidence/cad-glb-audit.json), [geração](evidence/cad-generation.json), [integração](cad-integration.md).

Pendências específicas: numeração operacional oficial; norte/georreferenciamento e datum de campo; diâmetro nominal/separação nominal da base dos silos; associação individual da Foto D; identificação do EQ-03 e edificações sem associação CAD. Não impedem a integração local realizada. A tolerância de exportação de 5 mm não representa precisão de campo. Simplificação gráfica não certifica o erro de toda a superfície CAD.

## Arquivos e execução

A lista completa de arquivos locais alterados/adicionados está em [changed-files.json](evidence/changed-files.json). O manifesto de integridade de fontes e ativos (incluindo arquivos preservados) está em [delivery-manifest.json](evidence/delivery-manifest.json); comandos realmente executados em [cad-execution.json](evidence/cad-execution.json). Resultados atuais: [validação](validation.md).

- Cadastro/contratos: site.json, data/index.ts e types/index.ts; registro compacto em assets/industrial/cad.
- Geração: generate_unit.py, cad_geometry.py, run-blender.mjs, run-cad.mjs, scripts/cad, optimize-industrial.mjs e repair-industrial-tangents.mjs; fonte .blend e oito GLBs.
- Aplicação: IndustrialScene.tsx, spatial.ts, Navigation.tsx, collision.ts, Minimap.tsx, IndustrialMap.tsx, industrial.css e atualização explícita das instâncias em Vegetation.tsx.
- Proteções/validação: create-industrial-data.mjs, auditorias CAD/geometria, testes industriais/interface/tangentes, package.json, workflow industrial e .gitignore.
- Documentação/evidências: docs/industrial e README da fonte Blender.
