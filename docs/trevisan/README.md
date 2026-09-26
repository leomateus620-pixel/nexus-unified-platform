# Trevisan — Moega 3 e complexo industrial

Acesso: **Mapas 3D das Unidades → Moega 3 e coberturas**. Visualização dedicada em `/mapas-3d/trevisan`, isolada de outros projetos. Catálogo em `/mapas-3d`.

Fonte exclusiva: `public/models/trevisan/levantamento.pdf`, oito pranchas de 25/09/2026, cópia binária do PDF fornecido. SHA-256: `70ddb807c9915d4683340980836eed4cd214efe576779d95ce0a7585d33c69ca`. Não foram usados modelos da escada, imagens externas, CAD de outras unidades ou geometrias da 3Tentos.

## Critério de interpretação

Este é um levantamento preliminar para conferência, **não um as built ou dimensionamento estrutural**. Croqui não significa levantamento validado. As geometrias e cotas interpretadas ficam em `src/trevisan/data.ts`, com descrição, origem e pendências por setor. O gerador em `model.ts` usa metros, eixo Y vertical e os eixos da planta geral. G1 é a origem. O PDF e a ficha de cada setor estão disponíveis no próprio visualizador.

| Conjunto                     | Pranchas      | Tratamento                                                                                                                         |
| ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Moega 3                      | 01–04, D1/06  | 19,438 × 17 m, quatro vãos e alvenaria em 14,535; frente a oeste, planta local girada 90° para a implantação                       |
| Cobertura da Moega           | 02, 03, D1/06 | D1: 23 × 19,838 m, sem beiral sobre o encosto; +6,925 na cumeeira e +4,030 na borda; banzo inferior +4,365                         |
| Galpão principal             | 05–07         | 62,70 × 41,50, três naves de 21,20 / 20,70 / 20,80 m, nove eixos a cada 5 m; +5,680 / +9,395                                       |
| Bloco alto                   | 06, 08        | 21,80 × 11 m, +12,20 / ≈ +10,40; estrutura vermelha, vigas I, base ≈ +5,68, viga ≈ +7,20 e faixas translúcidas                     |
| Lanternim elevado            | 06, 07        | 33,90 × 6,20, beiral +9,395 e cumeeira ≈ +10,20; abertura correspondente nas coberturas inferiores e galeria interna +7,80 a +9,20 |
| Grelha e fosso               | 01, 04        | Contorno da grelha pela proporção da folha 01; profundidade desconhecida, fosso apenas como símbolo escuro sob as barras           |
| Silo e auxiliares            | 05, 06        | Dimensões de planta preservadas; contornos e símbolos sem extrusão vertical                                                        |
| Torre, cabine, transportador | 05, 06        | Contornos/projeções; não foram inventadas alturas, máquinas ou seções                                                              |

O usuário escolheu explicitamente **contornos e símbolos sem altura inventada** para elementos sem cota vertical. Assim, o silo aparece com seu círculo Ø21 e geratrizes de cobertura cônica em planta; os auxiliares apresentam contornos e cumeeiras. A cabine e a torre da Moega são marcadores sobre a cobertura conhecida. Eólicos são símbolos sobre o lanternim, sem dimensões de fabricação. A profundidade do fosso não foi inferida.

## Divergências preservadas

- Folha 02: 20,238 m = 19,438 + 2 × 0,40. D1/06: 19,838 m = 19,438 + 0,40, encostando no galpão. D1 adotado para a cena de conjunto.
- A diferença +6,925 − +4,365 não é o caimento completo da telha: +4,365 é o banzo inferior. A borda cotada +4,030 gera 25,17% sobre 11,50 m. A inclinação ≈25% do PDF é arredondada.
- Cabine: posição distinta em 02 e D1/06; adotado D1, sem altura.
- Torre/elevador: exterior a leste em 05, próximo ao lanternim em D2/06. Adotada a posição exterior de 05, sem duplicação; exige validação.
- Galeria exterior: desenho mais longo em 05; usada a cota explícita 1,70 × 37,30 de 06. Nível ausente.
- Cota ≈13,80 junto à torre D1 sem referência vertical inequívoca: não usada como altura.
- Seção dos pilares da Moega: detalhe gráfico 0,15 × 0,50, texto “150 × 50 (unidade/material a confirmar)”. Representação segue o detalhe gráfico, sem valor de fabricação.
- Barras da grelha, seções de aço não cotadas, espessuras gráficas, espaçamento de terças da Moega e textura das chapas são simplificações visuais. Não devem gerar quantitativos. Eólicos não são equipamentos dimensionados.
- As posições dos auxiliares foram transcritas graficamente da folha 05 com escala 62,70 m; precisão da fonte ±0,50 a 1,00 m. O terreno é um plano neutro de apresentação, não terreno levantado; a grade mede 5 m. Nenhuma circulação externa arbitrária foi modelada.

## Referência geográfica da folha 05 (WGS-84)

| Ponto | Latitude   | Longitude  |
| ----- | ---------- | ---------- |
| P0    | -30.048300 | -52.919350 |
| M1    | -30.048006 | -52.919351 |
| M2    | -30.048093 | -52.919134 |
| M3    | -30.048255 | -52.919221 |
| M4    | -30.048167 | -52.919438 |
| M5    | -30.048189 | -52.919266 |
| G1    | -30.048043 | -52.919763 |
| G2    | -30.048282 | -52.919173 |
| G3    | -30.048619 | -52.919355 |
| G4    | -30.048381 | -52.919945 |
| S1    | -30.047726 | -52.919329 |

As coordenadas arredondadas da fonte não são uma transformação topográfica executiva. A cena segue a planta ortogonal, com checagem do centro S1 dentro da precisão declarada. Não há mapa geográfico de terceiros.

## Uso e arquitetura

Órbita com arrasto, pan com botão direito, zoom por rolagem; toque: um dedo orbita, dois movem/aproximam. Seis vistas com transição suave interrompível; prefere movimento reduzido quando configurado no sistema. Foco por setor, isolamento por conjunto, camadas, legendas, enquadramento e qualidade econômica. Rotas e módulo Three.js carregados sob demanda. A visualização tem um Canvas e um OrbitControls próprios.

Instâncias agrupadas por entidade/camada/material; superfícies agrupadas em geometrias; uma geometria de caixa compartilhada, materiais e normal map compartilhados. Renderização sob demanda, DPR limitado, descarte explícito de recursos e tratamento de perda/restauração de contexto. O modo econômico remove sombras e limita DPR a 1.

## Verificação

`node --experimental-strip-types --test tests/trevisan.test.mjs` (Node 24+) verifica medidas, nove eixos, setores, ausência de alturas inventadas, passagem desobstruída via raycast, cinco pilares azuis, encosto da cobertura, orçamento geométrico, centro geográfico e integridade do PDF. Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Veja `validation.md` para evidências da sessão e limites.
