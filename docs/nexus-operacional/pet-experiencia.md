# PET — preparação, operação e consulta

A experiência da PET dentro da OS adota Saira/Barlow e esmeralda sobre grafite ou branco esverdeado. A preferência começa em noite e pertence à organização e ao usuário. Os tokens ficam no conteúdo da PET e em seus portais; a navegação e a Agenda mantêm suas próprias aparências.

## Diagnóstico e decisões

As capturas iniciais do laboratório SQL mostravam contexto herdado como campos desabilitados, instruções repetidas, seis etapas misturando preenchimento e operação e uma lateral que tinha comportamento inverso em celular e desktop. O acompanhamento acumulava presença, encerramento e documentos na mesma superfície. A listagem filtrava a OS e a busca depois do limite global de 50 PETs. O renderizador PDF anterior não tinha versão de apresentação explícita.

A composição agora usa fases de apresentação; os estados documentais e operacionais continuam canônicos, sem novos estados de banco:

- **Preparar:** contexto, equipe, segurança e atmosfera/procedimentos. Contexto herdado é leitura; seletores pesquisam nomes reais. Cada perigo conserva medida e evidência ao lado. EPC/EPI mostram contagem de respostas sem supor segurança; justificativas aparecem conforme a resposta e o procedimento.
- **Conferir:** preenchimento, revisão, assinaturas e emissão são distintos. Pendências estruturadas levam à etapa e ao campo; códigos desconhecidos ficam na conferência. Ações só aparecem nos estados compatíveis. Certificação sem provedor permanece bloqueada.
- **Operar:** pessoas presentes e saída factual lideram a tela. Expiração/interrupção preservam a saída. Avaliações usam os agentes e unidades da versão aprovada; responsável vem das funções admitidas na PET. Continuidade certificada permanece indisponível.
- **Encerrar:** a etapa recupera a revisão final persistida, sem gerar revisão na abertura. Presença aberta direciona à operação. Término operacional e conclusão documental são separados; a confirmação definitiva vem do servidor. Trocar de fase preserva texto local. Se outra sessão finalizar, a consulta mostra o estado do servidor e permite comparar/descartar o preenchimento local não enviado.
- **Consultar:** encerrada abre em leitura com tempos oficiais, equipe histórica, condições, avaliações, documentos e auditoria. Cancelada tem apresentação própria. Rascunhos podem ser cancelados com motivo e confirmação por quem tem a capacidade canônica de gerir operação.

## Contratos e preservação

`PetWorkspace` coordena as fases; `PetEditor`/`preparation-domain` cuidam do preenchimento, `PetOperations` da operação, `PetEncerramento` do fechamento e `PetResumo` da leitura. `PetAppearance`, `PetPicker` e os CSS da feature fornecem a apresentação. `ExecucaoWorkspace` limita o novo visual aos cards/seção/criação de PET.

O payload conserva propriedades desconhecidas do conteúdo e dos procedimentos, justificativas ocultas, IDs canônicos, evidências e o instante exato da validade quando seu campo não mudou. Não há cadastro paralelo de pessoas. `expected_version` continua obrigatório nos atos existentes. Intenções pendentes conservam a chave mesmo entre comandos diferentes; horário/versão de saída permanecem fixados no retry. Erro de rede não anuncia sucesso.

A migração incremental `0037_pet_listagem.sql` mantém a assinatura, ACL e coleção de OS de `pet_listar`. Organização, autorização, OS, unidade e busca literal entram antes da página; a contagem vem da mesma CTE autorizada. `%` e `_` são literais. Página começa em zero; limite padrão legado é 50, a interface pede 20. Nenhuma coluna ou registro de PET foi removido. Busca/página/aba/rolagem da OS são estado local de sessão por organização/usuário/OS; o retorno sempre consulta novamente o servidor. Contagens parciais foram retiradas dos cards de OS.

Migração aplicada diretamente pelo conector Lovable, sem chat, e verificada no ledger remoto: posição **56**, SHA-256 `1d34f65a9cb1b4ad6383c96e06ae9f4192c3f8ebe5f9df4d7a5dd88e8e2f1e44`. Smoke SQL autorizado retornou `total: 0`, `pagina: 0`, `limite: 1`, sem criar dados no servidor.

## PDF derivado V2

`pdf.ts` continua sendo V1, sem alteração. `pdf-v2.ts` usa pdf-lib/fontkit com Saira/Barlow locais sob OFL, A4 claro, síntese inicial, tabelas com cabeçalho repetido, fotos e auditoria. O relatório continua explicitamente derivado; não substitui originais certificados.

