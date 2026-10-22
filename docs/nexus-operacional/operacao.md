# Operação do checkpoint

Este guia cobre as jornadas disponíveis nesta branch e os limites verificados em 22/10/2026. Não representa homologação integral da plataforma. Migrações, ambientes e comandos executados são registrados em `migracoes.md` e `validacao.md`; escopo pendente permanece em `escopo.md` e `progresso.md`.

## Configuração inicial

1. Conferir projeto/repositório/banco antes de qualquer alteração compartilhada. A baseline reconciliada e `0012`–`0020` foram registradas no ambiente Lovable indicado em `migracoes.md`. Essas migrações já aplicadas não devem ser editadas; correções usam `0021+` no manifesto/ledger.
2. Configurar o runtime com a URL Supabase e as chaves previstas pelo projeto. `SUPABASE_SERVICE_ROLE_KEY` é exclusiva do servidor; jamais usar variável `VITE_*`, payload ou log para disponibilizá-la ao browser.
3. Vincular pessoas operacionais, contas existentes e papéis usando os controles administrativos. Uma pessoa pode existir antes do login; competência e treinamento não concedem papel de usuário.
4. Revisar o scheduler pelo resumo autorizado `consultar_jobs_operacionais`. A UI administrativa de jobs ainda está pendente. Não criar cron alternativo ou temporizador em uma aba para anunciar processamento automático.
5. Regenerar tipos Supabase pelo mecanismo do projeto/conector após a reconciliação e repetir typecheck. Essa geração não foi executada neste checkpoint; o arquivo gerado não foi corrigido manualmente.

`SUPABASE_URL` está cadastrada no `.env`, mas não estava exportada no processo PowerShell inspecionado. `SUPABASE_SERVICE_ROLE_KEY` não estava presente no arquivo nem no processo. Isso não prova ausência no runtime Lovable. Preparação/retomada de arquivos informa a dependência precisa de confirmação pelo servidor; edição documental e cadastros continuam disponíveis. Upload/download HTTP e confirmação de binário no ambiente conectado ainda requerem E2E autenticado.

A consulta de capacidades ao agente Lovable informou presença das variáveis no sandbox/dev, sem inspecionar o runtime publicado. Seu mecanismo `supabase--get_types` altera o arquivo gerado na branch conectada; por isso não foi acionado em paralelo com o Codex. O modo de planejamento também gerou metadados/atualizações automáticas de plataforma em `main`; esse comportamento está reconciliado e documentado em `progresso.md`. Não aprovar o plano auxiliar como se fosse a implementação desta PR.

## Uso diário disponível

Clientes permite buscar e paginar, abrir ficha, cadastrar/editar cliente, unidade e contato, arquivar/reativar e consultar histórico. Arquivamento conserva os registros anteriores e impede sua seleção ordinária em novos vínculos. Se outra sessão alterou o cadastro, compare e recarregue explicitamente antes de reenviar; não substitua a versão atual silenciosamente.

Pessoas mantém identidade operacional, função e vínculo opcional com usuário. A fonte é utilizada para responsáveis e ações. Equipes, competências e qualificações já têm contratos SQL, mas sua experiência completa de cadastro/conferência ainda precisa ser entregue e validada. O cadastro de pessoa não representa habilitação profissional ou autorização de serviço.

Ações permite criar responsabilidade/prazo, registrar execução e evidência, devolver e verificar segundo as regras configuradas. A tela atual não implementa o processo completo de ocorrência, investigação ou incidente. Não lançar detalhes médicos no cadastro geral de pessoa/ação para contornar uma função ausente.

Configurações permite vincular uma conta Auth já existente por seu identificador, conceder/remover papel, conceder coordenação e desligar o acesso com motivo. O último administrador é protegido no banco. Desligamento retira acesso e vínculo de login, preservando pessoa e autores históricos; trabalhos futuros continuam atribuídos e devem ser revisados pela coordenação. Não há envio de convite por e-mail configurado nesta entrega.

## Projetos de Engenharia

1. Criar projeto próprio com cliente, unidade ou descrição de local, responsável e primeira versão. Não é preciso inventar proposta comercial ou obra.
2. Editar seções e parâmetros, registrando fonte/unidade e se o valor é declarado, estimado, medido ou proposto. Salvar explicitamente; conteúdo não salvo é identificado e protegido contra descarte involuntário na navegação.
3. Enviar para revisão editorial interna. Devolver exige motivo; congelar fixa snapshot e hashes. Conferência editorial não equivale à aprovação técnica profissional.
4. Escolher a versão vigente explicitamente. Para evoluir uma versão congelada, criar nova versão com descrição da mudança; a anterior permanece consultável.
5. Experimentar em cenário separado de uma baseline congelada. Salvar/comparar, desfazer/refazer alterações locais e promover para nova versão ou descartar com motivo. Promoção não altera proposta, catálogo, mapa ou projeto operacional.
6. Exportar JSON autorizado para conservar o modelo/snapshot. O JSON não é PDF emitido, pacote de binários nem documento técnico aprovado.

