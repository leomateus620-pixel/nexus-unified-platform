# Evidências privadas de estudos técnicos

Os arquivos de um estudo pertencem a uma revisão específica e, opcionalmente, a um perigo dessa mesma revisão. `estudo_arquivos` é a identidade canônica; as FKs compostas garantem organização, estudo, revisão e perigo coerentes. Não há vínculo genérico por texto e ID, nem cópia de binários dos Projetos de Engenharia ou de documentos emitidos.

## Fluxo implementado

`EstudoFiles` permite adicionar foto ou PDF/imagem, consultar envios, retomar o mesmo original, reverificar um envio interrompido e cancelar uma pendência com motivo. Arquivos confirmados oferecem download autorizado e SHA-256 do original. A lista consulta até25 registros por página, filtrada pela revisão e perigo selecionados; falha de consulta é recuperável e oculta metadados privados de uma resposta anterior em cache.

Os endpoints em `est-arquivos.functions.ts` usam autenticação existente e contratos Zod. Antes de preparar o envio, validam a leitura do estudo e o pertencimento da revisão/perigo. O banco exige revisão atual em elaboração e autorização por todas as fontes operacionais históricas, inclusive fontes desativadas. Cadastrar o estudo ou vincular uma fonte não concede acesso adicional a essa fonte.

1. Staging registra metadados com chave idempotente e caminho opaco no bucket privado existente `nexus-operacional`.
2. O upload assinado não permite sobrescrita. São aceitos PDF, PNG, JPEG ou WebP de até20MiB; tipo declarado não substitui a assinatura binária.
3. O servidor autoriza pelo usuário antes de carregar o cliente privilegiado. Baixa os bytes com a credencial de serviço e verifica tamanho, assinatura MIME e SHA-256 usando o validador comum da operação.
4. Depois de verificar os bytes, reconsulta a autorização atual. A confirmação SQL exclusiva do serviço recebe o autor autenticado e revalida organização, papéis, pessoa, estado e acesso às fontes depois dos locks, inclusive em retries de um arquivo já vinculado.
5. Uma consulta autorizada final retorna o estado confirmado. O browser não declara sucesso por concluir somente o upload ou por vencer um horário.

`est_preparar_arquivo`, `est_pode_enviar_arquivo`, `est_confirmar_arquivo` e `est_cancelar_arquivo` pertencem ao domínio SQL da migração0022. `est_ler_arquivo` recebe o ID do arquivo e aplica a leitura pelo estudo inteiro. O download usa o cliente autenticado e as políticas Storage atuais, com URL de60 segundos. Uma URL já emitida permanece utilizável até expirar; novas tentativas revalidam acesso.

## Recuperação e concorrência

Retry de uma intenção preserva sua chave e o recibo, sem duplicar arquivo. O adaptador sempre relê a linha atual após um recibo antigo de staging: se outro retry já confirmou o original, não solicita outro token. Após cancelamento confirmado, a intenção em memória é encerrada e um novo envio dos mesmos bytes recebe nova chave; isso também funciona quando a resposta inicial se perdeu antes de o browser conhecer o ID.

Falha na resposta do upload dispara uma tentativa de confirmação do objeto possivelmente já recebido. Se os bytes não estiverem disponíveis, a pendência continua consultável e pode ser retomada com o mesmo original. Conteúdo divergente exige cancelar a tentativa anterior. Ausência da credencial de serviço produz uma dependência explícita somente no envio/confirmação; leitura, edição do estudo e download autorizado de originais já confirmados não dependem dela.

Novo staging, confirmação ou cancelamento incrementa a versão da revisão uma única vez e atualiza o estudo sob lock; retries não repetem o efeito. A versão do perigo não muda por um evento de arquivo. Pendências bloqueiam submissão; o manifesto da submissão inclui somente originais confirmados. Metadados e binários vinculados são imutáveis. Nova revisão preserva o histórico e não copia os arquivos nem reutiliza a identidade do perigo anterior.

## Evidências e limites

- `npx vitest run --config tests/vitest.estudo-arquivos.config.ts`:15 testes isolados de intenção e fronteira de servidor passaram. Cobrem perda de resposta, nova chave após cancelar (incluindo aliases de nome deduplicados), recibo desatualizado, IDs incompatíveis, autor forjado, integridade divergente, credencial ausente, paginação, URL curta e revogação antes/depois de baixar os bytes. Os handlers são exercitados com fixtures; isso não comprova transporte HTTP, Auth real ou RLS.
- `tests/db/estudo-arquivos.sql` passou em execução focada no PostgreSQL descartável após aplicar as migrações reais. Usa somente fixtures locais em transação com rollback e metadados Storage. Cobre RLS, papéis/tenant, fonte histórica privada, confirmação exclusiva do serviço, idempotência, versão, imutabilidade e manifesto de revisão. A instalação/upgrade completo e as disputas reais são registrados separadamente pelo runner de banco.
- Upload/download com o serviço Storage conectado e sessão Auth real ainda precisam de E2E próprio. Um registro em `storage.objects` não é prova de armazenamento do binário.
- A assinatura MIME é uma checagem de formato, não antivírus, validação completa do documento, OCR ou análise técnica automatizada. Essas capacidades não são anunciadas pelo componente.
- Tokens de upload emitidos antes de um cancelamento podem deixar objeto órfão sem vínculo válido até vencerem; a política não o torna legível. A rotina de limpeza com retenção/staging em andamento continua uma pendência operacional comum.

Esta entrega implementa o fluxo de arquivos dos estudos. Ela não emite PDF, ART ou certificação técnica e não encerra o escopo integral de Engenharia ou da plataforma.
