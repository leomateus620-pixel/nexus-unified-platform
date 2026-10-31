# Fotografias e representações privadas — NR33 / NR35

A recuperação de mídia deve ser avaliada separadamente do refinamento visual. Metadados, jobs enfileirados e miniaturas não comprovam recuperação de fotografias originais.

## Base e inventário

A base de código consultada foi `476cd7ecde56aae5a235af906157d39e4072a40c`. A leitura atual do banco conectado, antes das novas transferências desta rodada, confirmou ledger 70, 1.022 objetos privados / 291.872.274 bytes, 557 imagens existentes (conjuntos Drive/DOCX) e 322 ocorrências históricas de fotos locais sem `arquivo_id` explícito. O staging protegido preservado confirma 245 caminhos de originais distintos e 245 referências de miniatura; esses números não são somados como fotografias diferentes.

`scripts/nr/photo-recovery-inventory.mjs` reusa o snapshot e o de-para existentes. Gera inventário individual protegido de ativos, miniaturas e ocorrências, com a posição separada da identidade do snapshot/caminho da ocorrência. Não publica os nomes, referências privadas, imagens ou URLs temporárias. O relatório individual permanece fora do repositório, no staging privado da migração.

## Contrato implementado

A migração append-only `0053_nr_imagem_representacoes.sql` foi aplicada no projeto Nexus pelo conector Lovable, com envelope transacional e ledger 72 confirmado. Ela acrescenta:

- Representações físicas privadas `miniatura_384` e `previa_768`, vinculadas ao ID e SHA-256 imutáveis do original e à versão `nexus-pillow-v1` do processamento.
- Fila automática para imagens verificadas, lease de cinco minutos, limite de três tentativas, retomada após interrupção e autorização canônica `nr_arquivo_ler` também no Storage.
- Registro explícito de ocorrências, com contexto de organização/cliente/unidade/local por FKs, posição, legenda histórica e vínculos separados para original e miniatura da origem. Uma miniatura pode existir enquanto o original permanece pendente.
- Importação administrativa que verifica contexto/bytes, não sobrescreve uma conciliação divergente e não altera snapshots técnicos antigos. Os comandos de importação continuam reservados à manutenção.

O backfill enfileirou 1.114 variantes das 557 imagens já existentes. A execução bounded foi concluída: 1.114 variantes, 52.513.516 bytes derivados, zero falhas e fila encerrada. O recibo final do executor conciliou logs piloto+lote, exit0 e tabela, com GET integral privado, igualdade dos bytes, MIME e SHA-256 em cada derivado. Esse conjunto continua sendo das imagens Drive/DOCX já existentes; ele não é contado como recuperação dos originais próprios da aplicação.

`nrArquivoImagem` aceita somente identidade e variante. O servidor resolve o caminho privado, verifica autorização antes/depois da assinatura e informa expiração de 60 segundos. A grade solicita miniaturas; originais são reservados para ampliação/download. Ativos marcados como `miniatura_origem` nunca geram `original_disponivel: true`.

`NrMediaImage` é compartilhado entre galeria e acervo: `object-fit: contain`, dimensão reservada, carregamento automático próximo da área visível, cache com organização/identidade/variante/versão, concorrência limitada a quatro assinaturas, renovação de autorização limitada e atualização de processamento somente durante visibilidade, com número limitado de consultas.

A galeria mantém `figure`/`figcaption`, legenda lateral no contêiner largo, empilhamento em painéis estreitos, ampliação, zoom, sequência, Escape e retorno ao acionador. Miniatura de origem sem original recebe identificação explícita e não oferece download de fotografia original.

## Processamento

`scripts/nr/image-worker.py` processa uma imagem por vez, limitado a 50 MiB de arquivo e 24 milhões de pixels. Valida hash, tamanho, MIME real, decodificação e leitura posterior dos derivados privados. Aplica EXIF somente à representação, mantém proporção/transparência, não amplia e não altera os originais. Os bytes são enviados sem overwrite; objetos existentes precisam coincidir no GET antes da confirmação. Falha individual não cancela o lote.

O worker precisa executar na infraestrutura com credencial de serviço; essa credencial não existe no checkout local e nunca deve chegar ao navegador. O modo `--watch` serve ao supervisor de processamento de novos uploads. A execução desta rodada usou --max-jobs, sem --watch, cron ou supervisor permanente instalado. Novos originais confirmados enfileiram variantes que precisam de outro lote bounded ou de um supervisor instalado explicitamente.

