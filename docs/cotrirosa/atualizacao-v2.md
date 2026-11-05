# NR-33 / NR-35 v2 · comparação e integração

Inspeção em 05/11/2026. Base local reconciliada com `origin/main` em `e408c628b8726b3b626882ce95fc45377f9f030f`. O app de referência foi aberto no Perplexity e comparado ao Nexus autenticado. O ZIP foi extraído fora do repositório e lido como referência; seus dados e suas credenciais de demonstração não foram importados.

## O que mudou

| Versão 2 de referência | Nexus antes | Integração entregue |
|---|---|---|
| Catálogo de 13 documentos por unidade, só RT altera | Acervo por norma e revisões, sem contratação confirmada | Área **Documentos contratados**, compartilhada nas duas normas. RT precisa de designação vigente, registro profissional, permissões e sua própria sessão. Histórico, versão esperada e chave idempotente. |
| Memorial obrigatório; levantamento e ventilação de todo EC | Levantamento com 16 blocos e memorial existentes | Memorial não pode ser removido. Blocos essenciais continuam; seleção contratada restringe os opcionais sem excluir respostas históricas. Dimensões do mapa não calculam ventilação. |
| Técnico só trabalha no escopo contratado | Editor admitia tipo livre | Novos documentos/revisões exigem tipo do catálogo e contratação no servidor. Criação a partir de modelo também passa pelo mesmo comando. Cópias editáveis resolvem o tipo pela relação com a origem, nunca pelo nome do arquivo. Acervo histórico continua consultável. |
| Funcionários, certificados, validade e carga horária | Pessoas e competências canônicas, evidências e análise de qualificação | Área **Equipe e certificados**, vínculo explícito à unidade, carga horária, tipo e modalidade. Alertas vencidos e próximos 30 dias. Um vínculo não concede acesso à organização nem aprova habilitação. |
| Assinatura por PIN | Aceite autenticado, revisão, originais verificáveis e contrato de provedor | Preservado o fluxo Nexus. O PIN de demonstração não foi promovido a assinatura certificada nem substituiu o provedor. |
| Vigia registra entradas, saídas e medições | Comandos existentes com função técnica, versão, intervalo, validade e auditoria | Reutilizados no detalhe canônico da PET da unidade. NR-35 dá contexto de consulta quando há relação real com EC; não converte trabalho em altura em PET. |
| Prorrogação, encerramento e retenção | Regras existentes de jornada, estado, presença, assinaturas e cinco anos | Preservadas; sem encerramento automático ou entrada offline. OS segue operação própria e impede fechamento com PET/presença pendente. |
| Ao vivo, relatório CSV e link do gestor | Relatório PDF derivado e originais privados | Consulta somente leitura autenticada, atualização em 5 s e CSV com filtro exato de unidade/espaço antes da paginação; limite de 5.000 exige refinar período, sem truncar. Proteção contra fórmulas no CSV. Link não concede acesso. |
| Impressão 2 vias / digital / branco | Relatório derivado e downloads dos originais | Formulário em branco de três páginas por via, somente com layout explícito no modelo aprovado. Duas vias geram seis páginas. Original assinado permanece separado e seus bytes não são reconstruídos. |
| QR, quatro placas/A4 | Sem emissão contextual de placas | PDF vetorial, quatro por folha, URL da ficha autorizada e domínio atual. localhost recebe “TESTE — NÃO INSTALAR”. QR não libera entrada. |
| Fotos com data, hora e GPS | Anexos privados confirmados/hash | Metadados imutáveis por original, origem declarada/dispositivo e precisão. Exigência de foto/GPS é lida da versão do procedimento aprovada pelo RT; não altera retroativamente modelos. |
| Offline com fila validada | Pacote cifrado, originais preservados e fila de saídas/interrupções | Preservado. Não replica a permissão de registrar entrada offline do protótipo. Retry, contexto, conflitos e autorização são revalidados no servidor. |
| Avisos de vencimento | Validade nas qualificações | Contagens por unidade e certificado em 30 dias no painel. Notificações externas não foram configuradas. |

## Efeito no mapa

O painel de cada silo usa a mesma contratação, o mesmo local NR, o mesmo espaço operacional e o mesmo `pet_id` da unidade. O Acervo informa a contratação e leva à área correspondente. A PET em destaque permite continuidade; a criação explica bloqueios do vínculo, atribuição, modelo ou contratação. O histórico filtra espaço + unidade no servidor. “SA 05” e “AS 05” encontram a mesma identidade, sem atribuir documentos por busca textual.

A produção apresenta locais cadastrados em NR-33 com documentos NR-35 relacionados. A migração 0065 reconhece essa relação para o contexto do mapa/PET sem alterar a norma cadastral. A ficha técnica conserva sua origem NR-33; o recorte do acervo acompanha a norma visitada.

## Diferenças que não podem virar aprovação automática

- A seleção de todos os documentos no seed do protótipo não comprova contratação da Cotrirosa. Nenhum contrato real foi presumido.
- A consulta real encontrou **zero modelos PET aprovados, zero integrações de assinatura certificada habilitadas e zero designações RT vigentes**. A fábrica estava sem PET; havia um rascunho legado com OS em outra unidade da organização, preservado pela migração.
- A validade técnica de treinamento não deriva apenas das horas. O Nexus registra horas/modalidade, preserva análise e evidência e exige critérios do procedimento validado. Limites de H₂S e CO não foram inventados.
- Fotos e coordenadas declaradas não são prova automática de presença, ancoragem ou autenticidade de captura. A interface identifica a origem dos metadados.
- O novo layout Nexus precisa de conferência do RT. Não se afirmou equivalência documental automática com a impressão do protótipo.
- O ZIP não contém os 150 testes de app e 78 verificações de API citados no texto de entrega. Esses números são declaração da referência, não resultados reproduzidos neste trabalho.
- Login/perfis do Nexus foram mantidos. Não foi criado um portal anônimo ou uma conta de cliente automaticamente; usuários externos precisam de identidade e acesso institucional autorizados.

## Banco e compatibilidade

Migrações aditivas: **0061** contexto da cena, unidade e OS opcional; **0062** catálogo/contratação; **0063** equipe/certificados; **0064** evidências/consulta/exportação; **0065** contexto NR compartilhado, classificação das cópias e auditoria imutável. Cada migração usa o envelope canônico: DDL e ledger na mesma transação, trava e verificação de todos os checksums anteriores. Não executar uma segunda representação das mesmas migrações.

O laboratório PostgreSQL 18.6 é restrito a loopback e recebe somente fixtures identificadas. Ele aplica dados anteriores à 0061 e depois os cinco envelopes completos. Testes de provedor usam doubles explicitamente identificados; não certificam assinatura real. A fixture de PET encerrada valida consulta e isolamento, sem emissão ou assinatura fictícia em produção.

Consulte `README.md`, `ui-results.json`, `v2-ui-results.json`, `performance.json` e `validacao.json` para resultados e estado da implantação. Capturas autenticadas, fotografias e vídeos ficam locais, excluídos do Git público.

## Referências normativas conferidas

[NR-33 oficial](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-33-atualizada-2022-_retificada.pdf): itens 33.5.7, 33.5.11 e disposições de prorrogação/arquivo. Duas vias físicas e requisitos do documento digital são distintos; PIN isolado não prova atendimento à certificação exigida.

[NR-35 oficial](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-35-atualizada-2025-1.pdf): PDF consultado com atualização de julho de 2026. O nome histórico do arquivo não substitui a versão do conteúdo. Requisitos operacionais e habilitação permanecem sujeitos à validação do responsável técnico.
