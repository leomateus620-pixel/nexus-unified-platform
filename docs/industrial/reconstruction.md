# Reconstrução incremental, proveniência e limites

## Referências e identificação

A primeira versão reconstruiu quatro fotografias com escala estimada. A revisão mantém esse mapa e usa o CAD confirmado da mesma unidade para corrigir estruturas associadas e acrescentar componentes ausentes. O usuário autorizou uma convenção local; o frame fotográfico não é tratado como levantamento geográfico.

O CAD fornece geometria, cotas relativas e relações entre ocorrências. Fotos continuam orientando materiais, aparência e a base sem correspondente CAD. Nomes da fonte são identificação técnica; capacidade, fluxo, numeração operacional de silo e conformidade não são deduzidos deles.

Em [`site.json`](../../src/industrial/data/site.json), `name` é o nome exibido; `identification` separa nome CAD, identificador, aliases, convenção e associação. `cad` registra fonte/hash, ocorrência, matriz, partição e exclusões. **Os 20 IDs históricos permanecem**, com sete novos componentes; não se transfere identidade por proximidade.

## Coordenadas e unidade

| Frame        | Definição                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| CAD original | Milímetros e origem preservada; +Y vertical é sustentado pela geometria, sem atributo explícito de up-axis |
| CAD métrico  | Vértices/translações convertidos uma vez por 0,001; matrizes afins preservadas                             |
| Nexus        | +X à direita, +Z abaixo na Foto B, +Y vertical; norte/UTM e datum de campo não determinados                |

`3tentos-local-cad-v1` usa rotação horizontal de π e translação `[25.43320947275, −0.01, −6.15767129525]` m, com escala 1. A média dos eixos de silo permanece no centro histórico Nexus `[-0.16,0,0]`; os setores de moegas/escritório/agrotóxicos sustentam a orientação local autorizada. Não é ajuste georreferenciado por pontos levantados.

Solo CAD Y=0,010 corresponde ao datum Nexus Y=0; base de silo CAD Y=0,110 chega a Nexus Y=0,100. Altura, cota absoluta, pivô, centro de eixo e centro de envelope são grandezas diferentes. Não recentrar filhos individualmente nem tomar o pivô de montagem como eixo do silo.

Blender aplica `(x,y,z) → (x,−z,y)` e exporta glTF Y-up com placement incorporado. React não repete a transformação. Bounds, anchors, contornos e colliders usam o mesmo frame Nexus.

| ID Nexus | Montagem CAD | Convenção local |
| -------- | ------------ | --------------- |
| SILO-01  | 4136         | Quadrante −X/−Z |
| SILO-02  | 4125         | Quadrante +X/−Z |
| SILO-03  | 4147         | Quadrante −X/+Z |
| SILO-04  | 1531         | Quadrante +X/+Z |

Os nomes CAD-SILO-01…04 da auditoria não são IDs Nexus nem numeração operacional homologada. A convenção acima mantém as identidades do mapa.

## Inventário e propriedade da geometria

| ID Nexus                  | Nome/componente                              | Fonte e escopo                                                            |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| SILO-01…04                | Silo 01…04                                   | Montagens 4136/4125/4147/1531, com corpo, cobertura e acessórios          |
| EQ-01                     | Elevador dos silos                           | 1511, separado das conexões e dos túneis                                  |
| EQ-02                     | Conexões e acessos dos silos                 | 1009, excluindo 1508 e 1511                                               |
| ED-01                     | Pavilhão das moegas                          | Arquitetura 480, excluindo moegas/poços 487                               |
| ED-02, ED-03              | Edificações superiores 01/02                 | Geometria/nome fotográficos preservados, sem associação CAD comprovada    |
| ED-04                     | Escritório                                   | 4120, paredes 4123 e cobertura 4121                                       |
| PV-01                     | Faixa de provável pesagem                    | Preservada; função provável e sem dimensão CAD associada                  |
| ED-05                     | Pavilhão de agrotóxicos                      | 903, paredes 906 e cobertura 910                                          |
| EQ-03                     | Elemento circular                            | Preservado; não substituído pela caixa d’água CAD                         |
| TR-01…03                  | Pátio, acesso e rodovia                      | Base fotográfica preservada; remendo local documentado                    |
| VG-01, VG-02              | Palmeiras e demais árvores/vegetação         | Semente/famílias preservadas; dois deslocamentos locais registrados       |
| CE-01, CE-02              | Cercamento e subdivisões/portões             | Preservados com desvio local junto à caixa d’água                         |
| CAD-HOPPER-PITS           | Moegas e poços                               | 487, separado da arquitetura ED-01                                        |
| CAD-HOPPER-ELEVATOR-01/02 | Elevadores das moegas 01/02                  | 489 e 505, com ocorrências/cotas próprias                                 |
| CAD-SILO-PIT-TUNNELS      | Poço e túneis dos silos                      | 1508, separado de EQ-01/EQ-02                                             |
| CAD-HOPPER-CONNECTIONS    | Conexões e acessos das moegas                | Montagem 5, excluindo 480/489/505                                         |
| CAD-WATER-TANK            | Caixa d’água                                 | 4117, escada 4113 e ocorrência raiz 858 sob um mesmo dono de renderização |
| CAD-OFFICE-ROOF           | Conjunto superior da cobertura do escritório | 912, distinto da cobertura arquitetônica 4121                             |

Uma ocorrência pertence a uma única partição. IDs CAD reutilizados exigem `sourceInstancePath`; a mesma peça não é importada como filho e novamente como equipamento independente. Exclusões definem a geometria de cada elemento, preservando `elementId` para seleção.

