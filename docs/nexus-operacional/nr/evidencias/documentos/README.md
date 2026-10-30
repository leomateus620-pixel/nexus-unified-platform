# Verificação do editor documental

Os arquivos e capturas desta pasta contêm somente o cenário sintético de `tests/nr-documents.test.ts`. Nenhum original de cliente foi versionado.

O PDF nativo de cinco páginas foi renderizado pelo Poppler; o DOCX foi convertido pelo LibreOffice e suas seis páginas foram renderizadas pelo `render_docx.py` da skill Documents. Todas as páginas foram inspecionadas. A inspeção encontrou quebras em linhas curtas de tabela; os geradores foram corrigidos para manter essas linhas inteiras. Cabeçalhos de tabela se repetem, as bordas permanecem visíveis e os rodapés têm paginação. Não houve corte de texto nas páginas finais. As imagens de primeira e última página documentam esse estado.

Os testes também verificam os bytes do pacote DOCX, títulos, parágrafos, todas as linhas de tabela, imagens incorporadas, glifos técnicos, fontes locais no PDF, limites de texto por página e o marcador final. Os testes de comandos verificam que a conversão cria outro documento, preserva origem/hash/revisão e recusa sobrescrever uma edição posterior.

Uma segunda verificação leu um DOCX real autorizado, cujo SHA-256 é `9ec17cbbc1f99f225909014cc5541d6ce468e3ee6be3be79d073c30a03a12a09` e tamanho é 323.732 bytes. A conversão encontrou uma tabela com 93 linhas, até nove colunas e 14.948 caracteres, além de duas imagens JPEG com 252.756 bytes ao todo. O PDF derivado privado teve 23 páginas e nenhuma extrapolação das margens detectada pela extração de texto. O original, os derivados desse teste e seu conteúdo permanecem no armazenamento privado da tarefa.

Essa conversão é estrutural. Células mescladas são linearizadas; imagens dentro de tabelas viram blocos após a tabela. Layout, estilos, cabeçalhos, rodapés, notas, campos Word, comentários, assinaturas e posicionamento não têm reprodução fiel. Os avisos acompanham a edição derivada. O original não é alterado. A exportação é uma cópia derivada de consulta e não emite, aprova ou assina um documento.

Os testes de bytes e de renderização não comprovam uma sessão Auth/Storage HTTP de produção, nem correção normativa dos textos.
