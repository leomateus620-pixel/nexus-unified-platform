# PET Digital Nexus — arquitetura e fronteiras

Estado do código em 23/10/2026. A implantação de schema, a configuração de serviços externos e a aprovação técnica são marcos separados; consulte as evidências da entrega para identificar quais foram executados em cada ambiente. O [estado consolidado da entrega](README.md) distingue as 52 migrações aplicadas das integrações pendentes. A fundamentação está em [referencias.md](referencias.md), e a rastreabilidade de campos em [matriz-requisitos.md](matriz-requisitos.md).

## Dono do domínio

`src/features/pet/` concentra contratos de fronteira, adaptadores autenticados, formulário, acompanhamento, documentos e contingência. A aplicação continua no monólito React/TanStack Start existente. Nenhum motor comercial, cadastro de produto, orçamento, geração de OC/OP ou ambiente 3D foi substituído.

| Camada                     | Implementação                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fronteira de entrada/saída | `schemas.ts`: Zod, JSON serializável e enum de comandos; entradas com organização resolvida pela sessão.                                                                                                              |
| Consultas/comandos         | `pet.functions.ts`: middleware Auth existente e cliente Supabase com token do usuário; chamadas a `pet_listar`, `pet_obter`, `pet_opcoes`, `pet_executar`.                                                            |
| Backend autoritativo       | `drizzle/migrations/0030_pet_digital.sql`: entidades, RLS, autorização por registro, locks, versionamento, recibos idempotentes, presença e estados.                                                                  |
| Arquivos                   | `0031_pet_anexos.sql` e pipeline operacional canônico: `anexos`, bucket privado `nexus-operacional`, preparar → enviar → verificar bytes → confirmar.                                                                 |
| Apresentação               | `ExecucaoWorkspace`, `PetWorkspace`, `PetEditor`, `PetOperations`, `PetModelos` e CSS limitado ao workspace; rail autenticado preservado.                                                                             |
| Documentos                 | `0033_pet_relatorios.sql`, `documentos.functions.ts` e `relatorios.server.ts`: job/snapshot, geração/arquivamento e consulta autorizada. `pdf.ts` produz o relatório derivado; a UI o distingue do original assinado. |
| Contingência               | `offline.ts`, `offline-viewer.ts`, `PetContingencia`: pacote cifrado por contexto, visualizador autônomo e fila restrita de fatos pendentes.                                                                          |
| Auxiliares de UI           | `ui-types.ts`: DTOs de apresentação, rótulos, duração visual e conversão do horário declarado no fuso IANA da PET. Não calcula intervalos oficiais.                                                                   |

## Rotas e integração

As rotas de negócio ficam sob `_authenticated`, com o gate existente e o acesso de Execução na matriz de navegação. O layout `/execucao` usa `Outlet`; a árvore é gerada pelo TanStack Router.

| Rota/consumidor                           | Responsabilidade                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `/execucao`                               | Lista de OS e PETs; criação contextual; modelos técnicos versionados.               |
| `/execucao/ordens/$ordemId`               | Ficha da OS, escopo, responsável e card **Permissões de Entrada e Trabalho**.       |
| `/execucao/pets/$petId`                   | Ficha própria da PET, seis etapas e acompanhamento operacional.                     |
| `PetHistoricoUnidade` na ficha da unidade | Consulta autorizada por unidade, busca, situação, validade e acesso à PET completa. |

O recorte de OS implementa identidade, cliente/unidade, título, escopo, responsável e transições básicas. Há fundação relacional para participantes e apontamentos; a entrega não afirma possuir um RDO completo, gestão integral de materiais/entrega ou integração automática de horas. O cadastro operacional de pessoas e os cadastros de clientes/unidades permanecem canônicos. Pessoa operacional, conta Auth e função temporal na PET são vínculos diferentes.

Uma OS possui várias PETs. Encerrar uma PET não conclui a OS. A conclusão da OS rejeita PETs ou presenças pendentes; não altera seus estados automaticamente. O tempo de presença da PET não gera apontamento, cobrança ou folha.

## Modelo e estados

As relações principais são `ordens_servico` → `pet_permissoes` → espaço/unidade/modelo versionado. Participantes, respostas, avaliações, leituras, eventos individuais, intervalos, ocorrências, prorrogações, assinaturas e documentos possuem tabelas próprias. FKs compostas preservam organização e contexto. JSON é usado para procedimentos e snapshots; não substitui pessoa, unidade, OS, espaço ou evento relacional.

O estado documental usa `rascunho`, `em_conferencia`, `aguardando_assinaturas`, `emitida`, `encerramento_pendente`, `encerrada` e `cancelada`. A condição operacional usa `nao_liberada`, `liberada`, `em_atividade`, `interrompida`, `emergencia` e `terminada`. A validade temporal e as presenças são projeções independentes. Expirar não cria saída; interromper não pausa permanência; terminar a operação pode manter conclusão documental pendente.

