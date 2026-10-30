# Estado verificável da entrega

Dados e lote conciliados em **30/10/2026 às 20:29 UTC**; migrações 63/64 confirmadas no ledger às **20:54 UTC**, com catálogo integral conferido às **20:56 UTC**. Este documento separa os registros persistidos, a obtenção dos originais e a confirmação do Storage. Os relatórios privados do lote e as provas sanitizadas de leitura do banco e do Storage fundamentam os totais abaixo.

## Base persistida

| Categoria                                   | Registros persistidos |
| ------------------------------------------- | --------------------: |
| Clientes                                    |                     2 |
| Unidades                                    |                     4 |
| Locais                                      |                   112 |
| Espaços operacionais PET vinculados         |                   108 |
| Documentos de origem preservados            |                   736 |
| Documentos editáveis derivados, em rascunho |                   233 |
| Documentos lógicos totais                   |                   969 |
| Levantamentos                               |                   112 |
| Modelos                                     |                    39 |
| Avaliações por família                      |                 1.344 |
| Pendências abertas e encerradas             |                    80 |
| Tratativas                                  |                    35 |
| Pastas confirmadas na origem                |                    60 |

As unidades sem locais também foram preservadas. Os quatro locais exclusivamente de altura conservam sua classificação e não recebem espaços PET fictícios. Os 1.344 registros de `nr_sistemas` correspondem a 112 locais × 12 avaliações por família do levantamento, com cinco dimensões independentes; essa contagem não representa equipamentos instalados ou inspeções aprovadas. Quantidade de documentos lógicos não representa quantidade de arquivos físicos ou de revisões históricas do Drive.

O lote possui **4.300 itens com resultado terminal**: **3.260 importados**, **550 indisponíveis** e **490 sem correspondência**, com estado `com_pendencias` e zero itens aguardando processamento. Os 1.040 recursos retidos como pendência não foram apresentados como migração integral de bytes. Quatro registros de contexto preservam metadados do projeto e opções de interface, sem criar contas, poderes profissionais ou aplicar a seleção antiga ao contexto atual do Nexus. A inspeção administrativa do lote permite consultar esses resultados e evidências pela interface.

Foram conciliadas 525 referências externas: 465 arquivos e 60 pastas. Os 718 vínculos persistidos incluem os pares Word/PDF dos 65 documentos emitidos na origem, com IDs exatos de arquivo, documento e revisão. Nove eventos históricos foram preservados. As 550 revisões históricas indisponíveis continuam registradas como metadados, sem declarar preservação de seus bytes.

## Migrações e integridade

O catálogo conectado foi conferido pelo plugin Lovable: **64 entradas do ledger**, com caminhos, ordem e checksums idênticos ao manifesto. O prefixo de 62 entradas foi confirmado antes dos dois envelopes finais, com registro e DDL transacionais e leitura dos checksums após aplicação. As oito novas migrações efetivamente aplicadas são `0038_nr_base.sql`, `0039_nr_arquivos.sql`, `0040_nr_importacao.sql`, `0041_nr_organizacao_acervo.sql`, `0042_nr_impactos.sql`, `0043_nr_retencao_vinculos.sql`, `0044_nr_publicacao_tecnica.sql` e `0045_nr_historico_paginado.sql`. A histórica `0037_pet_listagem.sql` permanece preservada.

Os comprovantes sanitizados são o [ledger completo verificado](evidencias/producao-ledger-64.json), o [catálogo final comparado](evidencias/producao-catalogo-64-verificacao.json), a [aplicação e leitura das posições 63/64](evidencias/production-migrations-63-64.json), o [fechamento do lote](evidencias/final-closeout.json) e a [validação técnica](evidencias/README.md). A instalação limpa, o upgrade, o replay e o rollback foram ensaiados em PostgreSQL descartável; os testes não inserem fixtures no banco conectado.

Foram baixados e validados **605 originais atuais**, com **232.242.866 bytes**, distribuídos em 233 DOCX, 232 PDF e 140 JPEG. Os 130 links conhecidos dos documentos emitidos estão incluídos nos bytes obtidos. Existem 604 hashes físicos distintos, pois igualdade de bytes não elimina identidades ou vínculos de origem.

Os **605 originais atuais foram transferidos, lidos de volta no Storage e confirmados no banco**, com 232.242.866 bytes e estado `vinculado`. O hash agregado dos destinos foi confrontado de forma independente. A [prova sanitizada da confirmação](evidencias/original-storage-confirmed.json) distingue a leitura real dos objetos das preparações e dos pacotes privados de transferência.

Os 233 DOCX foram convertidos localmente pelo conversor `nr-docx-1.0.1`. Uma extração OOXML independente comparou os corpos textuais normalizados: 233 sequências exatas, sem caracteres ausentes ou extras. A comparação não certifica equivalência visual ou da notação matemática. Mesclas e posições de imagens são linearizadas, OfficeMath exige consulta ao original e um EMF permanece no original preservado. As limitações aparecem no detalhe do derivado, com download autorizado do DOCX original.

