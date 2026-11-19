# Horizonte de Cruz Alta

O visitante pode orbitar, aproximar e caminhar dentro da implantação. O relevo regional preenche os pontos de vista disponíveis, inclusive o do pátio. A camada de entorno participa da imagem e fica fora da busca e da seleção de ativos da unidade.

## Extensão, época e resolução

| Faixa | Extensão | Fonte da cor | Resolução da imagem distribuída | Relevo |
| --- | --- | --- | --- | --- |
| Vizinhança imediata | 3,2 × 3,2 km, centrados na origem | CBERS-4A/WPM, 09/08/2026, fusão PCA nas bandas visíveis | 2 m/pixel, 1.600 × 1.600 | Grade local |
| Cidade e cinturão agrícola | 14,4 × 14,4 km | Mesma cena CBERS, com complemento Sentinel-2 em 0,0006% do recorte | 3,52 m/pixel, 4.096 × 4.096 | Grade de 37,5 m |
| Município e arredores | 59 × 58 km, retângulo que envolve toda a malha municipal 4306106 e uma margem mínima de 2 km | Mediana anual Sentinel‑2 de 2021 | 30 m/pixel, 1.967 × 1.933 | Grade de aproximadamente 160 m |

Os recortes CBERS são ortorretificados. Um único ajuste de luminosidade por banda compatibiliza os níveis digitais do CBERS com a imagem Sentinel na área de sobreposição. A textura da vizinhança conserva os pixels de 2 m da fonte pancromática fundida. A morfologia urbana, os talhões, as matas e os alinhamentos foram confrontados visualmente com o Earth em quatro aproximações. O produto distribuído contém os recortes INPE e Copernicus. A imagem Earth de referência indica 24/08/2026. [Cena INPE utilizada](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1/items/CBERS4A_WPM_PCA_RGB321_20260809_209_149) · [Coleção e licença dos compostos Sentinel](https://esa-worldcover.org/en/data-access) · [Malha municipal do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4306106?formato=application/vnd.geo%2Bjson&qualidade=maxima).

O modelo de superfície Copernicus GLO‑30 tem resolução nominal de 30 m e datum vertical EGM2008. Suas amostras incluem a contribuição de copas e construções. O intervalo no retângulo amplo é de 313,2 a 516,7 m. A amostra interpolada na origem, 464,24 m, define a referência vertical relativa da paisagem. A implantação técnica usa o piso local Y = 0. A faixa externa faz a transição de altura junto à borda e considera a curvatura da Terra ao representar as distâncias maiores. A cota topográfica do piso da fábrica continua pendente de levantamento. [Especificação do GLO‑30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

## Reprodução

Execute com Python 3.12 ou superior e as bibliotecas numpy, rasterio, requests e Pillow instaladas. O primeiro argumento indica o diretório destinado aos insumos originais. O segundo recebe os derivados. O recorte CBERS usa requisições HTTP por faixa ao COG do INPE.

```sh
python scripts/cruz-alta/gerar_horizonte.py /caminho/cache-geografico /caminho/derivados
```

O [manifesto regional](../../public/models/cruz-alta/regional/manifest.json) registra as fontes, a data CBERS, as grades, as unidades, as licenças e os hashes. Os quatro insumos baixados integralmente têm SHA‑256 calculado nos bytes locais. Para o COG CBERS, o manifesto conserva o hash catalogado pelo INPE para o original e o hash calculado no recorte efetivamente lido.

As coordenadas das malhas usam X leste, Z sul e Y vertical. A projeção segue o mesmo Mercator local de `registro.ts`, com origem em −28,66355384°, −53,60602301° e fator de escala igual ao cosseno da latitude de origem. As amostras de elevação ficam nos nós da grade, com a primeira linha ao norte. Os centros dos pixels de imagem ficam a meia célula da borda. Os materiais de solo da implantação e as elevações interpretadas das estruturas têm fontes e graus de confirmação próprios, registrados no [levantamento da unidade](levantamento.md).

### Alinhamento local e silhueta urbana

Quatro controles no chão indicaram um deslocamento sistemático do recorte CBERS junto à fábrica. Seis janelas independentes apresentaram erro quadrático médio de 15,23 m antes da correção e 6,58 m depois, com residual máximo de 10,69 m. A correção altera apenas a amostragem da cor até 310 m da origem e diminui gradualmente até 620 m. As coordenadas dos objetos técnicos, do relevo e da imagem de origem conservam seu referencial. [Janelas e resíduos do CBERS](registro-cbers.json).

O setor urbano próximo incorpora 889 contornos de edificações do OpenStreetMap para dar profundidade à vista rasante. Um contorno tem número de pavimentos registrado. Os demais recebem altura indicativa de contexto. Os polígonos ficam fora do cadastro técnico da fábrica. O [subconjunto distribuído](../../public/models/cruz-alta/edificacoes-vizinhanca.json) traz seu crédito e licença. [OpenStreetMap e colaboradores](https://www.openstreetmap.org/copyright).