`conferir` fixa uma revisão com SHA-256 e preserva a equipe/condições assináveis. O conteúdo congelado não é reescrito por edição normal. A identificação histórica é copiada na criação da PET e consultada na UI/documentos mesmo que cadastros atuais mudem. Participantes têm `inicio`/`fim`; a passagem de vigia mantém vínculos e assinaturas anteriores.

O modelo é uma versão explícita de procedimento: checklist com obrigatoriedade/NA/evidência, agentes/unidades/limites, qualificações por função, monitoramento, resgate e continuidade. Cadastro em rascunho e aprovação técnica são ações diferentes. Aprovar exige responsável técnico designado, vigente, com registro profissional e identidade da sessão; papel de administrador não equivale a atribuição técnica.

## Contrato e concorrência

As funções de servidor recebem `organization_id`; o backend revalida Auth, membership/capacidade e acesso atual ao registro. Comando:

```json
{
  "organization_id": "UUID",
  "comando": {
    "chave": "UUID da intenção",
    "comando": "salvar_rascunho",
    "dados": { "pet_id": "UUID", "expected_version": 3 }
  }
}
```

Cada comando tem campos permitidos próprios. O cliente não escolhe autor oficial, total de segundos, certificação validada ou liberação. Os dados acima ilustram somente o envelope; o comando de rascunho exige seus demais campos.

A mesma intenção mantém chave e payload em retries. Payload divergente com a mesma chave conflita. O recibo referencia o registro e não concede acesso depois de revogação. Edições usam `expected_version`; o banco trava a PET/OS e, para presença, serializa a pessoa entre dispositivos. Uma pessoa não mantém duas entradas abertas incompatíveis. Saída anterior à entrada é recusada. A saída factual admite versão de tela antiga e indisponibilidade posterior de assinatura; o registro não fica condicionado ao provedor.

Queries incluem organização/usuário e são invalidadas após comando. A UI evita duplo toque, mantém preenchimento após falha e apresenta conflito sem sobrescrever outra versão. Essas proteções não substituem as restrições transacionais.

## Assinaturas e limites de integração

O registro distingue `coletada_tela`, `aceite_autenticado` e `certificada_icp_brasil`; seus estados não são intercambiáveis. A liberação exige assinatura certificada validada de signatários/finalidades/versionamento aplicáveis, mais original documental disponível. Preparar intenção ou desenhar assinatura não satisfaz esse requisito.

O schema conserva pessoa/função, finalidade, declaração, hash/revisão, evento, método, provedor/identificador, identidade verificada e resultado de validação. O endpoint de callback deve validar autenticação do provedor e revalidar documento, signatário, estado e repetição. Não existe caminho público que aceite `assinado=true` do navegador.

**O adaptador HTTP do provedor de assinatura certificada real ainda não foi implementado/configurado nesta entrega.** Emissão e entrada permanecem bloqueadas sem o provedor e os originais validados. O fluxo de pessoas sem login permanece pendente de implementação, com sessão individual e restrita ao ato; não foi criado um acesso geral à organização nem uma identificação externa simulada. A UI informa a dependência. Aceite autenticado não é apresentado como certificado ICP-Brasil.

Continuidade exige condições cumulativas da NR-33, limite total de 24h, procedimento e aditamento certificado. A UI coleta uma avaliação; o backend mantém a operação bloqueada enquanto o procedimento/artefato verificável estiver ausente. O comando legado `retificar` conserva somente uma solicitação auditável. O fluxo próprio `pet_retificar`, em `0032_pet_retificacoes.sql`, implementa solicitação e decisão de correção antes do encerramento documental final; suas condições estão descritas abaixo.

## Retificação de horários antes do snapshot final

A migração aditiva `0032` acrescenta solicitações e decisões de retificação sem editar o evento original. `retificacoes.functions.ts` expõe `petRetificar`, autenticado, com o envelope `{organization_id, comando:{chave,comando:"solicitar"|"decidir",dados}}`. A etapa de acompanhamento inclui `RetificacaoPet`, seção recolhível própria, com seleção de evento de intervalo fechado, horário proposto no fuso explícito (com segundos), motivo e evidência confirmada pelo pipeline privado.

A solicitação recebe `pet_id`, `expected_version`, `evento_id`, `momento_corrigido`, `motivo` e `evidencia_id`. A decisão recebe `retificacao_id`, `expected_version`, `responsavel_id`, `decisao:"aprovar"|"recusar"` e `motivo`; **em ambos os casos a versão esperada é a versão atual da PET**. Chave/payload e acesso atual seguem o mesmo contrato idempotente e transacional do domínio.

