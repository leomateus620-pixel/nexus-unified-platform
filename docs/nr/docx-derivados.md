# Conversão dos originais DOCX

`scripts/nr/convert-docx.mts` executa o mesmo conversor puro da aplicação sobre os bytes preservados. A saída fica no diretório privado, fora do Git: um JSON de conteúdo por arquivo, imagens extraídas, avisos, índice, checksums e resumo. `verify-docx-text.py` faz a comparação independente dos nós textuais do corpo OOXML com parágrafos/títulos/tabelas nativos, excluindo mensagens de referência geradas e normalizando espaços. Nenhum desses scripts escreve no banco ou contata serviços.

Na captura verificada, os 233 DOCX passaram pelo conversor `nr-docx-1.0.1`, sem falhas. Foram produzidos 4.073 blocos, 506 tabelas e 42.981 células. A comparação independente encontrou 233 sequências exatas de texto de corpo: 2.208.222 caracteres normalizados, sem ausência ou duplicação. O teste identificou e permitiu corrigir duplicação de caixas de texto dentro de células antes da persistência de derivados.

Há 605 extrações raster, correspondentes a 417 objetos físicos únicos por contexto, totalizando 59.629.408 bytes. A mesma imagem pode ser usada em vários documentos mediante vínculos explícitos. Um EMF permanece como referência no DOCX preservado; não foi convertido em uma imagem inventada.

Essa comparação textual não prova equivalência visual. Mesclas de células, posicionamento de imagens, tipografia, quebras, cabeçalhos, rodapés, campos Word, comentários e assinaturas têm limitações explícitas. Texto OfficeMath é preservado, mas a notação de expoentes, índices e operadores é linearizada e exige conferência no original antes de uso técnico. Cada derivado conserva seus avisos, e a interface permite baixar seu DOCX original com autorização revalidada.

## Persistência separada e rastreável

O de-para privado confirma 65 DOCX associados a documentos/revisões explícitos e 168 recebidos associados somente a local. Os 233 derivados usam identidades próprias; nenhum dos 736 documentos históricos é substituído ou editado por essa conversão. Nos 168 sem documento lógico de origem, somente arquivo/local comprovados são relacionados. Nome e TAG não criam associações.

`prepare-docx-derived.mjs` produz dois planos privados. Primeiro prepara imagens derivadas por organização/unidade/hash e preserva a cadeia de extração DOCX→parte OOXML→bytes. O executor transfere e confirma essas imagens pelo mesmo acervo privado. Somente imagens com UUID, contexto, MIME, tamanho, SHA-256 e estado confirmado compatíveis entram no plano documental.

Depois, o plano cria documentos nativos em rascunho pelo importador `0040`. A identidade externa combina unidade de origem, ID Drive e versão do conversor; hash e UUID físico do original entram no payload/snapshot. Mudança de bytes não cria outro documento lógico nessa identidade. A comparação em três vias preserva alterações posteriores do usuário e expõe conflito quando origem e Nexus evoluíram.

`compile-docx-derived.mjs` gera envelopes DML privados para o executor autorizado via Lovable. Não executa SQL. Cada envelope bloqueia os arquivos em ordem estável, revalida original/imagens e comprova a relação arquivo→documento/revisão e ID externo de origem. Conteúdo, contexto, relações e provas precisam coincidir com o payload hashado. A importação e seus vínculos confirmam na mesma transação; erro/conflito não cria vínculos posteriores.

Vínculos usam a revisão registrada no snapshot de importação em `nr_fontes`, conservando a decisão quando o usuário já criou uma revisão posterior. Há referência documental derivado→original apenas nos 65 casos explicitamente conciliados. Os demais conservam a origem física sem fabricar documento histórico. Não são criadas emissão, assinatura, aprovação ou conta Auth.

## Provas e limites de conclusão

O teste SQL isolado `tests/db/nr-docx-derived.mjs` verifica 17 condições com rollback integral: origem emitida intacta, derivado separado, recebimento sem documento fictício, imagens confirmadas obrigatórias, de-para externo, repetição, revisão posterior e conflito em três vias. Os testes de planos usam 233 fixtures sintéticas e adulterações negativas; não escrevem em produção.

O relatório [de conversão local](evidencias/docx-conversao-local.json) prova essa fase, separada da transferência e da persistência. A [leitura real das imagens](evidencias/docx-images-storage-confirmed.json) confirma os 417 objetos e 59.629.408 bytes no Storage e no banco. A [leitura dos derivados persistidos](evidencias/docx-derived-production.json) confirma 233 UUIDs distintos em rascunho, com 4.073 blocos nativos, após 80 lotes transacionais. Os 736 documentos de origem permanecem preservados; o total é de 969 documentos lógicos. Os 605 originais e as 417 imagens somam 1.022 objetos confirmados, sem incluir históricos indisponíveis ou fotos próprias da origem ainda não obtidas.