As **417 imagens derivadas foram transferidas, lidas de volta e confirmadas no banco**, com **59.629.408 bytes** e hash agregado confrontado independentemente. A [prova das imagens](evidencias/docx-images-storage-confirmed.json) é separada da [conversão local](evidencias/docx-conversao-local.json).

Os **233 documentos editáveis foram persistidos em 80 lotes transacionais**, com 233 UUIDs distintos, estado rascunho e **4.073 blocos nativos**. Cada transação revalidou os originais, as imagens e os vínculos comprovados. Os 736 documentos de origem permanecem preservados; o total passou a 969 documentos lógicos. Veja a [leitura da importação dos derivados](evidencias/docx-derived-production.json).

Os dois [recibos duráveis](evidencias/durable-storage-receipts.json) foram persistidos na auditoria do banco, com conjuntos ordenados de metadados e hashes agregados das leituras efetivas. Um reset de `/tmp` do provedor removeu os relatórios HTTP detalhados originais; os recibos canônicos e os eventos individuais de confirmação no banco permanecem preservados. Horários HTTP individuais desconhecidos não foram reconstruídos.

O acervo confirmado desta migração contém **1.022 objetos e 291.872.274 bytes**: 605 originais e 417 imagens derivadas. Esses totais não incluem os bytes históricos indisponíveis nem presumem preservação das fotos próprias do aplicativo.

O maior original efetivamente obtido tem 5.500.384 bytes; nenhum dos 605 ultrapassa 20 MiB. O limite implementado de 50 MiB foi verificado em ambiente isolado. A migração real não comprova transferência de um original acima de 20 MiB, pois esse caso não apareceu no acervo obtido.

As 550 revisões históricas adicionais expostas pelo Drive têm metadados preservados, mas seus bytes continuam indisponíveis: a API recusou o download de revisões sem retenção `keepForever`. A operação de leitura não alterou essa retenção. Fotos servidas pela origem e candidatos de nome semelhante no Drive continuam sem associação automática; diferenças de extensão não comprovam identidade. Veja [extração de arquivos](evidencias/files-extraction.json) e [revisões do Drive](evidencias/drive-revisions.json).

O [dimensionamento do acervo](dimensionamento.md) separa os 291.872.274 bytes confirmados, os tamanhos apenas declarados dos históricos e as fotografias da origem cujo tamanho permanece desconhecido. Pacotes privados de staging não entram no consumo do bucket.

## Interface e comportamento

As entradas `/nr-33` e `/nr-35` usam o shell e a autorização existentes. Os dois módulos oferecem contexto de cliente/unidade, inventário, levantamentos, documentos, pastas, pendências, biblioteca, histórico e configurações; detalhes têm endereço estável. A NR-33 acessa a PET canônica. A NR-35 apresenta sistemas e componentes sem convertê-los em espaços confinados.

O conteúdo nativo pode ser editado em blocos versionados. PDF/DOCX exportados são derivados de consulta; a conversão de DOCX cria um documento derivado e informa limitações. Originais e revisões emitidas permanecem preservados. Arquivos, pastas e pendências usam comandos persistentes com versão esperada e chave idempotente. Alterações em um local sinalizam os documentos explicitamente vinculados para revisão, sem regenerar seu conteúdo emitido.

Histórico e revisões são paginados no servidor e carregam snapshots completos somente sob demanda. Os nove eventos históricos sem escopo continuam explicitamente não classificados; sua exibição não atribui norma, cliente ou unidade. A publicação técnica interna de regras/critérios exige vínculo profissional, revisão declarada e fontes versionadas; as nove regras e seis critérios importados permanecem em rascunho. Esse fluxo não emite documentos ou PETs nem certifica conformidade.

As evidências de banco e as capturas sintéticas têm escopos diferentes. Os testes isolados verificam constraints, RLS, RPCs, contexto, concorrência e retenção; as capturas verificam apresentação e interações no laboratório. A leitura HTTP real dos 1.022 objetos está comprovada separadamente. A homologação completa da interface em sessão autenticada no ambiente conectado e a avaliação completa de acessibilidade continuam pendentes. Os limites detalhados estão em [evidências visuais](../nexus-operacional/nr/evidencias/README.md).

## Pendências de encerramento

- Preservar como indisponíveis as 550 revisões históricas até existir acesso autorizado aos bytes, sem reconstruir originais.
- Concluir a conferência das 245 fotos próprias do aplicativo e das 245 miniaturas, além da leitura final da origem, registrando a janela temporal e mudanças identificadas. A navegação no Chrome aguarda a disponibilização da sessão do Mac, atualmente bloqueada.
- Concluir a publicação coordenada da branch/PR, o merge e o deploy após as verificações, além da homologação em sessão autenticada no ambiente conectado. Esses marcos de publicação não são declarados concluídos neste recorte.
- Manter regras e critérios sem ativação normativa automática até a revisão profissional das fontes aplicáveis. Emissão, assinatura e liberação PET continuam dependentes dos mecanismos reais do Nexus.

Os procedimentos de retomada estão em [importação e recuperação](importacao-recuperacao.md). Payloads, decisões com dados de clientes, originais e pacotes permanecem em armazenamento privado; o repositório conserva somente código, migrações, checksums e evidências sanitizadas.
