# Medição local antes/depois

Base 5286881c; Edge 154.0.4258.37. Intel(R) Core(TM) i5-1035G1 CPU @ 1.00GHz. Sem throttle. Cinco amostras por ação; mediana de evento até o segundo requestAnimationFrame, em milissegundos. Não mede rede, confirmação de banco ou FPS sustentado. Fontes e fixtures são as mesmas. Ensaios em sequência, sem build nem edição durante a medição.

## Componentes

| Objetos | Ação | Antes (ms) | Depois (ms) |
| --- | --- | ---: | ---: |
| 21 | Busca | 30.4 | 31.0 |
| 21 | Selecionar todos | 30.8 | 25.5 |
| 21 | Abrir editor | 19.3 | 22.4 |
| 21 | Rolar | 31.4 | 31.6 |
| 100 | Busca | 30.7 | 31.4 |
| 100 | Selecionar todos | 31.8 | 50.6 |
| 100 | Abrir editor | 24.4 | 25.2 |
| 100 | Rolar | 31.3 | 30.5 |
| 500 | Busca | 44.5 | 39.2 |
| 500 | Selecionar todos | 85.2 | 44.5 |
| 500 | Abrir editor | 74.4 | 21.8 |
| 500 | Rolar | 31.3 | 31.3 |

## Sistemas

| Objetos | Ação | Antes (ms) | Depois (ms) |
| --- | --- | ---: | ---: |
| 17 | Digitar | 31.4 | 31.8 |
| 17 | Abrir composição | 27.6 | 26.4 |
| 17 | Rolar | 31.0 | 31.2 |
| 100 | Digitar | 31.6 | 31.8 |
| 100 | Abrir composição | 62.6 | 44.2 |
| 100 | Rolar | 31.5 | 31.6 |
| 500 | Digitar | 24.6 | 31.9 |
| 500 | Abrir composição | 269.8 | 49.4 |
| 500 | Rolar | 31.0 | 31.5 |

Os cards carregam inicialmente até 48 objetos e oferecem Mostrar mais; a seleção e o filtro usam o conjunto completo. A comparação inclui esse controle de apresentação, sem mudar cache/refetch de negócio. Melhoras em cargas grandes não significam ganho em todas as operações: seleção em 100 componentes e digitação em 500 sistemas ficaram mais lentas neste ensaio. As amostras brutas e máximos estão em results.json nas duas pastas.

Quantidade de objetos no cenário normal: 21 componentes e 17 sistemas. Todas as cargas são sintéticas e isoladas. Não foram medidas memória de longa duração, rede de produção ou dispositivos físicos.
