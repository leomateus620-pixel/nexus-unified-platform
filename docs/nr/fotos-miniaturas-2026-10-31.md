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

O backfill Pillow executou na infraestrutura com a credencial de serviço já existente, sem expô-la ao checkout ou navegador. Usou somente lotes bounded em primeiro plano, sem `--watch`: os 1.604 derivados dos dois lotes estão confirmados por recibos separados. Esse worker de manutenção não é um supervisor permanente.

O processamento automático dos próximos uploads está implementado no runtime TanStack Start existente: três módulos exclusivos do servidor e a rota técnica `POST /api/public/nr/image-worker`, protegida por ticket descartável. Usa transformação nativa do Storage e persistência privada de WebP, preservando os paths Pillow. Tem prazo de 45 s, teto de 10 MiB verificado antes de ler o corpo e 24 milhões de pixels; o upload e o arquivo original conservam o limite de 50 MiB. O teto conservador considera o isolate compartilhado de 128 MiB do Cloudflare Workers, sem alegar medição de memória nesse ambiente. Os 18 testes do runtime, a separação do bundle cliente, a rota local sem ticket e o build foram verificados.

As 79 migrações estão aplicadas, incluindo a 0060 com o endpoint Nexus exato, mas a URL do Vault permanece em **HOLD**. A última leitura conectada confirmou zero trabalhos nativos, zero tickets e zero HTTP pendente. O aplicativo com a rota nova não foi publicado e o executor contínuo ainda não está ativo. A Edge anteriormente proposta não foi criada e seu código/configuração foram removidos; não há requisito de conta Supabase separada. O piloto adicional do handler foi encerrado em `OWNER_PREPARATION_TIMEOUT` antes de qualquer inserção: zero jobs observados, nenhuma execução/GET nativo ou teste adicional de preservação. A ativação e a cadeia remota de cron/callback dependem da publicação e da verificação conectada posterior. A situação detalhada consta em [revisao-midia.md](revisao-midia.md).

