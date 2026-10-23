# PET Digital Nexus — estado da entrega

Conferência em **23/10/2026**, na branch `codex/pet-digital-nexus`. A PET tem domínio próprio integrado à OS e à unidade, com preparação, conferência, presença/tempo, auditoria, documentos derivados e contingência. **A liberação operacional certificada permanece bloqueada:** o adaptador real do provedor de assinatura e o fluxo individual de signatário externo ainda não foram implementados/configurados.

## Código, implantação e validação

| Marco                               | Estado verificável                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código                              | Módulo `src/features/pet/`, rotas autenticadas próprias, recorte de OS, card de PETs, histórico da unidade e interface mobile/desktop implementados. O recorte da OS não constitui gestão integral de materiais, entrega ou RDO.                                                                                                                    |
| Migrações                           | `0030`–`0033` aditivas; manifesto completo com **52 migrações**, instalação limpa e atualização verificadas. Histórico publicado preservado.                                                                                                                                                                                                        |
| Banco conectado ao Lovable          | Ledger com **52 posições** conferido em 23/10/2026; **24 tabelas OS/PET com RLS**, sem DML direto para o navegador; callback sem execução por `anon`/`authenticated`; bucket `nexus-operacional` privado. A conferência encontrou **zero PETs e zero integrações de assinatura** no projeto. [Evidência remota](evidencias/remote-validation.json). |
| Tipos                               | Geração oficial `@supabase/postgres-meta` com 52 migrações: **141 tabelas, 237 funções, 4 enums**, diagnóstico TypeScript zero. [Registro](evidencias/typegen.json).                                                                                                                                                                                |
| Assinaturas                         | Contratos, intenções, conteúdo do ato, validações transacionais e callback privilegiado implementados. Adaptador HTTP do provedor, validação ICP-Brasil real e jornada restrita de pessoa sem login **pendentes**. Aceite em tela e teste simulado não são certificação.                                                                            |
| Emissão e encerramento certificados | Bloqueados sem assinaturas/originais verificáveis da versão e finalidade aplicáveis. Nenhum original certificado real foi produzido ou validado nesta entrega.                                                                                                                                                                                      |
| Prorrogação/aditamento              | Critérios normativos identificados; comando mantém **prorrogação bloqueada** até o adaptador e o artefato certificado próprios estarem implementados/validados. Não há renovação automática por 24h.                                                                                                                                                |
| Retificações                        | Solicitação e decisão independente antes do snapshot final, com evidência, versão, procedimento e projeção efetiva; evento original preservado. Após o snapshot final, a correção permanece bloqueada até procedimento próprio.                                                                                                                     |
| Relatório PDF                       | A4 derivado, multipágina, com revisão/hash, dados históricos, fotos, tempos oficiais e auditoria de correções. Job/snapshot imutável e arquivamento privado implementados. Sem configuração de Storage, download retorna `persistido:false` e aviso explícito; não cria disponibilidade fictícia. [Detalhes](relatorios.md).                        |
| Contingência                        | Pacote/visualizador cifrado e fila de saídas/ocorrências implementados e testados de forma isolada. Não autoriza emissão ou entrada offline. Abertura real `file://`, durabilidade e uso em dispositivo de campo **não verificados**.                                                                                                               |
| Ponta a ponta externo               | Auth real, upload/download HTTP privado, assinatura ICP-Brasil e fluxo completo emitido/encerrado com o provedor **não validados**. Schema aplicado e laboratório local não substituem essa evidência.                                                                                                                                              |

## Verificações executadas

[Resumo verificável da consolidação](evidencias/verification-summary.json), incluindo comandos, escopos e limites de cobertura.

- **36 testes PET**, em oito arquivos, aprovados por `npm run test:pet` ([registro da rodada](evidencias/pet-unit-validation.json)): domínio, horário/fuso, retenção por falha de transporte, contexto das evidências, PDF, visualizador isolado, ledger local cifrado, revogação durante consulta do pacote, contrato do endpoint e arquivamento com transportes simulados.
- **84 verificações PostgreSQL** em banco descartável com as 52 migrações: [45 de PET/presença/isolamento](evidencias/db-validation.log), [20 de retificações](evidencias/retificacoes-validation.log), [19 de relatórios](evidencias/relatorios-validation.log). Concorrência usa conexões independentes. Assinatura usa test double explícito; Storage usa metadados, sem transporte HTTP real.
- Regressões da consolidação: **107 testes** dos fluxos existentes, **27 de arquivos** e **12 de manifesto/contratos**, além de typecheck, lint dos arquivos alterados, instalação limpa/atualização e geração oficial dos tipos. Esses recortes não comprovam toda a interação dos ambientes 3D em dispositivos reais.
- [PDF de demonstração](evidencias/pdf-demonstracao.pdf): sete páginas A4 renderizadas por Poppler e inspecionadas; **zero caracteres fora dos limites** na extração. [Montagem visual](evidencias/pdf-contato.png), [verificação/hash](evidencias/pdf-qa.json).
- [Matriz dos 25 cenários](validacao-cenarios.md) relaciona cada pedido à evidência e ao limite de cobertura. Pendências permanecem explícitas.

## Demonstração

O laboratório usa a interface real e PostgreSQL controlado, com sessão Auth de teste. Storage e assinatura externa estão indisponíveis; não há emissão certificada simulada na apresentação. O aviso de demonstração identifica o ambiente. [Conferência dos bloqueios reais no laboratório](evidencias/demo-functions-validation.json).

Vídeo concluído e conferido: **3min47s, 1920×1080, H.264/AAC**, narração em português e legendas incorporadas. A montagem usa capturas reais da interface, com reenquadramentos e estados mantidos para leitura. Identifica a autenticação de laboratório, a ausência de ICP-Brasil e o bloqueio de emissão/entrada; não demonstra uma jornada certificada concluída. Áudio presente e decodificação completa sem erros registrados no manifesto:

- [Vídeo MP4 em português](evidencias/pet-digital-nexus-demonstracao.mp4).
- [Legendas SRT](evidencias/pet-digital-nexus-demonstracao.srt).
- [Manifesto da gravação e verificação](evidencias/video-manifest.json).

As capturas [desktop](evidencias/pet-desktop-contexto.png), [mobile/contexto](evidencias/pet-mobile-contexto.png), [mobile/conferência](evidencias/pet-mobile-conferencia.png) e [mobile/acompanhamento](evidencias/pet-mobile-acompanhamento.png) registram o layout observado. A jornada certificada completa, câmera/teclado virtual, leitor de tela, contingência no equipamento e canais de resgate exigem validação específica.

## Documentação e ativação

- [Referências oficiais e fotografia Cotrirosa](referencias.md).
- [Matriz campo/regra → origem → tela → armazenamento → validação → PDF](matriz-requisitos.md).
- [Arquitetura, segurança e fronteiras](arquitetura.md).
- [Operação e configuração](operacao.md).
- [Reproduzir e parar o laboratório local sem apagar os registros](laboratorio.md).
- [Relatórios, snapshots e arquivamento](relatorios.md).

Antes do uso em campo, o responsável de segurança deve aprovar espaços, modelos/versionamentos, critérios, qualificações, monitoramento contínuo, dispositivos e procedimentos de resgate/contingência. A organização precisa comprovar retenção/recuperação por cinco anos, identidade individual e integração certificada real. A guarda normativa não se comprova apenas pela presença de tabelas e hashes.