Projeções do minimapa vêm dos vértices da partição após excluir filhos. Um envelope convexo de tubos descontínuos pode conter vazios: não é contato com o chão. Colliders permanecem separados, específicos a paredes/torres ou `none` para conjuntos que não devem bloquear todo o solo.

## Referências dimensionais

São valores da malha CAD, não medidas nominais ou certificadas em campo. A geometria final dos GLBs deve ser comparada aos goldens após simplificação/compressão.

| Grandeza                           | Referência CAD                                 | Interpretação                                                          |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Distâncias entre eixos de silo     | Aproximadamente 24 × 20,995 m                  | Substituem o arranjo estimado 20,8 × 20,48, preservando escala métrica |
| Envolvente radial externa do corpo | Aproximadamente 18,816 m                       | Inclui detalhes da malha; não é diâmetro nominal/interno               |
| Extensão Y do corpo/base 3730      | 14,5 m                                         | Não separar nominalmente base e chaparia sem evidência                 |
| Extensão Y da cobertura 3728       | 5,503 m                                        | Preservar forma e posição, sem escalar toda a montagem                 |
| Extensão Y da montagem de silo     | 21,179475 m                                    | High/low/blockout usam os mesmos anchors e cotas críticas              |
| Paredes do pavilhão481             | XZ 24,2 × 18,3 m; extensão Y 6 m               | Separadas de cobertura, moegas e elevadores                            |
| Cobertura do pavilhão485           | XZ 26,2 × 18,82 m; extensão Y 5,95 m           | Não confundir com montagem5 inteira                                    |
| Moegas/poços 487                   | Mínimo CAD Y −9,815;9,825 m abaixo do solo CAD | Nexus Y −9,825, mantendo o subterrâneo                                 |
| Poço/túneis 1508                   | Mínimo CAD Y −6,754;6,764 m abaixo do solo CAD | Nexus Y −6,764; não elevar para tornar visível                         |
| Elevador 1511                      | CAD Y −6,753…35,097                            | Nexus Y −6,763…35,087; torre não é envelope de todos os tubos          |
| Escritório 4120                    | Extensão Y 3,85 m                              | Acessório 912 separado das paredes/cobertura                           |
| Pavilhão agrotóxicos 903           | Extensão Y 7,5 m                               | Paredes/cobertura tratadas por parte                                   |
| Caixa d’água4117                   | Extensão Y 7,8 m; XZ 1,62 × 1,62 m             | Forma de seções variáveis; escada e acessório têm topos próprios       |

XZ nessa tabela está no frame CAD. O registro atual de π conserva essas extensões; outro yaw exigiria recalcular envelopes Nexus. Distâncias e extensões verticais não são posições absolutas.

## Base cartográfica e aparência

A escala inicial 0,16 unidade/pixel e os traçados da Foto B permanecem como proveniência da base, não calibração do CAD. Terreno CAD 190 × 154 m não substitui o contorno existente. Entorno procedural 1800 × 1600 m não determina minimapa/navegação.

Os únicos remendos locais ficam em `cadRegistration.localAdjustments`: piso `CAD-WATER-TANK-PAD`, pequeno desvio de CE-01/contorno junto à caixa e árvores de índices 70/71 deslocadas para Z 61, com características preservadas. A cerca não é divisa jurídica. TR-02 conserva largura renderizada 9 m, distinta da estimativa fotográfica 7,2 m; isso não constitui nova medida CAD da via.

Fotos orientam PBR, chapas/corrugação, perfis, telhas, tubos, escadas, guarda-corpos e paleta, sem substituir medidas CAD. Componentes procedurais e materiais compatíveis são reutilizados. Repetições/detalhes secundários devem ser otimizados sem deformar eixos, conexões ou alturas.

O passeio usa pisos conhecidos e o remendo registrado, com olhos 1,7 m acima da superfície. Colisões mantêm edifícios fechados e não autorizam interiores/subterrâneos. Não são simulação de cada corrimão/fixador nem certificação de segurança.

## Papel das fotografias

- **A — aérea oblíqua:** silos, recebimento, pátios, rodovia e relação geral dos volumes.
- **B — superior:** origem da base; conjunto 2 × 2, edificações, provável pesagem, ilhas, acesso e rodovia. Não é ortofoto.
- **C — lado oposto:** complementa leitura de coberturas, circulação e volumes periféricos sem espelhar geometria.
- **D — solo:** aparência de chapas, montantes, juntas, tubos, escadas e elementos amarelos. A correspondência individual dos dois silos permanece pendente; confirmar a unidade não resolve essa numeração.

Os ajustes históricos A/C por pixels usavam geometria estimada; seus resíduos não validam a implantação CAD. Modos A–D e sobreposição permanecem para inspeção aproximada. Foco/limites seguem anchors/bounds do cadastro.

## Limites de evidência

- Dimensão de malha não equivale a capacidade, dimensão interna/nominal ou confirmação da obra executada.
- Convenção local aprovada não é norte/UTM, levantamento cadastral ou datum de campo.
- Unidade confirmada não transforma nomes CAD em designações operacionais homologadas.
- Bounds/projeções convexas não certificam folga 3D entre sólidos ou volume útil.
- A fonte extraída é a referência geométrica; os GLBs precisam de medição após otimização. Exportação rejeitada pelo validador não é resultado aprovado.
- Capturas/benchmarks da primeira versão são históricos. Consulte [validation.md](validation.md) para checks reexecutados; este documento não anuncia aprovação final da geração em curso. O [método CAD](cad-geometry.md) detalha extração e redução.
