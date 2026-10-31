# Projeções contextuais da experiência NR

`0048_nr_experiencia_contextual.sql` acrescenta a posição **67** ao manifesto após as migrações 0046/0047 integradas pela PR 19. A migração acrescenta consultas, índices, proteção de transição e uma tabela de associação vazia. Não reimporta registros nem atualiza as respostas, os snapshots, as classificações normativas, o recebimento ou a vigência estruturada do acervo anterior. A aplicação no banco conectado precisa ser comprovada separadamente pelo ledger; o resultado isolado está em [experiencia-contextual-isolada.json](evidencias/experiencia-contextual-isolada.json).

## Contratos de leitura

| Consulta | Projeção | Preservação |
| --- | --- | --- |
| `nr_consultar(...,'contexto',...)` | Clientes/unidades com relação explícita ao acervo ou associação NR; identificação, documentação e responsáveis históricos da unidade por ID exato em `nr_fontes`. | Cadastro global permanece integral. Unidade com documentos e nenhum local continua navegável. As unidades associadas continuam disponíveis ao alternar NR; seus indicadores respeitam o recorte selecionado. |
| `nr_consultar(...,'locais',...)` | Resumo técnico de setor, enquadramento, situação histórica do levantamento, memorial, avaliações, referências fotográficas e documentação. | Lista continua sem o snapshot completo. Ordenação natural de TAG no servidor usa unidade, segmentos numéricos, TAG original e ID como desempates. Não recodifica zeros, aliases ou sufixos. |
| `nr_consultar(...,'documentos',...)` | `resumo_documental`: revisão, vigência estruturada e situação de apresentação, data textual original, autoria histórica, Word/PDF confirmados da revisão e cópias editáveis comprovadas. | Bytes não alteram `recebimento`. Uma nota explícita de substituição recebe o rótulo `substituicao_declarada`; não fabrica sucessão, aprovação ou correção de revisão emitida. |
| `nr_consultar(...,'historico_tecnico',...)` | Página de acontecimentos em `nr_locais.dados.historico`, com data do fato, autor histórico, ação, detalhe integral, evento original e IDs de contexto. | Data sem hora continua texto de data. Não copia narrativas para a auditoria da aplicação. O painel apresenta alterações técnicas e eventos globais em coleções distintas. |
| `nr_consultar(...,'levantamentos',{'id':...})` | Respostas e snapshot existentes; `modelo_apresentacao` separado para o legado cujo roteiro não expôs campos. | Não troca `modelo_id`, versão ou conteúdo histórico. `local_titulo`, `local_tag`, `local_contexto` e `unidade_nome` resolvem relações por ID sem depender da primeira página de opções. |
| `nr_consultar(...,'pastas',...)` | `resumo_pasta` distingue subpastas, documentos, arquivos físicos e imagens. | Uma pasta contendo fotos pode ter zero documentos e continua apresentando seu conteúdo. Vínculos secundários contam o objeto físico uma única vez. |
| `nr_arquivo_listar` | Metadados originais e contextos de cada vínculo explícito, com suas evidências/legendas. | Uma imagem originalmente NR33 pode ser consultada no contexto de um documento NR35 que a vincula explicitamente. Não muda a classificação física nem amplia acesso para outra organização. |

Filtros documentais `grupo_documental`, `local_id`, `somente_unidade` e `copias_editaveis` são aplicados no servidor. O vínculo local usa UUID; a busca por TAG continua adicional. O grupo `vigentes` exige condição emitida/recebida e ausência de substituição/desatualização declarada. O grupo `anteriores` conserva a distinção dos motivos nos respectivos rótulos.

## De-para dos levantamentos

O importador existente `scripts/nr/prepare-import.mjs`, fase `levantamentos`, percorre os campos do modelo global e persiste a resposta em `${bloco.id}.${campo.id}` usando seu `destino` exato no registro original. O roteiro histórico de 11 blocos possui nomes/IDs que não são equivalentes aos 16 blocos de apresentação: em particular, B07 histórico pode significar matriz de itens enquanto B07 do roteiro global representa geometria.

A projeção `nr-levantamento-apresentacao-1` exige cumulativamente:

1. Levantamento marcado pelo importador como legado e respostas extraídas por caminho.
2. Snapshot histórico sem campos estruturados.
3. Fonte `modelo_levantamento` com identidade externa `MLT-EC-R00` e versão preservada cujo SHA-256 coincide com o SHA-256 da fonte importada.
4. Fonte do próprio levantamento com a mesma origem, e todas as chaves das respostas importadas encontradas por identidade exata nas definições daquele roteiro.
5. Compatibilidade de organização, norma e eventual escopo de cliente/unidade do modelo.

O DTO entrega o modelo somente para apresentação. Respostas desconhecidas adicionadas posteriormente continuam presentes; o adaptador não as remove. Ausência de prova retorna `modelo_apresentacao: null`, sem selecionar um modelo por nome ou reinterpretar respostas silenciosamente. O estado histórico “concluído” não altera o estado de revisão da Nexus.

## Linhagem, associação e transições

Uma cópia editável só é recolhida à linhagem quando os IDs explícitos do manifesto/conversão apontam para documento existente da organização, e o arquivo original confirmado tem relação primária ou secundária com ele. Títulos e proximidade de datas não entram na decisão. As cópias conservam seus próprios IDs, conteúdo e revisão.

`nr_contexto_associar` associa unidade existente e seu cliente canônico ao módulo, inclusive antes do primeiro local. Exige `ver_nr` e `cadastrar_nr`, verifica contexto e cadastros ativos, usa a trava canônica do autor e chave idempotente, e registra auditoria. Reexecuções concorrentes não duplicam a associação; uma chave reutilizada com outro pedido é rejeitada. Não arquiva clientes para organizar o módulo.

O trigger `nr_documento_transicao_coerente` impede submeter o mesmo rascunho histórico com snapshot e nota explícita de substituição. A criação de nova revisão permanece disponível. Os triggers de emissão, revisão, imutabilidade, retenção e PET continuam ativos.

## Validação isolada

`tests/db/nr-experiencia.mjs` cria banco descartável em PostgreSQL, instala o prefixo real de 66 migrações, prepara dados artificiais, injeta uma falha após o DDL completo da 0048, confere rollback de objetos/ledger, aplica a migração e repete runner e envelope do conector. Compara integralmente snapshots, narrativas, datas, autores, respostas e definições PET antes/depois. Também cobre RLS, isolamento entre unidades com a mesma TAG, filtros relacionais, linhagem, disponibilidade Word/PDF, imagens compartilhadas por vínculo NR35, roteiros históricos e concorrência da associação.

O harness de instalação/upgrade e as 14 suítes NR foram executados contra o manifesto de 67 posições. As 547 verificações de cenários incluem 68 específicas da experiência contextual. As fixtures de Storage são apenas metadados sintéticos: não comprovam obtenção HTTP nem hashes dos binários de produção. O ambiente isolado não possui `pg_cron`; a fila persistente mantém sua verificação manual já estabelecida. Recuperação de fotos da aplicação, revisões históricas do Drive, classificação normativa e comparação visual autenticada precisam de suas próprias evidências.
