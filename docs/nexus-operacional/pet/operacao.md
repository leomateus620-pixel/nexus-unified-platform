# PET Digital Nexus — operação, configuração e limites

Este documento descreve a jornada implementada e as condições necessárias para ativação. Não é um procedimento técnico de entrada em espaço confinado. A organização deve aprovar seu próprio procedimento com o responsável de segurança, considerando a [matriz de requisitos](matriz-requisitos.md) e as [fontes oficiais consultadas](referencias.md).

## Preparar o contexto

Em **Execução / OS**, cadastre a ordem com cliente, unidade, escopo e responsável reais. Abra a OS e use o card **Permissões de Entrada e Trabalho** para criar a PET. Escolha um espaço da mesma unidade; o cadastro do espaço registra identificação/localização. A numeração da PET é produzida no servidor.

Informe objetivo e término previsto da jornada. O formulário não preenche 24 horas como padrão. Datas são apresentadas em português e serializadas no fuso IANA explícito da PET. O máximo normativo não é uma duração recomendada. Criar ou salvar rascunho não autoriza entrada.

A lista da OS mostra PETs, espaço, responsável, validade e presenças abertas. A ficha da unidade inclui **Histórico de PETs**; cada registro abre a permissão e seus documentos conforme acesso atual. O histórico preserva identificação, equipe/funções e ocorrências passadas.

## Preenchimento por tarefa

| Etapa                        | Trabalho na interface                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contexto                  | Conferir origem dos cadastros, espaço, atividade, jornada e versão do modelo técnico.                                                                                                                             |
| 2. Equipe                    | Buscar pessoa canônica; atribuir supervisor, vigia/substitutos, trabalhadores e resgate; informar classificação e empresa; registrar contatos reais.                                                              |
| 3. Perigos e controles       | Selecionar perigos por grupo, complementar, vincular medida/evidência; responder EPC/EPI com Sim, Não, Não se aplica permitido ou Ainda não verificado.                                                           |
| 4. Atmosfera e procedimentos | Registrar instrumento/série, responsável, horário, etapa e leituras com unidade/origem; descrever bloqueios, purga, ventilação, comunicação, resgate e treinamentos; conferir dispositivo/monitoramento contínuo. |
| 5. Conferência e assinaturas | Abrir pendências clicáveis; conferir no servidor; consultar situação por método/finalidade; emitir somente com requisitos e certificados validados.                                                               |
| 6. Acompanhamento            | Consultar presença, validade, tempos, documentos e contatos; registrar entrada/saída, avaliação, ocorrência, passagem de vigia e preparação do encerramento conforme permissão.                                   |

O celular usa cards, rótulos, seções recolhíveis, teclado decimal e etapa com ação principal. Medições aceitam vírgula; a unidade permanece visível. O desktop preserva o rail e usa área principal/painel de contexto recolhível. Campos vazios ou não verificados não equivalem a “Não se aplica”. O modelo técnico decide se NA é permitido e se exige justificativa/evidência.

O rascunho informa se há alterações somente na tela ou confirmação no servidor. Falha de escrita mantém o preenchimento; conflito não sobrescreve a alteração concorrente. Antes de sair com alterações locais, a interface solicita decidir entre continuar e descartar. Esse preenchimento de preparação não constitui emissão local.

## Modelos e aprovação técnica

A seção recolhível de modelos em Execução permite cadastrar um procedimento JSON em rascunho e consultar suas versões. O editor é técnico: não inventa agentes/limites, qualificação, equipamentos ou resgate. IDs de checklist conectam respostas e arquivos. Os campos do procedimento devem respeitar o contrato SQL:

- `itens`: objetos com `id`, `rotulo`, `obrigatorio`, `permite_na`, `justificativa_na` e `evidencia_obrigatoria`.
- `agentes`: `agente`, `unidade`, `minimo`/`maximo` conforme o critério aprovado, sem copiar automaticamente limites da foto.
- `qualificacoes`: função e `competencia_id` canônico aplicável.
- `procedimento_resgate`, `monitoramento_continuo`, `avaliacao_max_minutos` e `permite_prorrogacao`, conforme o procedimento.

A aprovação é uma ação própria de responsável técnico designado e identificado em sua sessão. O servidor confere designação, vigência, registro e critérios mínimos. Cadastre atribuições e qualificações pelos fluxos canônicos autorizados; não use o login do supervisor para assumir outra identidade. A aprovação técnica do modelo não substitui sua validação institucional, treinamento da equipe e verificação de campo.