O input opcional `render_versao` aceita 1/2; omissão conserva V1. A interface fixa V2, chave e versão operacional na tentativa. V2 deriva uma chave efetiva determinística por formato + chave original, sem incluir a versão operacional. Replays legados conservam a chave V1. Arquivo arquivado é baixado e verificado pelos mesmos bytes; nenhum renderizador é chamado para substituí-lo. Snapshot, imagens e formato idênticos produzem bytes idênticos.

## Validação e reprodução

- `node node_modules/typescript/bin/tsc --noEmit`.
- `node node_modules/vite/bin/vite.js build` (o preparo de assets também foi executado).
- `node node_modules/vitest/vitest.mjs run --config tests/vitest.pet.config.ts`: 74 testes em 14 arquivos.
- Manifesto e contratos de tipos: 12 testes; guardas de contratos operacionais: 134 arquivos protegidos sem mudança inesperada.
- `tests/db/run.sh`: instalação e upgrade de 56 migrações e todos os cenários passaram em PostgreSQL descartável. PET: 45 asserções de ciclo, 20 de retificação, 19 de relatório; nova listagem: 20 verificações com 136 PETs, além de busca, paginação, acesso parcial, revogação e isolamento.
- `tests/pet-ui/pet-experience.spec.mjs`: 11 grupos de comportamento com componentes reais e SQL local, incluindo persistência, duplo acionamento, rede, resposta perdida, conflito e retorno à OS com rolagem exata.
- `tests/ui/pet-preparation-quality.mjs`: preparação/conferência nos dois modos e larguras 360, 390, 430, 768, 1366 e 1920; fontes locais, campos >=16px e controles >=44px.
- `tests/ui/pet-experience-quality.mjs`: 100 layouts e 7 grupos de comportamento de operação, validade, encerramento e consulta com fixtures de apresentação isoladas. `tests/ui/pet-cancel-quality.mjs` acrescenta 4 regressões de cancelamento/finalização concorrente; `pet-list-state-quality.mjs` acrescenta 3 de retorno/página obsoleta.
- PDF V2: 11 páginas renderizadas e inspecionadas, texto longo, fotos, cabeçalhos e limites. Golden do V1 preservado e retries V1/V2 cobertos.

Os laboratórios estão em `tests/pet-ui`. O SQL usa banco descartável em loopback e nunca lê a conexão cloud. Para a matriz de preparação, informe `NEXUS_PET_ID` a partir da saída de `PGTEST_EPHEMERAL=1 node tests/pet-ui/seed.mjs`. Os scripts de navegador aceitam `NEXUS_UI_BROWSER_EXECUTABLE`; as capturas registradas usaram Chrome instalado, fuso do dispositivo Asia/Tokyo e movimento reduzido. O ambiente precisa de Node, PostgreSQL e cliente psql conforme o runner.

Capturas e relatórios estão em `docs/nexus-operacional/evidencias/pet-experiencia-2026-10-30/` e `docs/nexus-operacional/pet/evidencias/experiencia-2026-10-30/estados/`. O relatório de design está em `design-qa.md`.

## Limites verificados

O navegador do laboratório usa roteador/autenticação controlados; seu `useBlocker` é um stub. A confirmação de descarte ao sair da rota permanece no componente de produção, mas não foi exercitada com o roteador real nesses testes. Abertura/fechamento de diálogos, foco, seletores e recuperação foram exercitados no navegador.

Não houve teste em iPhone físico, VoiceOver, teclado virtual real, Auth/Storage HTTP privado ou provedor certificado. As fixtures de PET emitida/encerrada são exclusivamente de apresentação; os testes SQL de certificação usam double explícito. Não se afirma emissão certificada real. A integração com provedor e o aditamento certificado continuam fora desta entrega. Um erro de consulta continua sendo erro, sem valores fictícios ou zero fabricado.

Lint final: o escopo alterado terminou sem erros, com um aviso preexistente de Fast Refresh em `PetDocumentos.tsx` (helper compartilhado com contingência). A execução de `eslint src scripts tests --format json` encontrou 156 erros e 25 avisos em 28 arquivos; nenhum erro em arquivo alterado. Esses achados globais preexistentes não foram tratados nesta entrega. O lint integral incluindo assets gerados não é usado como evidência de aprovação.
