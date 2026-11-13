# Inspeções: acesso, manutenção e restauração do acervo

## Acesso e emissão

A base é a PR #26 (`ccc4abee3ff529088b990f31de593c52f6ae88af`). A migração distingue administração da organização de atribuição técnica. Um administrador da Nexus acessa os oito contextos privados e pode manter cadastros, acervo, atribuições e rascunhos de contrato. A opção **Visualização TST** mantém a sessão e o contexto; só permite coleta operacional quando há atribuição TST válida para o contexto. Uma atribuição EST válida habilita o fluxo técnico existente, incluindo aprovação e emissão após as respectivas validações.

A consulta pública do [CREA-RS](https://servicos.crea-rs.org.br/ServicosPrd/servlet/com.servicos.srv.wbpsrvprofissionalres) confirmou o título e a instituição da qualificação de Diego. A [súmula da CEEST](https://saturno.crea-rs.org.br/sumulas/segtrabalho/2023/Sumula_CEEST_234_18_12_23.pdf) registra a data de conclusão. No projeto Nexus, o conector Lovable atualizou o registro profissional e preparou a qualificação em estado **Enviada**, com um PDF de evidência em Storage privado e recibo de preparação delegada. O documento é informativo e não substitui certidão ou conferência profissional. A aplicação exige que outro membro autorizado de Engenharia confira em **Equipe → Qualificações**. Após validação, a administração pode registrar a designação EST em **Inspeções → Clientes → Acessos de Inspeções**. Essa designação não autoriza laudos fora da habilitação profissional aplicável. Nenhuma emissão real foi executada.

## Restauração

O pacote inicial continuou sendo a versão histórica; ele não foi reimportado. Na sessão proprietária do Perplexity, uma exportação privada trouxe 18 candidatos a originais. Os 18 corresponderam aos MD5 da origem. Um já constava como verificado; os 17 restantes foram transferidos com os IDs e vínculos existentes. Os três PDFs acima de 50 MiB foram enviados pelo protocolo TUS, com blocos de 6 MiB. Cada um dos 17 foi relido e comparado por MD5, SHA-256, MIME e tamanho antes de receber o estado de verificado. O arquivo extra identificado como contido no laudo de origem não tem MD5 próprio no snapshot; não recebeu vínculo independente.

Seis fotos e quatro anexos adicionais do pacote recuperado coincidiram com os bytes já importados. As fotos preservam os vínculos e as duas representações WebP. Evidência inserida nos próprios laudos continua visível no PDF; não foram inventados vínculos de galeria a partir de nomes de arquivos ou similaridade. O bucket permanece privado e as autorizações transitórias foram revogadas.

O [recibo agregado](evidencias/restauracao-2026-11-13.json) registra **18 originais disponíveis, zero pendentes, 39 vínculos verificados e 51 objetos privados**. As migrações 0076 a 0079 foram executadas pelo conector Lovable e os checksums foram conferidos na posição 103 do ledger. Os [tipos](evidencias/geracao-tipos-103.json) foram gerados a partir de uma instalação PostgreSQL 17.11 do mesmo manifesto.

## Manutenção

- Cadastro, edição e contatos reutilizam o cadastro canônico. Incluir uma unidade em Inspeções exige ação explícita e não altera o escopo NR33/NR35.
- Documentos, anexos e fotos usam reserva, verificação do original, download privado e histórico. O PDF.js usa leitura integral com hash para arquivos de até 20 MiB e intervalos autenticados para originais históricos maiores. Se a leitura parcial falhar, o original continua disponível para download. DOCX pode ser baixado; o PDF anexado separadamente pode ser consultado no leitor.
- Correções de identificação e apresentação de fotos são revisões separadas do snapshot. Histórico exibe autor, data, motivo e alterações. Fluxos existentes de levantamento, ensaio, emissão e contratos preservam suas regras.
- A prévia e a miniatura das fotos novas são verificadas antes de aparecer. Uma falha de processamento conserva o original e permite repetir a geração.

## Validação

O [relatório do Chromium](evidencias/manutencao/validacao.json) cobre cinco larguras e oito jornadas isoladas, incluindo a troca EST/TST, cadastro, ativação explícita, contrato, correção com recuperação de erro, leitura e download. O PDF de teste de 91 MiB exibiu duas páginas com 512 KiB transferidos. As oito jornadas do leitor compartilhado também passaram. A execução conectada confirmou a autorização de consulta para a identidade administrativa do Diego, os 18 laudos e a leitura de metadados protegidos sob RLS. Essa verificação do banco não substitui a abertura da interface publicada com a nova revisão.

Os testes PostgreSQL cobriram 91 verificações de acervo, RLS e revisão, incluindo emissão sintética com atribuição técnica válida, além de importação, R64, contratos, cadastro, manutenção, anexos e originais extensos. Typecheck, build, lint focado e suítes relevantes passaram. O lint geral ainda aponta dívida em arquivos fora da mudança. Dados e comprovantes privados ficaram fora do Git.

A mudança do frontend segue em PR; sincronização e publicação são etapas distintas.