## Presença, tempo e encerramento

Entrada é individual: selecionar trabalhador, conferir condições/declaração e vincular assinatura certificada válida para finalidade e versão. Emitir a PET não inicia o relógio de ninguém. O servidor rejeita entrada vencida, repetida/incompatível, não autorizada ou sem avaliação/assinatura aplicável.

Saída é um fato imediato. O vigia autorizado pode registrar quem saiu; registrante e trabalhador são identidades separadas. Falha posterior do provedor não impede gravar a saída, que aparece como **Saída registrada; assinatura pendente** quando aplicável. Expiração e interrupção não produzem saídas e não pausam permanência.

O contador visual usa eventos persistidos para mostrar o tempo em curso. Intervalos e totais oficiais vêm do servidor, com precisão em segundos. Duração documental, permanência individual, horas-pessoa e apontamento da OS permanecem identificados separadamente. Nenhuma transferência automática para cobrança/folha foi ativada.

A saída de toda a equipe encaminha encerramento pendente. Continuidade exige decisão formal, condições cumulativas, procedimento e aditamento certificado; o formulário não oferece renovação automática por 24 horas. Troca de vigia exige substituto previamente relacionado e assinatura aplicável; vigia não relacionado exige tratar a hipótese de encerramento. As vigências anteriores permanecem no histórico.

Preparar encerramento exige ausência de presença aberta, conferência do vigia/responsável e condição final. O término operacional pode ser registrado enquanto assinaturas de saída/encerramento continuam pendentes. A OS só pode ser concluída após tratar as PETs e presenças; concluir não inventa saída ou encerramento. A seção **Retificação auditável de horários** permite solicitar e decidir correção antes do encerramento documental final, conforme o procedimento versionado. Solicitações pendentes e recusadas não alteram o tempo oficial. O fluxo preserva os eventos originais e apresenta os intervalos efetivos separadamente.

## Solicitar e decidir uma retificação de horário

Depois da saída de todas as pessoas, ainda em encerramento pendente e com término operacional registrado, abra **Acompanhamento → Retificação auditável de horários**. Escolha um evento de entrada ou saída de intervalo já fechado. Informe o horário corrigido no fuso da PET, preservando segundos quando necessários, justifique e selecione evidência confirmada. Arquivo pendente não atende ao requisito. A mesma seção oferece acesso ao pipeline privado de evidências, sujeito à autorização do pai.

Registrar a solicitação preserva o horário original e mantém a proposta em análise. O responsável técnico independente deve entrar com sua própria identidade, escolher a solicitação, selecionar sua pessoa operacional, fundamentar e aprovar ou recusar. O servidor confere designação, independência do autor/solicitante/trabalhador, procedimento vigente, tolerância, evidência, versão e ausência de conflitos temporais. O formulário não concede atribuição profissional a quem escolhe um nome.

Somente aprovação confirmada modifica a projeção efetiva de intervalos/tempos; o evento original continua consultável. A interface apresenta **Entrada original / Entrada efetiva / Saída original / Saída efetiva** e mantém solicitação, decisão, justificativas e evidência. Não há correção de presença ainda aberta por esse recurso, nem reescrita de PET já encerrada ou do snapshot final. Para correções posteriores, a organização deve definir outro procedimento formal.

O fluxo exige a migração `0032` aplicada no ambiente e procedimento aprovado com configuração de retificação. A disponibilidade de código/interface não equivale à configuração técnica. Sem essas condições, a operação é recusada com preenchimento preservado; não há aprovação simulada.

## Fotos, documentos e contingência

Anexe a foto no contexto correspondente: identificação, perigo/controle, instrumento, procedimento ou situação final. O pipeline privado verifica bytes/hash antes da confirmação e permite retomar envio pendente com o mesmo conteúdo. Arquivos pendentes não satisfazem evidência obrigatória. Foto de detector não substitui leituras estruturadas; avaliações manuais não equivalem a monitoramento atmosférico contínuo.

O botão de PDF prepara snapshot imutável e baixa um relatório derivado da versão consultada. Quando o arquivamento privado está configurado, o serviço verifica os bytes e confirma o arquivo antes de indicá-lo disponível. Sem configuração, informa explicitamente que o download não foi arquivado (`persistido:false`); consulte [relatorios.md](relatorios.md). Consulte os originais certificados separadamente. Um relatório consolidado não herda a certificação de outro PDF. A interface lista hashes e vínculos; downloads permanecem privados e autorizados. Não distribua um QR/link público irrestrito para dados pessoais ou documentos.

