# Evidências privadas de Levantamentos Técnicos

Contrato do próximo fluxo vertical, em validação. `0021_levantamentos_tecnicos.sql` é a migração preparada pelo domínio; aplicação compartilhada e resultados executados pertencem ao registro geral de migrações/validação. A existência dos arquivos descritos aqui não comprova upload HTTP no ambiente conectado.

## Identidade e autorização

`levantamento_arquivos` possui organização, levantamento, revisão e ponto opcional, com FKs compostas. Ponto nulo representa uma referência geral da revisão; uma foto de ponto conserva o ID daquele ponto/revisão. Não há vínculo genérico por texto `tipo + id`. O mesmo conteúdo em dois pontos conserva associações próprias. Uma revisão nova não copia evidências para simular nova coleta.

O leitor `lev_ler` aplica a organização e o escopo do responsável/coordenação. A equipe de campo autorizada coleta no levantamento atribuído; outra pessoa de campo ou organização não herda acesso ao arquivo por conhecer seu ID, caminho ou hash. Engenharia/coordenação conservam as capacidades definidas no domínio, sem transformar qualificação em papel de usuário.

Upload é aceito apenas na revisão atual editável (`rascunho`, `programado`, `em_coleta`). Submissão exige resolver os envios pendentes. Foto obrigatória exige imagem confirmada do ponto exato; um PDF não satisfaz essa exigência. Upload/confirmar arquivo atualizam a revisão e o histórico, preservando a versão de edição e as medições do ponto.

## Protocolo

1. `prepararArquivoLevantamento` autoriza o levantamento e sua revisão antes de chamar `lev_preparar_arquivo`. A chave UUID corresponde ao payload completo; retries idênticos preservam identidade e payload divergente conflita.
2. O endpoint relê o estado atual do metadado, pois o recibo do staging conserva seu estado original. `lev_pode_enviar_arquivo` autoriza o autor e o destino atual antes de assinar upload sem upsert.
3. Após o envio ao bucket privado `nexus-operacional`, `confirmarArquivoLevantamento` revalida RLS, baixa os bytes com service role carregada somente no servidor e verifica assinatura de formato, tamanho e SHA-256 pelo validador compartilhado.
4. O acesso é revalidado após a leitura do binário. `lev_confirmar_arquivo`, restrita a service role, trava autorização e pai, confere novamente autor/hash/estado/Storage e confirma uma única vez. Nenhum endpoint aceita declaração do browser como prova de armazenamento.
5. `baixarArquivoLevantamento` autoriza o metadado/pai atual e assina URL por 60 segundos. Não expõe bucket público e não guarda a URL em cache persistido.

Limite inicial: 20 MiB, PDF/PNG/JPEG/WebP. Assinatura de formato e hash não equivalem a análise de conteúdo, OCR, verificação antimalware ou validação técnica de uma imagem. Não há conversão automática de HEIC, compressão que substitua o original ou suporte offline completo.

## Recuperação e uso da interface

`LevantamentoFiles` recebe `org`, `levantamentoId`, `revisaoId`, `pontoId` e `readOnly`. O editor deve montar o componente no contexto do ponto selecionado, preferencialmente com `key` composta por revisão/ponto. Ponto nulo abre referências gerais. A lista pagina 25 registros no servidor e diferencia carregamento, vazio e erro recuperável.

Foto/captura e arquivo comum usam o mesmo protocolo. A interface só anuncia confirmação após o retorno do servidor. Se a resposta do upload se perder, uma reverificação pode confirmar o objeto existente; se não terminou, retomar exige os mesmos bytes, tipo e tamanho. Cancelar envio pendente exige motivo, preserva histórico e encerra a intenção em memória para permitir outro envio dos mesmos bytes. Arquivos confirmados não são substituídos ou cancelados.

As query keys começam com `['levantamento-arquivos', org, revisaoId, pontoId]`; mutações invalidam esse recorte e `['levantamentos', org]`. Troca de ponto não reaproveita uma query de outro pai. Alterações de sessão/organização precisam do descarte de caches sensíveis já implementado no gate geral.

Credencial de serviço ausente gera mensagem específica de confirmação indisponível; o cadastro de pontos e medidas permanece disponível. Tokens previamente assinados podem deixar objeto órfão após cancelamento/revogação, mas não conferem autorização para confirmar ou aprovar. Limpeza física com retenção/janela segura continua pendente. URLs de download já emitidas podem funcionar até expirar.

## Evidência e limites

- `tests/levantamento-arquivos.test.ts`: testes unitários de identidade da intenção após falha/retry/cancelamento e separação entre destinos/conteúdos. Não demonstram SQL ou Storage real.
- `tests/operacao-files.test.ts`: o validador compartilhado confere bytes/MIME/hash e rejeita divergências.
- `tests/db/levantamento-arquivos.sql`: 28 assertions passaram em PostgreSQL descartável, na instalação completa de 40 migrações e em execução focada, com staging, falha/retry, associação correta, acesso cruzado, revogação/reatribuição do autor, imutabilidade e manifesto aprovado. Contém apenas metadados de Storage; não comprova binário por HTTP.
- `tests/ui/levantamentos-server.ts`: fixture sintética confinada ao laboratório, com dois pontos, duas medidas e estados recuperáveis. Não comprova persistência após recarga no backend nem autenticação do usuário real.

Rodada local executada: `npx vitest run tests/levantamentos.test.ts tests/levantamento-arquivos.test.ts tests/operacao-files.test.ts` passou 18 testes (11 de domínio/contratos, 3 de intenção de upload e 4 do validador compartilhado). Eslint dos novos arquivos de upload, adaptador e script de UI passou. O teste de intenção inclui staging confirmado cuja resposta se perdeu antes de conhecer o ID, seguido de cancelamento e novo envio dos mesmos bytes.

O script `tests/ui/levantamentos-quality.mjs` passou dez verificações comportamentais e 30 estados de layout (lista/cadastro/coleta/ponto/medida em 360, 390, 768, 1024, 1366 e 1440 CSS px), sem overflow de página nem erro JavaScript observado. Os casos incluem arquivo pendente/reverificação/cancelamento/nova intenção e refetch por foco durante edição: o servidor da fixture avança para V2, mas o formulário conserva `expected_version=1` e recebe conflito com o texto local intacto. O relatório fica em `evidencias/ui-levantamentos/levantamentos/results.json`.

A inspeção visual inicial apontou excesso de contexto antes dos pontos na primeira tela móvel; `coleta-prerefinamento-390.png` preserva essa referência. O refinamento recolhe o contexto no celular e foca/rola até o painel selecionado; `coleta-390.png` mostra ponto, medida e evidências na viewport após seleção. Esse alcance não certifica acessibilidade completa ou dispositivo físico.

A homologação exige upload/retomada/download por HTTP com backend autorizado, falha real de rede, dois perfis/tenants e associação das evidências após recarga. Nenhuma fixture deve ser inserida no banco operacional para produzir essa prova. Leitura/OCR/PDF e integração externa não são anunciados como executados pelo fluxo de arquivos.
