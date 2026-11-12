# Entrega de Inspeções SPIQ & SPCQ

## Concluído

- Entrada única **Inspeções** em Conformidade. O workspace usa a faixa contextual Nexus, os sete menus da referência, navegação entre registros, filtros paginados, busca, e seleção de cliente, unidade e atuação por sessão. O módulo utiliza seus próprios dados e permissões.
- Nove migrações foram executadas pelo conector Lovable, na conexão **Primary** do projeto **Nexus Unified Platform** (`91380c2d-559c-4527-b3a4-1a8bc1e19f69`, Supabase `yhtgijtllvgzoqtfcgal`). O ledger passou de 90 a 99 posições. Caminhos, posições e checksums de todas as 99 entradas coincidem com o manifesto. O [recibo](evidencias/connector-2026-11-12.json) inclui o lote, o estado do Storage e a verificação de RLS.
- O banco contém oito contextos operacionais, 18 documentos, 835 ativos (761 vigentes e existentes), 844 inspeções históricas, 300 pendências, oito lotes históricos e 3.392 relações. A planta tem 149 pontos. Os 18 blocos foram concluídos sem conflitos. O staging conserva a demonstração, as configurações de origem e os resultados por item.
- Em 12/11/2026, os 15 grupos da R64 coincidiram com a publicação em documento, quantidade de ativos, vencimento e estado. Eram cinco grupos vencidos, oito em aviso e dois em dia. O recálculo gerou 13 ciclos e está agendado no banco. Histórico de simulações e prazo R64 permanecem separados do parecer.
- Fluxo operacional com levantamento atribuído, checklist, medições, evidências, envio à revisão, devolução, homologação de protocolo, aprovação e emissão vinculada a PDF conferido. A edição usa versão otimista, recibos idempotentes e validações de escopo. As emissões capturam versão, conteúdo, protocolo, evidências e hash.
- Continuidade com contratos, ativação e cancelamento auditado, ciclos por segmento, referência a propostas, pacotes e vinculação às OS canônicas. O acesso à OS também exige a permissão canônica.
- A interface de planta inclui navegação por TAG, cores por tipo, prazo e resultado, zonas, ficha relacionada, exportação SVG e impressão. Os PDFs históricos com bytes disponíveis têm visualizador incorporado. Os DOCX ficam disponíveis como arquivos para edição externa.

## Arquivos conciliados

Foram vinculados 22 arquivos verificados. As seis fotos de Otmar estão vinculadas à obra e ao laudo, com a legenda original, seis miniaturas e seis prévias. O R00 histórico, certificados, ART, projeto, fabricante, modelos, piloto e pranchas foram preservados. O Storage privado contém 34 objetos e 38.490.920 bytes. Cada objeto foi relido e comparado por SHA-256, tamanho e MIME. As autorizações de transferência foram removidas. A tentativa de leitura anônima posterior foi negada.

## Originais pendentes

Os 17 originais ausentes estão identificados por documento no [relatório de reconciliação](reconciliacao-fontes.md). O texto extraído permanece consultável. A busca foi feita no ZIP, na publicação, nos PDFs locais e no Drive conectado. A sessão proprietária do Perplexity no Chrome Diego (Nexus) estava desconectada. A busca nesse perfil foi suspensa conforme orientação do solicitante.

## Dependências técnicas do EST

- A base remota ainda tem zero qualificações validadas e zero atribuições de Inspeções. O vínculo autenticado de Diego existe. A identidade profissional da TST e as respectivas qualificações e designações precisam ser confirmadas na Nexus para liberar o acervo e a operação aos usuários reais.
- Homologação de protocolo, parâmetros de ensaio, capacidade, certificado e validade aplicáveis exigem conferência técnica. EQ-02 permanece pendente. O sistema aceita rascunhos, mostra bloqueios e exige PDF conferido para emissão. O acervo histórico mantém as aprovações e assinaturas declaradas na fonte, sem novas emissões.
- O piloto PAC/PAL fornecido ficou disponível como artefato histórico. A geração automatizada de novas versões DOCX/PDF e o runtime de conversão ainda estão pendentes. A execução isolada do protótipo confirmou a dependência de PyMuPDF, python-docx, Poppler e LibreOffice para a etapa de geração.
- A autorização de comunicação externa e o canal operacional continuam pendentes. A importação e as verificações foram executadas sem enviar mensagens a clientes.

## Validação e limitações

- A [validação visual](evidencias/inspecoes/validacao.json) usou os componentes reais da Nexus, dados de teste e transporte isolado em Chromium. Foram verificadas larguras de 1280, 1440, 1920, 390 e 360 px, foco e retorno pelo teclado, miniaturas, ampliação, navegação na planta, devolução EST e submissão TST. O mobile foi emulado.
- O fluxo com personas, o isolamento por unidade, a imutabilidade, o reprocessamento e os limites de calendário da R64 foram exercitados em PostgreSQL local. No banco conectado, a verificação cobriu o ledger, as contagens, RLS ativa, o Storage privado e a negação anônima.
- A interface segue em PR revisável. A confirmação de jornada autenticada no ambiente conectado depende das designações reais. A integração apresenta biblioteca histórica e homologação versionada de protocolos. Revisões gerais de todos os textos e parâmetros, gestão completa de evidências de consentimento e integração da fila de geração PAC/PAL permanecem abertas.

## Resultados dos testes

- `npm run typecheck`, build de produção e ESLint dos arquivos alterados passaram localmente.
- `npm run test:nr` passou 195 testes Vitest e 23 testes Node, com sete pulos previstos pelo ambiente. PET passou 121 testes e a suíte operacional passou 55 testes Vitest e 12 testes Node.
- Os testes de importação passaram 3/3. O PostgreSQL local confirmou instalação limpa, aplicação atômica pelo envelope do conector, 59 verificações de fluxo e os cenários de R64, reimportação e continuidade.
- A execução completa do banco parou na validação de janela de qualificação em `tests/db/agenda-foundation.sql:97`. A mesma falha foi reproduzida no checkout de referência com apenas as 90 migrações anteriores.
- No banco conectado, reprocessar os 18 blocos preservou o total de registros e os 835 ativos. Uma simulação do papel autenticado com identidade existente, ainda sem atribuição técnica, retornou zero registros e arquivos do módulo.
