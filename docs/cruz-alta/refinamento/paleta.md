# Cores das superfícies e dos vãos de Cruz Alta

A conferência usou 37 retângulos de amostragem. Três fotografias DJI, uma panorâmica PNG e quatro quadros do mesmo vídeo mostram os materiais em datas, rumos e exposições diferentes. As tabelas guardam os valores em sRGB de oito bits. A mediana foi calculada separadamente por canal nos pixels originais do retângulo. As coordenadas indicam a caixa em uma cópia de leitura com 720 px de largura e proporção original. Para recuperar a região, multiplique as quatro coordenadas por largura original ÷ 720 e arredonde os limites.

Foram atribuídas 29 cores a superfícies e instâncias dos edifícios e equipamentos e uma ao concreto do dique. Sete amostras permanecem como controles de iluminação ou mistura de materiais. A interpretação parte do brilho e tom relativos dentro de cada tomada, com ganho moderado por fonte para representar chapa difusa no mesmo sol do modelo. As entradas hexadecimais são cores de base do material Three.js, antes de mapas de chapa, rugosidade, incidência da luz, sombra e exposição. No oitão do 11 a entrada é a cor de fundo da textura com juntas e pátina.

| Fonte | Recorte | Ganho interpretado R / G / B |
| --- | --- | --- |
| DJI44 | dji_fly_20260514_073256_44_1778765365212_photo_optimized.jpg | 0,98 / 1,00 / 1,01 |
| DJI45 | dji_fly_20260514_073400_45_1778765364479_photo_optimized.jpg | 1,03 / 1,04 / 1,04 |
| DJI199 | dji_fly_20260211_220040_199_1770884109619_photo.jpg | 0,96 / 0,97 / 0,98 |
| PAN | Captura de tela 2026-02-25 163457.png | 1,18 / 1,17 / 1,15 |
| V36 | Vídeo do acervo em 36 s | 0,94 / 0,94 / 0,94 |
| V72 | Vídeo do acervo em 72 s | 1,10 / 1,09 / 1,08 |
| V108 | Vídeo do acervo em 108 s | 0,95 / 0,95 / 0,95 |
| V150 | Vídeo do acervo em 150 s | 0,97 / 0,97 / 0,97 |

