# Interface da biblioteca, do mapa e do acervo

A auditoria no navegador integrado percorreu a biblioteca pública, a cena, o menu Camadas e a ficha de `28.1`. Na interface anterior, abrir a ficha deixava pouco espaço útil para busca e mapa em telas estreitas. Os créditos regionais ocupavam quase metade do menu, antes dos controles de renderização e dos enquadramentos. A lista de objetos não permitia separar estruturas, componentes e LVHF.

| Etapa                          | Resultado da revisão                                                                                                                                                                                                 | Verificação                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Biblioteca                  | Quatro cartões com pictogramas próprios, títulos próximos das prévias e identidade visual coerente com o Nexus. A busca sincroniza com a URL e informa o número de visualizações encontradas.                        | Busca sem acento, resultado vazio, limpar e voltar do cartão. Cartões em duas colunas no desktop e uma no celular.                  |
| 2. Explorar Cruz Alta          | Busca por nome ou código, filtros por tipo e resultados operáveis pelas setas e Enter. Camadas e renderização têm grupos próprios. Fontes regionais ficam em um resumo expansível.                                   | Órbita, Planta, Pátio, minimapa, busca, LVHF, comparação de arquivo local e retorno à visão geral.                                  |
| 3. Ficha e leitor              | A ficha identifica o conjunto e dá entrada ao acervo conforme a posição do usuário. O mapa permanece montado quando o leitor abre ou fecha.                                                                          | URL direta, barreira sem sessão e retorno à cobertura 28.1 com a mesma câmera.                                                      |
| 4. Editar e adicionar arquivos | Modos de consulta e edição distinguem ações de leitura e gravação. O envio indica destino, arquivo e metadados antes de publicar a revisão. Ficha e documentos mantêm controle de versão e recuperação de conflitos. | Compilação, tipos e inspeção do fluxo de tela. A gravação e a abertura do PDF autenticadas precisam de sessão autorizada no acervo. |

[Biblioteca com os quatro cartões](biblioteca.jpg) · [Biblioteca no celular](biblioteca-celular.jpg) · [Ficha e mapa no celular](mapa-celular.jpg)

## Pictogramas da biblioteca

Os quatro pictogramas foram gerados com ImageGen nativo a partir da direção de identidade do Creative Production. O painel do plugin não estava disponível no runtime desta sessão. Cada imagem representa a categoria da cena, com proporções ilustrativas. Os WebPs têm 160 × 160, fundo transparente e entre 7 e 11 kB. A origem é geração própria para o Nexus. O repositório não declara licença autônoma para os pictogramas. [Arquivos WebP](../../../public/models/mapas-3d/icons/)

Direção comum de geração: pictograma industrial compacto em perspectiva isométrica, centrado, com silhueta legível a 56 px, volumes em verde eucalipto, sálvia, zinco claro e pequenos detalhes em latão. Fundo transparente, apenas o objeto, sem texto ou marca.

- **Cruz Alta** combina quatro silos cônicos, um armazém em arco e uma pequena galeria em treliça.
- **Silo metálico** usa um cilindro corrugado em corte com uma linha de vida interna.
- **Moega 3** mostra o funil de recebimento e o transportador inclinado sob uma cobertura aberta.
- **Unidade industrial 3 Tentos** reúne três naves ligadas a um bloco de processo alto.

## Índice de setores de Cruz Alta

A lista abre nos sete setores do manifesto. Cada cartão combina um pictograma da família industrial, o nome e a quantidade de estruturas. A seta de expansão revela estruturas, componentes e itens LVHF em sequência. O controle de enquadramento ao lado do título leva a câmera ao setor. Os pictogramas acompanham os títulos dos grupos na busca e usam o mesmo arquivo associado ao setor na ficha.

A busca apresenta resultados agrupados por setor, mostra o caminho do objeto e conserva o filtro durante a digitação. As setas para cima e para baixo percorrem as linhas disponíveis. Enter ativa a linha em foco e Escape fecha a lista e devolve o foco à busca. O componente 28.1 foi localizado sob Preparação. O filtro LVHF exibiu o item retirado 29.2 sob Extração e abriu sua ficha histórica pela URL própria. A 320 px, a lista rola no painel e os modos de navegação permanecem acessíveis. [Índice de setores na cena](lista-setores.jpg) · [Índice a 320 px](lista-setores-celular.jpg)

## Ícones da navegação e legenda LVHF

O seletor conserva os nomes Órbita, Planta e Pátio e destaca o modo atual com contraste entre o botão e o pictograma. A órbita envolve um volume em três quartos, a planta distingue os volumes vistos de cima e o pátio usa a perspectiva dos trilhos e da passagem industrial. Os sete ícones de setor e os três do navegador foram gerados com ImageGen nativo na mesma direção de identidade do catálogo. Cada WebP usa 96 × 96, com transparência e o foco em uma silhueta de leitura curta. [Ícones da unidade](../../../public/models/cruz-alta/icones/)

A folha 1 do A1 recebido, revisão 43 de 28/10/2026, fornece a convenção de cor. O estado por item, os traçados e a vigência de referência são os da revisão 56 de 18/11/2026. A camada **Linhas de vida** aplica as cores aos traçados em cobertura. A lista e a ficha usam pequenos marcadores acompanhados por texto.

| Cor de inspeção                   | Registro da revisão 56                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Verde                             | Montada                                                                                     |
| Âmbar                             | A montar                                                                                    |
| Verde e azul                      | Montada com aditivo. Os itens 01, 38 e 57 recebem a divisão da cor ao longo do percurso.    |
| Cinza, apenas na ficha e na lista | Fora do projeto ou retirada. Os itens 20 e 29.2 seguem acessíveis para consulta documental. |

A revisão 56 registra zero itens novos em aprovação. A cor vermelha da prancha histórica fica disponível no original do acervo. O realce de seleção da estrutura e os materiais da fábrica continuam independentes da situação de montagem. A legenda descreve a revisão do desenho. [Legenda na cena](legenda-lvhf.jpg) · [Levantamento e versões](../levantamento.md)