Os testes isolados do Pillow usaram Python 3.9 / Pillow 11.3.0; a retomada de manutenção conectada usou Python 3.13.12 / Pillow 11.3.0 / libwebp 1.5.0, conforme o recibo de execução. A API de orientação é documentada oficialmente em [ImageOps.exif_transpose](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html#PIL.ImageOps.exif_transpose). Versões do runtime e do processador precisam permanecer registradas ao executar lotes; trocar o runtime exige revalidar a determinismo dos derivados, sem sobrescrever objetos já confirmados.

## Conciliação preventiva

`reconcile-files.mjs` trata nome exato em pasta como candidato, nunca como fotografia confirmada. `prepare-files.mjs` e `prepare-file-links.mjs` não distribuem fotos de uma pasta compartilhada a todos os seus locais ou documentos; a proteção também vale para staging antigo. Nenhum vínculo histórico existente foi removido automaticamente por esta correção prospectiva.

## Validação executada

- Runner completo em PostgreSQL 17.10 isolado, com 79 migrações e replay sem reaplicações: 34 cenários Node e verificações SQL/concorrência aprovados. Inclui 212 asserções de mídia e 18 de marca no mesmo banco.
- Transição 78→79 e contrato do endpoint exato verificados sem tráfego externo. Tickets de uso único, expiração, concorrência, autorização, leases e preservação dos registros foram exercitados; a fronteira HTTP/pg_net é sintética na suíte SQL e não comprova o runtime publicado.
- Três testes Python com imagens artificiais somente em memória: horizontal, vertical, panorâmica, pequena, transparência, EXIF, preservação do original e rejeição de HTML, corrupção e MIME/hash divergentes.
- Dezoito testes do processador Start e handler: autenticação antecipada, limites antes da leitura, validação dos bytes, falha localizada e persistência privada. Typecheck e build aprovados; implementação privada ausente dos chunks públicos auditados.
- A validação final consolidada registra 177 testes NR, 42 testes Node sem skips e 306 verificações de interface, incluindo 24 de mídia e dez de edição de fotos. O planejador de conciliação continua sem distribuir pasta compartilhada indevidamente a locais.

A observação de uma galeria real, com frontend local e serviços privados conectados, confirmou três WebP de 384 px e nenhum original antes da ampliação. Foram 81.368 bytes de imagens na abertura; o JPEG original foi solicitado somente na ampliação. Tempos, transferência e limites dessa única amostra estão no [recibo da galeria](evidencias/upgrade-visual/media-review/gallery-observed.json); não são benchmark de produção nem medição do novo worker automático. Os recibos de recuperação por arquivo permanecem independentes do build e desses testes. Veja [validação final](validacao-upgrade-visual.md) e [revisão de mídia](revisao-midia.md).

## Estado da origem nesta rodada

Os 245 originais da aplicação de origem e suas 245 miniaturas foram recuperados e verificados integralmente no staging protegido: 23.519.752 bytes de originais e 4.076.403 bytes de miniaturas. Os 490 caminhos correspondem diretamente a todas as referências esperadas do snapshot, sem caminho faltante nem conciliação por basename. São 245 ativos fotográficos e 322 ocorrências, com duas representações por ativo; não são 490 fotografias distintas. A confirmação individual de upload e GET privado na Nexus está comprovada abaixo.

O pacote autêntico do artefato foi localizado a partir de um relatório já existente na sessão proprietária do Perplexity. O relatório identifica o arquivo por 32.641.129 bytes e SHA-256 `0e984002ed901a8f2c0595ae25b11220dd713f2bb1b6f2ad7f14dc8e63b05d1f`. A cópia autorizada do LOTE 2 no Google Drive contém esse mesmo binário, armazenado numa entrada chamada `index.html`, cujo conteúdo real é ZIP. A assinatura ZIP, o tamanho e o SHA-256 coincidem. Seu conteúdo tem 526 arquivos, com 491 entradas em `fotos/`: os 245 originais, 245 miniaturas e um mapa JSON. Cada imagem foi extraída pela referência completa idêntica à do snapshot, decodificada como JPEG e validada por hash, tamanho e dimensões. Nenhum pixel, orientação ou byte do original foi transformado durante a aquisição.

A recuperação anterior pelo Chrome nativo havia produzido oito miniaturas e um original. A biblioteca de Fontes da conta proprietária também permitiu recuperar um pacote do projeto contendo 76 originais e 76 miniaturas COTRIROSA. Todos esses arquivos são byte a byte idênticos às mesmas entradas do pacote completo. As observações anteriores permanecem nos recibos individuais, como provas independentes; não foram substituídas por inferências.

O acesso direto ao vínculo de original na prévia havia respondido para reabrir o aplicativo pelo Perplexity, inclusive na conta proprietária. Esse limite da prévia foi superado pela cópia autêntica já existente do pacote, sem alterar autenticação, permissões, cookies ou cabeçalhos. Os pacotes separados de servidor/dados não continham os arquivos fotográficos; arquivos Camera encontrados em outro diretório ficaram como candidatos enquanto não existia prova do caminho solicitado. O pacote completo tornou desnecessária essa conciliação, pois contém exatamente todos os caminhos originais. Código recebido da origem não foi executado.

A conferência do arquivo de dados baixado pela interface proprietária também confirmou que os arrays completos de fotografias dos 112 locais, incluindo suas 322 ocorrências, permanecem iguais aos do snapshot usado na migração. Os hashes de ambos os arquivos e o hash canônico dessa comparação estão protegidos fora do Git. O histórico e os IDs canônicos existentes foram preservados.

Os 245 originais e 245 miniaturas de origem foram transferidos e confirmados na Nexus: 490 destinos, 27.596.155 bytes, GET privado integral com SHA-256, MIME e tamanho conferidos. O recibo canônico coincide com os destinos preparados, com zero erros, divergências ou itens inacabados. Um HTTP 520 transitório na primeira tentativa foi retomado sem sobrescrever objetos; ambas as partes concluíram com exit 0. Os oito arquivos já conciliados foram reutilizados, sem mudança de ID.

O conector confirmou 322 ocorrências com original e miniatura verificados, preservando legenda, categoria, data, autoria, ordem, referências e contexto de cada ocorrência. As quinze ocorrências anteriores receberam somente o ID de original e um recibo de complementação pela função versionada da migração 0057; todos os seus campos históricos e a evidência anterior permaneceram iguais. O inventário individual protegido contém os 245 ativos, os 490 IDs de arquivo e as 322 associações. Não houve divergência de cliente, unidade ou referência. O bucket continua privado e os comandos de manutenção não são concedidos ao browser.

As 1.114 representações anteriores têm recibo terminal separado de GET e 52.513.516 bytes verificados. Os originais próprios recuperados geraram mais 490 derivados, com 27.312.332 bytes: todos foram verificados novamente por GET privado integral, SHA, MIME, tamanho, decodificação WebP e dimensões, em uma execução independente com exit 0 e zero erros. Seu hash canônico coincide com os 490 destinos esperados. Um lease interrompido pelo descarte do ambiente temporário foi retomado pelo contrato existente, sem UPDATE manual ou substituição de bytes. A retomada sequencial de 268 trabalhos terminou com zero falhas; o recibo final cobre também os 222 anteriores. As métricas medem somente essa retomada: 587,713 s de sessão, 560,537 s de execução dos workers e pico de RSS de 52.456 KiB; o período anterior perdeu os arquivos temporários de medição e não tem métrica de memória recuperável. O executor observou cgroup sem limite exposto, cerca de 21,14 GB totais em /tmp, bucket limitado a 50 MiB por arquivo e cota total de Storage indisponível. Esses números são do pipeline de manutenção e não medem a latência da galeria. Os recibos agregados estão em `evidencias/fotos-miniaturas-2026-10-31.json`; referências individuais, bytes, evidência de aquisição e checkpoints permanecem protegidos fora do Git.
