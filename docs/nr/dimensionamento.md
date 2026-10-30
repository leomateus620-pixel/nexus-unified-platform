# Dimensionamento do acervo NR

Recorte em **30/10/2026 às 20:18 UTC**. Os valores abaixo medem categorias diferentes. Tamanho informado por metadados não comprova obtenção, integridade ou consumo atual no Storage.

Os valores e as premissas também estão em [formato estruturado](evidencias/dimensionamento.json).

| Categoria | Quantidade | Bytes | Evidência e situação |
|---|---:|---:|---|
| Originais atuais | 605 objetos | 232.242.866 | Bytes obtidos, hash/MIME/tamanho validados, transferência e leitura de retorno reais, confirmação no banco |
| Revisões históricas adicionais do Drive | 550 revisões | 267.139.136 | Soma dos tamanhos declarados pelos metadados; nenhum desses bytes históricos foi baixado |
| Imagens extraídas dos DOCX | 417 objetos por contexto | 59.629.408 | Bytes validados, transferência e leitura de retorno reais, confirmação no banco |
| Total de objetos confirmados desta migração | 1.022 objetos | 291.872.274 | Soma dos 605 originais e das 417 imagens derivadas; não inclui históricos indisponíveis |
| Fotos originais próprias do aplicativo | 245 caminhos | Desconhecido | Obtenção e identidade ainda não comprovadas; não associar por nomes parecidos |
| Miniaturas próprias do aplicativo | 245 caminhos | Desconhecido | Categoria separada dos originais; não usar miniatura como prova de resolução original |

A [confirmação dos originais](evidencias/original-storage-confirmed.json) cobre 233 DOCX, 232 PDF e 140 JPEG. Os 605 objetos têm 604 hashes distintos: igualdade de bytes não elimina destinos ou relações com contexto próprio. Para o consumo atual desses originais, considera-se a soma dos 605 destinos confirmados.

A [confirmação das imagens derivadas](evidencias/docx-images-storage-confirmed.json) acrescenta os 417 objetos; a [leitura dos documentos derivados](evidencias/docx-derived-production.json) confirma o total de 1.022 objetos. Os 233 documentos editáveis adicionais somam 4.073 blocos nativos no banco e não são contados como 233 novos arquivos físicos.

O maior original atual tem 5.500.384 bytes. O maior tamanho declarado entre as revisões históricas é 5.605.739 bytes; esse valor é metadado, sem validação dos bytes. Nenhum original atual excedeu 20 MiB. O suporte implementado até 50 MiB foi exercitado apenas no ambiente isolado para esse limite.

Os 605 posicionamentos de imagens encontrados nos DOCX somam 88.593.664 bytes antes da deduplicação por contexto. A preparação física usa os 417 objetos e os 59.629.408 bytes da tabela, sem multiplicar um mesmo objeto por cada referência no documento. Um EMF não convertido permanece no DOCX original e não é contado como imagem raster migrada.

## Base de planejamento e exclusões

Somar os originais atuais aos tamanhos declarados dos históricos resulta em **499.382.002 bytes**. Acrescentar as imagens derivadas confirmadas resulta em **559.011.410 bytes** — aproximadamente 559,011 MB decimais ou 533,115 MiB. Essa é uma base aritmética de planejamento que soma os 291.872.274 bytes atuais confirmados aos 267.139.136 bytes apenas declarados dos históricos; não é consumo atual, quota disponível ou preservação integral do acervo.

Essa base ainda exclui os tamanhos desconhecidos das fotos e miniaturas próprias do aplicativo, dados de outros módulos/buckets, futuras revisões e evidências, overhead do banco, indexação, retenção e eventuais backups. Não se presume que fotos da origem e JPEG do Drive sejam iguais. A confirmação dessas relações poderá alterar a necessidade física sem alterar as identidades de origem.

Os documentos nativos persistem conteúdo e snapshots no PostgreSQL. As exportações PDF/DOCX implementadas retornam derivados de consulta com `persistido: false`; não são gravadas automaticamente no bucket. Caso futuramente sejam retidas como arquivos, seu volume deverá ser medido e incluído. ZIPs privados de transferência, arquivos locais e staging ficam fora do bucket e não entram no consumo remoto desta tabela.

## Cenários ilustrativos de crescimento

As projeções usam a base de 559.011.410 bytes, crescimento anual composto de **25%** e reserva adicional de **20%**. São premissas para revisão do responsável, sem medição de crescimento histórico e sem definição de quota.

| Cenário | Premissa | Bytes projetados | MiB aproximados |
|---|---|---:|---:|
| Base aritmética | Sem crescimento ou reserva | 559.011.410 | 533,115 |
| 12 meses | Base × 1,25 × 1,20 | 838.517.115 | 799,672 |
| 24 meses | Base × 1,25² × 1,20, arredondada para cima | 1.048.146.394 | 999,590 |

Essas projeções não quantificam as exclusões anteriores. Revisões documentais completas, política de retenção, resolução/quantidade de novas fotos e armazenamento de exportações devem orientar uma nova medição do cenário real.

## Recursos informados e consumo medido

Foram informados 10 GB de armazenamento e 2 GB de RAM; a identificação de recurso observada foi Small. Não foram confirmados o escopo desses valores, a unidade GB/GiB, a quota contratada do bucket, o espaço disponível compartilhado ou a memória efetivamente consumida. Não se deriva capacidade operacional, concorrência suportada ou ausência de gargalos a partir desses números.

MB/GB decimais usam 1.000²/1.000³ bytes; MiB/GiB usam 1.024²/1.024³ bytes. Confirmar a unidade e o escopo do painel do provedor é necessário antes de comparar a projeção com uma capacidade anunciada.

As configurações consultam o consumo real do Storage, separado por bucket/unidade, e os estados de uploads/revisões/lotes. As [medições SQL no volume real](evidencias/producao-desempenho.json) têm seu próprio escopo: não medem consumo de RAM, rede, renderização de navegador ou percentis de produção.
