# Provas de banco e projeção após a posição 69

Consultas somente leitura pelo conector Lovable no Supabase associado `yhtgijtllvgzoqtfcgal`, PostgreSQL **17.6**, capturadas entre 00:22 e 00:46 UTC de 31/10/2026 (**30/10/2026, America/Sao_Paulo**). Os resultados completos estão em [producao-projecoes-e-preservacao-69.json](evidencias/producao-projecoes-e-preservacao-69.json). Os checkpoints 67/68/69 e seus checksums conferem com o manifesto do repositório.

Estas consultas proprietárias não definem JWT nem simulam identidade de usuário. A navegação autenticada e a versão efetivamente servida do frontend são verificações separadas. Inspeção de permissões no catálogo não substitui uma prova de sessão; os testes negativos de organização/papel foram executados no PostgreSQL isolado.

## Conteúdo recuperado na projeção

- Os **112 levantamentos importados** possuem apresentação comprovada de 16 blocos e 104 definições de campos, conservando seus vínculos/snapshots históricos. As **8.685 respostas** pertencem a esses 112 registros. A aplicabilidade continua condicional; o número de definições não transforma todos os campos em obrigatórios para todos os locais.
- Permanecem 112 locais, 1.344 avaliações por família, 270 acontecimentos técnicos e nove eventos globais de origem. As avaliações não representam equipamentos instalados.
- O contexto associado ao módulo contém dois clientes e quatro unidades. Matriz e Sementeiro permanecem com zero locais e um documento cada.
- O EC 01 da Fábrica mantém **12 registros NR33**: sete de origem e cinco cópias editáveis. Duas cópias possuem pai documental comprovado e três continuam acessíveis com correspondência pendente. O registro NR35 é contado separadamente. Cinco registros de origem NR33 desse local não são encontrados somente pela TAG no título/descrição.
- O acervo contém 969 documentos lógicos: **736 registros de origem e 233 cópias por proveniência**. Existem 65 relações de cópia com pai documental comprovado e 168 cópias cuja correspondência documental permanece pendente. Classificação de cópia e comprovação de linhagem são métricas diferentes.

## Preservação da conciliação normativa

As 80 decisões da versão `nr-aplicabilidade-2026-10-30-v1` resultaram em oito ampliações aplicadas, 65 recortes mantidos e sete análises pendentes. Permanecem 80 pendências, 29 encerradas e 35 tratativas. O recorte NR35 possui oito pendências, sendo duas encerradas.

Os oito eventos `conciliar_aplicabilidade` alteraram exclusivamente **`normas`, `version` e `updated_at`**. O confronto integral de todos os demais campos retorna zero diferenças; nenhum estado mudou e todos os incrementos de versão foram de uma unidade.

A primeira comparação de hashes retirava a propriedade inexistente `versao` e conservava a coluna real `version`, produzindo hashes distintos. Retirando `normas`, `version` e `updated_at`, os snapshots antes/depois apresentam o mesmo MD5 de conferência: `dffa1f86c65894f6ef5a50926809f43b`. A comparação direta dos campos fornece a prova adicional independente desse hash.

Os 35 textos, autores e datas das tratativas correspondem às fontes preservadas. Todas as 35 datas originais são datas sem hora: 29 tratativas de pendências encerradas e seis de pendências abertas possuem correspondência exata entre `dados.encerrada_em`/`dados.atualizado_em` e o timestamp histórico UTC à meia-noite. O adaptador `treatmentOriginDate` recupera a apresentação de data apenas quando essa prova existe; registros manuais, instantes com hora e datas divergentes conservam sua apresentação própria.

O exemplo documental conferido mantém o timestamp armazenado `2026-10-11 00:00:00+00`, mas o DTO agora fornece a data textual comprovada **`2026-10-11`**. A exibição deixa de deslocá-la para o dia anterior em São Paulo.

## Arquivos e acesso

Os 65 documentos emitidos da Fábrica possuem 65 representações Word e 65 PDF confirmadas na respectiva revisão. O recebimento cadastrado dos 65 permanece `pendente`; a disponibilidade dos arquivos é uma informação separada.

Foram conferidos 60 pastas e metadados de 1.022 objetos no bucket privado, totalizando 291.872.274 bytes. O limite efetivo é 52.428.800 bytes por arquivo. Essa prova não repete download e SHA-256 de cada binário e não representa recuperação de arquivos novos.

Os 550 metadados de versões históricas do Drive possuem contexto de arquivo comprovado e permanecem classificados com bytes indisponíveis. A representação atual não foi utilizada como substituto da revisão antiga.

Todas as tabelas NR inspecionadas mantêm RLS. O papel `authenticated` pode consultar decisões sujeito à política, sem permissão para atualizá-las ou executar o manifesto proprietário.

## Medição de SQL no acervo real

Foi executado um `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` por consulta, com cache aquecido observado. A medição não é um benchmark estatístico. Os [comandos de leitura](evidencias/consultas-projecoes-69.sql) ficam no repositório como evidência reproduzível.

| Consulta                                                        | Planejamento SQL | Execução SQL | Resultado                                                   |
| --------------------------------------------------------------- | ---------------: | -----------: | ----------------------------------------------------------- |
| Linhagem da Fábrica NR33, antes da posição 69                   |         2,007 ms | 1.571,679 ms | 63 cópias comprovadas                                       |
| Mesma consulta após a posição 69                                |         2,340 ms |   130,670 ms | Mesmas 63 cópias                                            |
| Documentos do EC 01, página até 25 e resumo de revisão/arquivos |         3,844 ms |    65,075 ms | Dez linhas principais; cópias comprovadas ficam na linhagem |
| Locais da Fábrica, página de 25, TAG natural e resumos técnicos |         2,900 ms |   999,062 ms | 25 locais                                                   |
| Histórico técnico do EC 01, página até 25                       |         2,286 ms |     5,922 ms | DTO das sete narrativas                                     |
| Contadores documentais do Painel da Fábrica                     |         2,165 ms |   133,850 ms | DTO agregado                                                |

A mesma contagem de linhagem ficou aproximadamente 12 vezes mais rápida nesta amostra, mantendo o resultado. Os blocos em cache passaram de 289.449 para 12.350; não houve leitura de disco nem gravação temporária nessas amostras. A busca por UUID indexado substitui a comparação textual do identificador.

A página de locais ainda consumiu aproximadamente um segundo de SQL, uma limitação observada. O tempo de chamada ao conector variou de aproximadamente 2,5 a 3,8 segundos nas quatro consultas. Esse tempo inclui transporte e processamento Lovable/MCP e **não é latência HTTP da aplicação nem tempo de interação da interface**. A medição dos helpers proprietários também não representa a execução integral de uma RPC com sessão autenticada.

Os 10 GB de armazenamento e 2 GB de RAM informados pelo proprietário não foram medidos nestas consultas; não se inferiu quota disponível nem fluidez a partir dessas referências.