PDFs/imagens originais são arquivos separados do modelo editável. Na versão em rascunho, enviar um arquivo de até 20 MiB; aguardar confirmação do servidor. O original é reencontrado e baixado por ação autorizada. Não interpretar o estado confirmado como leitura por IA/OCR: esse processamento ainda não existe. PDFs maiores não são reduzidos ou substituídos automaticamente.

## Recuperação de arquivos e edição

| Situação                          | Procedimento e estado esperado                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Resposta de upload perdida        | Usar Reverificar armazenamento; o servidor confere os bytes existentes antes de confirmar                                             |
| Upload não terminou               | Selecionar o mesmo original para retomar; tamanho, tipo e hash precisam corresponder                                                  |
| Arquivo incorreto ainda pendente  | Cancelar o envio com motivo; novo envio é outra intenção e recebe outra chave                                                         |
| Versão em revisão/congelada       | Não recebe novos originais; pendências devem ser resolvidas no rascunho antes da submissão                                            |
| Credencial de confirmação ausente | Configurar o runtime do servidor e repetir; não marcar o anexo como confirmado manualmente                                            |
| Falha/conflito ao salvar conteúdo | O preenchimento permanece; mensagem junto ao botão indica que o servidor não confirmou. Retentar ou consultar/comparar a versão atual |
| Navegador fechado abruptamente    | Não há fila offline completa ou garantia de recuperar edição ainda não salva; reencontrar o último rascunho confirmado no servidor    |

Arquivos confirmados não são substituídos. Correções exigem nova versão/referência. Download assinado expira em 60 segundos; uma URL já entregue pode continuar válida até esse prazo mesmo após revogação. Não compartilhar a URL como feed público.

Cancelamento e falhas podem deixar objetos pendentes/órfãos, sem acesso público ou vínculo falso. A limpeza automática com retenção ainda não está implementada; não apagar em massa objetos do bucket para resolver esse estado. A correção `0020` da revalidação privilegiada de anexos operacionais e arquivos PE, inclusive retries após esperas concorrentes, deve ser acompanhada em `migracoes.md`; não editar `0015`/`0017` já aplicadas.

## Almoxarifado e Ferramentas

1. Cadastrar o local de estoque. Configurar rastreabilidade seleciona o produto canônico e consulta sua política/versão antes de permitir alterações.
2. Conferir o recebimento de OC ou apontamento de produção existente, informando a unidade/fator de origem e classificando aceita, quarentena e rejeitada. Eventos antigos não viram saldo retroativo.
3. Reservar material para projeto ou OP, com responsável e validade. Retirar transfere para em poder; registrar consumo e devolver somente a sobra. A origem física permanece rastreável.
4. Transferir entre locais em um comando. Ajuste por inventário exige contagem, motivo e aprovação; se o saldo mudou após a contagem, refazer a conferência.
5. Ferramenta tem patrimônio próprio, reserva temporal, retirada e devolução com condição. Calibração depende de política técnica publicada e evidência privada conferida.
6. Conflito preserva o preenchimento. Consultar a versão atual, comparar e adotá-la explicitamente antes de confirmar outra tentativa. Negação de acesso fecha o editor e oculta dados antigos; erro de rede permite retentar.

Saldo e disponibilidade são calculados pelo banco; não corrigir por edição direta. Um material consumido não pode ser estornado como se ainda estivesse disponível. Compras independentes, OS, custo realizado e a Agenda consolidada ainda não estão conectados nesta fatia. Anexos pendentes podem ser retomados ou cancelados com motivo; novo envio após cancelamento recebe outra identidade.

## Jobs e integrações ainda abertas

O backend temporal possui worker/outbox e notificações internas, com deduplicação e estados de processamento. O projeto conectado registrou `pg_cron` ativo e uma execução com fila vazia. A UI Agenda Equipe, a criação/visualização completa de eventos e a jornada real de notificação permanecem pendentes. E-mail/WhatsApp/push, IA/OCR, integrações bancárias/fiscais e RDO externo não são anunciados como entregues.

Levantamentos, Estudos e Almoxarifado possuem fatias locais verificadas descritas em seus documentos; suas conexões posteriores e o E2E Auth/Storage HTTP conectado continuam pendentes. Faltam OS/horas/RDO, ativos, inspeções/ocorrências, manutenção, frota, financeiro, PDF/dossiê, editor geométrico de engenharia e recorrência. Consultar o quadro de aceite antes de usar uma fundação SQL como comprovação de módulo completo.