| Superfície | Fonte | Retângulo x₀, y₀, x₁, y₁ | Mediana RGB | Base sRGB usada |
| --- | --- | --- | --- | --- |
| 11 · água clara do arco | DJI44 | 336, 142, 351, 150 | 198, 207, 208 | `#C2CFD2` |
| 11 · água envelhecida do arco | DJI44 | 406, 147, 422, 154 | 134, 114, 98 | `#837263` |
| 11 · chapa do oitão junto ao 56 | DJI44 | 374, 176, 382, 192 | 129, 134, 136 | `#7E8689` |
| 56 · água clara | DJI44 | 305, 308, 323, 317 | 224, 218, 212 | `#DCDAD6` |
| 56 · água de tonalidade quente | DJI44 | 427, 285, 451, 297 | 162, 151, 139 | `#9F978C` |
| 56 · caixa vertical de chapa | DJI44 | 250, 225, 267, 245 | 190, 204, 211 | `#BACCD5` |
| 56 · sombra entre caixa, oitão e cobertura | DJI44 | 324, 218, 337, 229 | 9, 12, 15 | Conferência visual |
| Galeria transversal · banzo visível | DJI44 | 30, 249, 48, 251 | 171, 166, 170 | `#A8A6AC` |
| 03/46 · extensão lateral do Casca | DJI45 | 197, 139, 220, 154 | 165, 159, 147 | `#AAA599` |
| 04 · nave do Casca | DJI45 | 294, 130, 313, 145 | 205, 197, 188 | `#D3CDC4` |
| 05 · nave contígua do Casca | DJI45 | 410, 122, 424, 137 | 180, 171, 162 | `#B9B2A8` |
| Casca · água à sombra | DJI45 | 352, 138, 367, 153 | 109, 106, 110 | Conferência visual |
| Casca · beiral e suporte da tomada superior | DJI45 | 178, 249, 181, 258 | 223, 215, 193 | Conferência visual |
| 08 · chapa clara da abóbada | V36 | 289, 279, 306, 293 | 229, 240, 242 | `#D7E2E3` |
| 08 · faixa vermelha sob o beiral | V36 | 281, 330, 284, 334 | 141, 19, 39 | `#851225` |
| 08 · sombra da boca aberta | V36 | 265, 348, 268, 352 | 14, 12, 18 | Conferência visual |
| 16/35 · cobertura da caldeira | V72 | 206, 195, 218, 204 | 129, 143, 154 | `#8E9CA6` |
| 35 · aço visível na face aberta | V72 | 218, 210, 222, 212 | 132, 144, 154 | `#919DA6` |
| 35 · face interna entre as travessas | V72 | 220, 216, 222, 218 | 31, 32, 34 | Conferência visual |
| Preparação · chapas das coberturas | V108 | 449, 218, 456, 225 | 240, 240, 240 | `#E4E4E4` |
| 27/27.1/28 · platibanda pintada | V108 | 370, 235, 374, 238 | 167, 62, 86 | `#9F3B52` |
| Preparação · faixa clara de fachada | V108 | 462, 275, 468, 278 | 187, 179, 181 | `#B2AAAC` |
| Preparação · vazio sob o capeamento | V108 | 463, 265, 468, 268 | 30, 22, 25 | Conferência visual |
| Reservatório central 1 · tampa | DJI199 | 216, 53, 225, 62 | 184, 189, 193 | `#B1B7BD` |
| Reservatório central 2 · tampa | DJI199 | 262, 57, 273, 67 | 242, 238, 236 | `#E8E7E7` |
| Reservatório central 4 · tampa | DJI199 | 224, 105, 230, 110 | 221, 207, 193 | `#D4C9BD` |
| Reservatório central 5 · tampa | DJI199 | 264, 99, 273, 107 | 225, 216, 205 | `#D8D2C9` |
| Reservatórios centrais pequenos · tampas | DJI199 | 300, 51, 307, 58 | 196, 196, 190 | `#BCBEBA` |
| Reservatório norte 6 · corpo claro | V150 | 398, 322, 411, 332 | 241, 246, 247 | `#EAEFF0` |
| Norte 6 · concreto do dique | V150 | 447, 351, 459, 355 | 227, 229, 228 | `#DCDEDD` |
| Silo 1 · tampa junto à torre | PAN | 201, 34, 216, 38 | 149, 136, 127 | `#B09F92` |
| Silo 2 · tampa | PAN | 161, 34, 174, 38 | 159, 154, 148 | `#BCB4AA` |
| Silo 3 · tampa | PAN | 117, 34, 131, 38 | 170, 181, 187 | `#C9D4D7` |
| Silo 4 · tampa afastada da torre | PAN | 76, 34, 86, 38 | 149, 157, 159 | `#B0B8B7` |
| Silos · costado em luz difusa | PAN | 119, 54, 129, 69 | 123, 142, 156 | `#91A6B3` |
| Silos · lado do costado em sombra | PAN | 138, 54, 142, 69 | 89, 104, 114 | Conferência visual |
| Silos · borda das bases na panorâmica | PAN | 121, 80, 129, 82 | 121, 125, 124 | `#8F928F` |

As fotos da DJI 0044 mostram o arco com uma face acinzentada e outra de tom quente. A diferença continua visível sob luz neutra. A pátina e os painéis variegados se concentram no oitão fotografado. O anexo 56 tem duas águas de tons distintos e uma caixa de chapa clara. As superfícies laterais cuja pintura não foi confirmada conservam fechamento metálico neutro.

O vídeo de 36 s mostra a boca sul do Cavaco aberta, um beiral longo vermelho e pilares sob a cobertura. O de 72 s permite separar o acabamento do telhado da caldeira, a estrutura metálica visível na face leste e a sombra no vão. O de 108 s sustenta as faixas de fechamento e a cor das platibandas na Preparação. O modelo representa as travessas, pilares e vãos visíveis. O conteúdo encoberto e a distribuição das instalações internas permanecem pendentes.

A leitura das seis tampas do núcleo combina as duas fileiras vistas na DJI 199 com suas posições no layout. A classe de tampa dos dois corpos pequenos é compartilhada. A panorâmica confirma a variação entre as quatro tampas dos silos e a concentração das cintas no alto do costado. A identificação industrial por plaqueta, o produto armazenado, o fabricante da tinta e a cor de especificação precisam de cadastro ou vistoria. Uma tomada frontal sob luz difusa com carta cinza, material de referência, distância e escala permitiria substituir a calibração fotográfica por valores medidos.

O comparativo privado de cores acompanha os recortes examinados. A tabela usa somente medições, indicações das fontes e interpretação. Os originais permanecem no acervo privado.