A contingência só é preparada com uma PET emitida e seu original assinado disponível. Informe senha local de pelo menos 12 caracteres, conserve a cópia protegida no dispositivo aprovado e confira versão/última sincronização antes da operação. O pacote não depende da validade de uma URL temporária. O visualizador autônomo mantém PDF e fila cifrados; o arquivo JSON protegido permite retornar os fatos para sincronização autenticada.

Sem rede, a fila admite saída e ocorrência, identificadas como **pendentes no dispositivo**. Após reconexão, importe/sincronize no contexto correto. Confira conflitos e horários declarados; recebimento no servidor e conferência não são o mesmo instante. A cópia mantém um ledger cifrado das confirmações observadas neste dispositivo, com o pedido enviado e a versão usada. Assim, reimportar uma exportação antiga não recria um fato já confirmado localmente. Um arquivo importado não é aceito como prova de recebimento pelo servidor: pedidos ainda não reconhecidos neste dispositivo são reenviados com sua chave e payload preservados. Pacotes antigos sem o novo campo opcional permanecem legíveis; os comandos SQL não foram alterados. Se o armazenamento do visualizador falhar, a tela informa que o fato está somente na memória e exige exportar a cópia cifrada antes de fechar; não anuncia persistência concluída. Não há autorização de novas entradas, emissão ou assinatura offline. Quando o procedimento exigir contingência física, preserve/anexe o documento e sua origem real; não crie emissão digital retroativa fictícia.

O visualizador autônomo foi implementado e suas funções de proteção/fila possuem testes. A abertura `file://`, o armazenamento local, o comportamento de download e a operação sem rede precisam ser verificados no navegador/dispositivo efetivo antes do uso de campo. O aplicativo não declara ter acionado resgate: use o canal previsto e obtenha confirmação real.

## Dependências para ativação operacional

O código e o schema não concluem estes marcos externos. Antes da ativação, registre evidência verificável de:

1. **Responsabilidade técnica e procedimento.** Espaços, checklists, critérios de agentes/unidades/limites, qualificações, monitoramento contínuo, validade das avaliações, resgate, dispositivo/área classificada, prorrogação, encerramento e contingência aprovados pelo responsável designado. Publique modelo/versionamento e mantenha escopo/vigência da aprovação.
2. **Provedor ICP-Brasil real.** Escolher e contratar/configurar o serviço, credenciais exclusivamente no servidor, ambiente de homologação identificado e capacidade de verificar cadeia/certificado, signatário, finalidade, hash e conteúdo. O adaptador HTTP real desse provedor ainda não foi implementado/configurado no projeto.
3. **Identificação individual externa.** Implementar jornada restrita de signatário sem login Nexus, expiração/revogação, verificação própria de identidade e vínculo ao ato. Não conceder acesso geral à organização e não permitir que a conta compartilhada assine pela equipe.
4. **Callbacks e artefatos.** Expor transporte autenticado do provedor, validar assinatura/autenticidade do callback, vincular IDs e conteúdo esperado, deduplicar repetições e rejeitar identidade/versão divergentes. Baixar/verificar o original realmente assinado, confirmar seu hash privado e ligá-lo à revisão antes da emissão. Teste simulado não prova essa integração.
5. **Aditamento e retificação.** Implementar e validar o adaptador certificado dos aditamentos antes de permitir prorrogação; configurar e aprovar os critérios do procedimento de retificação implementado, validar a designação/independência do decisor e executar os cenários reais de correção antes do uso. Os bloqueios atuais precisam ser preservados enquanto esses procedimentos estiverem ausentes.
6. **Disponibilidade e retenção.** Comprovar Storage privado, backups, recuperação e guarda de PETs emitidas por pelo menos cinco anos, originais certificados e acervo relacionado; validar pacote local/contingência no equipamento autorizado ao ambiente de uso.
7. **Aceite em homologação.** Executar o fluxo real com identidades e documentos do provedor de homologação, entrada/saída, falha de assinatura após saída, reconexão, contingência, PDF/artefatos, autorização e retenção. Manter separados dados de demonstração, validação SQL, migração aplicada e evidência ponta a ponta.

Enquanto esses marcos não estiverem comprovados, o sistema oferece a preparação rastreável e os recortes verificáveis, e informa **Integração não configurada** na liberação. Não existe certificação operacional simulada na aplicação.