A execução isolada usou Python 3.9 / Pillow 11.3.0. A API de orientação é documentada oficialmente em [ImageOps.exif_transpose](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html#PIL.ImageOps.exif_transpose). Versões do runtime e do processador precisam permanecer registradas ao executar lotes; trocar o runtime exige revalidar a determinismo dos derivados, sem sobrescrever objetos já confirmados.

## Conciliação preventiva

`reconcile-files.mjs` trata nome exato em pasta como candidato, nunca como fotografia confirmada. `prepare-files.mjs` e `prepare-file-links.mjs` não distribuem fotos de uma pasta compartilhada a todos os seus locais ou documentos; a proteção também vale para staging antigo. Nenhum vínculo histórico existente foi removido automaticamente por esta correção prospectiva.

## Validação executada

- Instalação limpa de 75 migrações e replay sem reaplicações em PostgreSQL 17 isolado.
- 40 verificações SQL de autorização, revogação, contexto, limite de variante, lease, idempotência e miniatura sem original. Essa prova usa metadados de Storage isolados e não comprova bytes no serviço conectado.
- Três testes Python com imagens artificiais somente em memória: horizontal, vertical, panorâmica, pequena, transparência, EXIF, preservação do original e rejeição de HTML, corrupção, MIME/hash divergentes.
- Vinte testes frontend direcionados: funções de imagem/arquivo e projeção das evidências.
- Teste do planejador de conciliação com pasta compartilhada e staging antigo: aprovado, sem distribuição indevida a locais.

Os resultados visuais e a recuperação real por arquivo devem ser associados aos recibos de transferência desta rodada. Não substituir esses recibos por aprovação de build.

## Estado da origem nesta rodada

Os 245 originais da aplicação de origem e suas 245 miniaturas foram recuperados e verificados integralmente no staging protegido: 23.519.752 bytes de originais e 4.076.403 bytes de miniaturas. Os 490 caminhos correspondem diretamente a todas as referências esperadas do snapshot, sem caminho faltante nem conciliação por basename. São 245 ativos fotográficos e 322 ocorrências, com duas representações por ativo; não são 490 fotografias distintas. Esta verificação local ainda precisa ser seguida da confirmação individual de upload e GET privado na Nexus.

O pacote autêntico do artefato foi localizado a partir de um relatório já existente na sessão proprietária do Perplexity. O relatório identifica o arquivo por 32.641.129 bytes e SHA-256 `0e984002ed901a8f2c0595ae25b11220dd713f2bb1b6f2ad7f14dc8e63b05d1f`. A cópia autorizada do LOTE 2 no Google Drive contém esse mesmo binário, armazenado numa entrada chamada `index.html`, cujo conteúdo real é ZIP. A assinatura ZIP, o tamanho e o SHA-256 coincidem. Seu conteúdo tem 526 arquivos, com 491 entradas em `fotos/`: os 245 originais, 245 miniaturas e um mapa JSON. Cada imagem foi extraída pela referência completa idêntica à do snapshot, decodificada como JPEG e validada por hash, tamanho e dimensões. Nenhum pixel, orientação ou byte do original foi transformado durante a aquisição.

A recuperação anterior pelo Chrome nativo havia produzido oito miniaturas e um original. A biblioteca de Fontes da conta proprietária também permitiu recuperar um pacote do projeto contendo 76 originais e 76 miniaturas COTRIROSA. Todos esses arquivos são byte a byte idênticos às mesmas entradas do pacote completo. As observações anteriores permanecem nos recibos individuais, como provas independentes; não foram substituídas por inferências.

O acesso direto ao vínculo de original na prévia havia respondido para reabrir o aplicativo pelo Perplexity, inclusive na conta proprietária. Esse limite da prévia foi superado pela cópia autêntica já existente do pacote, sem alterar autenticação, permissões, cookies ou cabeçalhos. Os pacotes separados de servidor/dados não continham os arquivos fotográficos; arquivos Camera encontrados em outro diretório ficaram como candidatos enquanto não existia prova do caminho solicitado. O pacote completo tornou desnecessária essa conciliação, pois contém exatamente todos os caminhos originais. Código recebido da origem não foi executado.

A conferência do arquivo de dados baixado pela interface proprietária também confirmou que os arrays completos de fotografias dos 112 locais, incluindo suas 322 ocorrências, permanecem iguais aos do snapshot usado na migração. Os hashes de ambos os arquivos e o hash canônico dessa comparação estão protegidos fora do Git. O histórico e os IDs canônicos existentes foram preservados.

Oito miniaturas (85.406 bytes) foram transferidas e verificadas no bucket privado por GET integral, SHA-256, MIME e tamanho; o recibo corresponde exatamente aos oito destinos preparados, com zero erros, divergências ou itens inacabados. O conector confirmou os oito arquivos e registrou quinze ocorrências canônicas, sem divergência de cliente/unidade/local. Todas essas ocorrências ainda preservam o original pendente. O bucket continua privado e os comandos de importação não são concedidos ao browser. O recibo agregado está em `evidencias/fotos-miniaturas-2026-10-31.json`; referências individuais, evidência de aquisição e checkpoints permanecem protegidos fora do Git. O primeiro original já foi verificado localmente, mas ainda não foi confirmado no Storage Nexus. A recuperação integral permanece em andamento até cada um dos 245 originais e 245 miniaturas ter seu resultado individual verificável.
