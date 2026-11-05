# PET demonstrativa e ficha do mapa

Implementação sobre `48cb161`, preservando a correção de altura do workspace e a implantação da Cotrirosa. A nova experiência usa a mesma seleção, autenticação e contexto NR; não altera modelos, materiais, UUIDs ou transformações do terreno/equipamentos.

## Jornada

NR-33 ou NR-35 → COTRIROSA → Fábrica de Ração — Santa Rosa → 3D → selecionar um dos cinco silos → **Iniciar PET**. A ficha abre expandida em Contexto, vazia. Somente a primeira confirmação de salvamento cria a demonstração. Havendo sessão aberta, **Continuar PET** tem prioridade; múltiplas sessões são escolhidas por número/atividade.

As oito etapas são Contexto, Equipe, Segurança, Atmosfera e procedimentos, Conferência, Acompanhamento, Encerramento e Consulta final. Nomes, funções, perigos, medidas, leituras e procedimentos são inseridos manualmente. Não há detector, certificado, assinatura ou aprovação técnica simulados. Entradas e saídas são demonstrativas; encerramento/cancelamento exige decisão explícita e nenhuma presença aberta. PDF e CSV são identificados como demonstração sem validade operacional.

A ficha tem Visão geral, Acervo, PET e Histórico. Expandir/minimizar preserva seleção, formulário e câmera; `Esc` minimiza e devolve o foco ao botão. O Canvas permanece montado e os controles ficam desativados durante a expansão. Histórico técnico/operacional e proveniência continuam disponíveis em seções recolhíveis. Na área PET da unidade, Demonstrações e Operação real permanecem separadas. O fluxo real conserva as suas validações e permissões.

## Dados e autorização

`0066_pet_demonstracao.sql` cria configuração por local, série por unidade, sessões, eventos, recibos, presenças e anexos. As cinco configurações são derivadas exclusivamente dos vínculos existentes da cena publicada. Demonstrações não entram em `pet_permissoes`, totais operacionais, assinaturas ou fechamento de OS.

- RPCs `pet_demo_contexto`, `pet_demo_listar`, `pet_demo_obter`, `pet_demo_registros`, `pet_demo_executar`, `pet_demo_arquivo` usam o usuário autenticado, contexto NR e capacidades existentes `ver_operacao`/`gerir_operacao`.
- As sete tabelas têm RLS e não recebem acesso direto dos papéis da aplicação. Escritas passam por funções controladas. Org/unidade/local, versão esperada, autor e intenção idempotente são revalidados; não basta conhecer o UUID.
- Listas filtram unidade/local antes da paginação. Eventos e anexos são consultados sob demanda em páginas de 50 e 20. Exportações coletam as páginas e recusam alteração de versão durante a consulta.
- Identificação histórica é congelada. A URL restaura `local`, `painel`, `visualizacao`, `petDemo` e `etapaDemo`; não concede autorização.
- Cache inclui organização, usuário, cliente, unidade, norma, local e recurso. Falha/retry conserva o formulário e a chave do comando. Conflito não substitui o texto digitado; usar a versão do servidor exige ação explícita.
- Bucket `nexus-pet-demo` privado, até 20 MiB, PDF/PNG/JPEG/WebP. Preparação reserva caminho por sessão/arquivo/autor; confirmação confere objeto armazenado e metadados; abrir revalida acesso e usa URL de 60 s. Arquivo não é tratado como original certificado.

## Validação desta entrega

Evidências reproduzíveis, com dados controlados e PostgreSQL 18 em loopback:

| Conjunto | Resultado |
|---|---|
| Tipos e lint dos arquivos alterados | Aprovados |
| Build principal | Aprovado |
| Testes PET, incluindo demonstração e fronteiras de servidor | 95 aprovados |
| Testes NR em Vitest | 185 aprovados |
| Manifesto de migrações | 9 aprovados |
| Migração/SQL demonstrativo | 42 verificações aprovadas |
| Regressão SQL mapa/PET e v2 | 30 + 21 verificações aprovadas |
| Jornada e responsividade | 15 verificações aprovadas |
| Falhas, exportação, histórico e fallback | 7 verificações aprovadas |

O roteiro visual usa Chromium 153 em Windows, desktop 1440×1000, janela 1280×560, tablet 820×1180 e celular emulado 390×844. A redução para 390×480 testa espaço de tela semelhante ao teclado aberto; não prova comportamento de teclado/IME ou Safari em telefone físico. Capturas e vídeo ficam na pasta local ignorada `docs/cotrirosa/`, identificados por `demo-`. Nenhuma fotografia de cliente foi publicada.

Testes de falha executam perda da resposta depois do commit, repetição do mesmo comando, dois operadores editando uma versão, preservação do formulário, decisão de descarte, falta de WebGL, abertura pelo histórico da unidade e downloads PDF/CSV. O teste de banco verifica acesso revogado, RLS, caminhos privados, envio não confirmado e preservação da PET real legada. O upload binário em Storage remoto não foi exercitado com dados de cliente. A prévia local usa autenticação de teste; não é prova de uma jornada autenticada publicada no domínio de produção.

Para repetir: definir `PGTEST_EPHEMERAL=1`, `PGTEST_HOST=127.0.0.1`, `PGTEST_PORT=55439`, iniciar PostgreSQL descartável, executar `node tests/cotrirosa/demo-db.mjs`; para a UI, `node tests/cotrirosa/seed.mjs` e `node tests/cotrirosa/run-demo-ui.mjs`. O banco do laboratório é separado e o transporte de teste não é importado pelo aplicativo.

## Aplicação remota

Migração **0066 aplicada exclusivamente pelo conector Lovable** em 05/11/2026 às 15:31:03 UTC, posição 85 do ledger. SHA-256 `a2248fdb5f27af939be509b6fad4b8d17ecb07c94b2587354b0e2dd18fae6dae`. O envelope verifica o prefixo canônico e confirma DDL/ledger atomicamente.

Conferência após aplicação: cinco silos configurados, sete tabelas com RLS, bucket não público e zero demonstrações. A PET real existente no sistema e o total zero da fábrica ficaram inalterados. Comprovante em [demo-lovable-migration.json](demo-lovable-migration.json). A aplicação do banco é distinta da publicação da interface: a PR contém a implementação para revisão; a prévia local permite navegar antes da integração à branch publicada.
