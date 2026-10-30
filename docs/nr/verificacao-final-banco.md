# Verificação final somente leitura do banco conectado

Captura final em 30/10/2026, entre 20:56 e 21:03 UTC, após aplicação das 64 migrações no Supabase confirmado do Nexus, por `query_database` do Lovable. A execução usa o proprietário `postgres`; nenhuma fixture, publicação de critério, escrita de dados ou alteração de schema foi realizada nesta inspeção.

O ledger completo coincide com as 64 entradas do manifesto em caminho, posição e checksum. O catálogo conectado coincide com o PostgreSQL isolado na definição das 44 funções NR, tipos/defaults das 21 tabelas, 102 índices e 237 constraints. Todas as tabelas têm RLS; índices e constraints estão válidos; papéis da aplicação não têm escrita direta e funções internas/de importação mantêm seus grants restritos. Veja `evidencias/producao-ledger-64.json` e `producao-catalogo-64-verificacao.json`.

## Conteúdo e integridade

Os 969 documentos separam 736 registros históricos e 233 derivados DOCX nativos em rascunho. A conferência calculou SHA-256 dos conteúdos/snapshots no banco e comparou agregados por identidade com o plano privado congelado, sem baixar os textos dos clientes.

Os 233 derivados coincidem em hash do payload, conteúdo nativo, snapshot, contexto e proveniência. Seus 4.073 blocos estão persistidos. Os 736 históricos coincidem com o hash de origem e snapshot da captura privada. Todas as 969 revisões atuais, seus conteúdos e versões dos documentos permanecem iguais ao snapshot da respectiva importação. Essas observações confirmam igualdade no momento da captura; os testes isolados cobrem a preservação em edições/revisões posteriores e conflitos de reimportação.

A canonicalização usa `jsonb::text`, UTF-8 e ordenação explícita `COLLATE C`, pois o banco conectado usa `en_US.UTF-8` e o cluster de validação usa `C`. Os agregados SHA-256 correspondentes coincidem integralmente também após as migrações 63/64. As 15 regras/critérios continuam em rascunho e a tabela de fontes de publicação técnica permanece vazia; não houve aprovação normativa fabricada. Quatro contextos de origem e dois recibos HTTP duráveis foram preservados. Veja `evidencias/producao-pos-64-integridade.json`.

## Storage e contexto

O bucket privado NR contém 1.022 objetos e 291.872.274 bytes físicos: 605 originais, com 232.242.866 bytes, e 417 imagens derivadas, com 59.629.408 bytes. Todos os 1.022 caminhos são distintos e coincidem com metadados de MIME/tamanho no banco; todos estão vinculados e com bytes verificados. Não há objeto ausente nesse conjunto. Os recibos de leitura HTTP/SHA-256 efetiva são evidências separadas desta consulta SQL.

Por unidade com arquivos, a medição anonimizada após a migração 64 registra 533 objetos/111.115.588 bytes e 489 objetos/180.756.686 bytes. Vínculos documentais adicionais não multiplicam esses bytes. O bucket operacional anterior continua privado, com zero objetos nesta captura; seu limite de 20 MiB não foi alterado. Veja `evidencias/producao-storage-unidades-64.json`.

Existem 112 locais: 108 EC ligados a 108 espaços PET canônicos distintos, sem EC sem vínculo ou cruzamento de unidade; os quatro locais de altura não têm vínculo PET fictício. A importação não criou PETs, assinaturas ou avaliações atmosféricas: as três respectivas contagens são zero na organização. Veja `evidencias/producao-storage-final.json`.

O banco conectado ocupa 169.086.099 bytes em disco após as migrações 63/64; os objetos Storage são medidos separadamente. `shared_buffers` está configurado em 512 MiB, `work_mem` em 5 MiB, `maintenance_work_mem` em 128 MiB, `effective_cache_size` em 1,5 GiB e `max_connections` em 90. Essas configurações não medem RAM total/livre; `effective_cache_size` é estimativa do planejador. Os 10 GB de armazenamento e 2 GB de RAM informados não foram convertidos em quota disponível ou utilização percentual sem escopo confirmado.

## Consultas no volume final

| Consulta | Execução SQL | Resultado observado |
|---|---:|---|
| Lista documental, maior unidade, página 25 | 17,1 ms | 25 linhas, aproximadamente 22 KB |
| Busca documental parcial `EC` | 37,4 ms | 25 linhas, total filtrado 350 |
| Troca para outra unidade | 14,9 ms | 25 linhas, total 344 |
| Maior derivado nativo | 47,6 ms | 788 blocos, 157.712 bytes JSON |
| Histórico global, página 25 | 73,4 ms | 25 metadados, 11.684 bytes; sem snapshots |
| Histórico do registro | 22,2 ms | Um evento, 486 bytes; sem snapshots |
| Lista de revisões | 21,6 ms | Uma revisão, 371 bytes; sem conteúdo |
| Revisão completa solicitada | 42,7 ms | 318.101 bytes, somente sob demanda |
| Conciliação, página 25 | 21,9 ms | 25 de 4.300 itens, 24.583 bytes; sem payloads |
| Contexto da publicação técnica | 13,2 ms | 580 bytes, fontes/versões resumidas |

A projeção 64 reduziu o mesmo detalhe nativo de 796.908 para 157.712 bytes, aproximadamente 80,2%, mantendo seu conteúdo atual. Histórico, versões e itens de conciliação entregam metadados; os corpos completos dependem de abertura explícita autorizada.

As amostras usam `EXPLAIN ANALYZE BUFFERS`, uma execução por cenário, sem limpar cache ou impor carga sintética. Incluem autorização interna, descoberta do contexto de teste e serialização SQL; não incluem rede, renderização no navegador ou leitura de PDF/imagens. Não são valores p95 ou garantia de desempenho.

As RPCs recebem claim local de um membro existente, mas a conexão proprietária não constitui teste de sessão/browser nem prova negativa de RLS em produção. Políticas e grants foram inspecionados no catálogo conectado e testes negativos foram executados separadamente no PostgreSQL descartável. Os planos externos agregam o custo PL/pgSQL; a busca parcial atual usa `ILIKE` no contexto filtrado. Nenhum índice ou extensão foi alterado nesta medição. Veja `evidencias/producao-desempenho-64.json` e `producao-explain-64.json`.

Essa verificação não encerra as referências sem bytes ou versões históricas indisponíveis da origem; sua conciliação permanece identificada no lote.