Somente intervalos fechados podem ser corrigidos, com todas as pessoas fora, PET em `encerramento_pendente`/`terminada` e antes da versão final de encerramento. O procedimento versionado deve permitir retificação e definir método/tolerância/evidência. O SQL exige decisão por responsável técnico independente, designado e identificado em sua própria sessão, com separação entre autor original, solicitante e trabalhador conforme a regra do procedimento. Não basta selecionar um nome no formulário.

Solicitação pendente e recusa não alteram o tempo oficial. Após aprovação, os intervalos efetivos são projetados sem sobrescrever o evento original e passam a compor as métricas oficiais; o servidor revalida ordem temporal, validade e sobreposições. O detalhe expõe `retificacoes`, `retificacao_decisoes` e intervalos com horários originais/efetivos e referências às decisões. A UI mostra o antes/depois e o histórico. A emissão ou encerramento final já fixados não são reescritos por esse fluxo; correções posteriores demandam outro procedimento formal.

## Documentos, arquivos e retenção

Fotos e arquivos têm `pet_id` e contexto `pet_item`, autor, metadados e SHA-256. A extensão não injeta defaults em requests antigos; os hashes idempotentes legados são preservados. `RecordFiles` conserva estados pendente/confirmado/falho e retomada com o mesmo conteúdo.

O relatório A4 é um artefato derivado dos registros autorizados. Lista equipe, perigos/controles, avaliações/leituras, intervalos/tempos, eventos, assinaturas, documentos e evidências; a seção documental identifica sua natureza. Fotografias PNG/JPEG são incorporadas até 12 imagens/12 MiB; o manifesto relaciona os demais originais por contexto/hash e informa essa limitação. Acima de 200 evidências a geração exige processamento em lote e falha sem omissão silenciosa. O relatório é identificado como derivado e não declara preservar certificação por incorporar imagens de assinatura. Os originais assinados permanecem separados e intactos. A exportação usa job/revisão imutável; somente arquivo confirmado e verificado pode torná-lo disponível. Sem configuração de arquivamento, preserva o download útil com `persistido:false` e aviso explícito. Consulte [relatorios.md](relatorios.md).

Os originais assinados são binários privados relacionados por versão/hash, consultados e baixados com autorização atual. O consolidado não substitui um original certificado. A retenção mínima de cinco anos fica registrada a partir da emissão; encerramento/cancelamento não elimina eventos, assinaturas ou documentos. Política de backup, retenção efetiva de Storage e descarte institucional devem ser comprovados antes da ativação.

## Disponibilidade local e verificação

A cópia protegida só pode ser preparada depois de emissão, original assinado disponível e verificação dos bytes/hash pelo servidor. O pacote contém a versão e última sincronização e é cifrado com AES-256-GCM/PBKDF2; a chave deriva de senha local, não do token de download. O visualizador HTML autônomo permite abrir o PDF preservado e registrar saídas/ocorrências sem depender do carregamento da SPA ou da duração de URL assinada. Sua CSP impede conexões de rede.

Somente fatos de saída/interrupção entram na fila local. Declaração de horário, recebimento, origem offline e necessidade de conferência permanecem distinguíveis. A sincronização fixa chave e primeiro payload antes do envio e preserva conflitos. Não há nova emissão, liberação, entrada ou certificação offline. A importação de JSON protegido exige retorno à sessão Nexus autorizada. A cópia cifrada pode conter o campo opcional `confirmados`, com o pedido exato e o momento em que este dispositivo observou a resposta do servidor. Pacotes anteriores sem esse campo continuam válidos; sua ausência é tratada como lista vazia somente pelos auxiliares locais. O envelope AES-GCM e os comandos/hashes idempotentes SQL legados não recebem defaults nem campos novos. O ledger evita que reimportar uma exportação antiga recrie uma pendência já confirmada no dispositivo. Confirmações trazidas somente por arquivo importado são candidatas a replay autenticado, não prova de recebimento pelo servidor. Falha de armazenamento é apresentada como memória volátil, com orientação explícita de exportar a cópia cifrada antes de fechar. O mecanismo tem testes de cifra/contexto/fila, reimportação após confirmação e falha de armazenamento; o comportamento no navegador `file://` e em cada dispositivo/ambiente operacional continua exigindo validação prática específica.

O laboratório de UI vive em `tests/pet-ui`, com PostgreSQL descartável/controlado, sessão Auth de teste e aviso permanente de demonstração. Storage HTTP e adaptador externo de assinatura não estão configurados nesse laboratório. Não é importado pela aplicação nem insere exemplos em produção. Testes do domínio, PDF, tempo de formulário e banco estão separados da validação do provedor. Capturas responsivas e vídeo precisam ser lidos com o aviso de homologação e sem inferir certificação concluída.
