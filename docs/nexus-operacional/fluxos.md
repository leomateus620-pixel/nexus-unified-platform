# Fluxos implementados e continuidade

## Estudos técnicos

Cliente/unidade → estudo em elaboração → método e fontes configuradas → conteúdo/perigos/medidas/evidências → submissão imutável → decisão do revisor. Devolução reabre a elaboração preservando a submissão anterior; novo envio produz outra. Aprovação mantém snapshot/hash e nova revisão parte da anterior sem reescrevê-la. Substituição é registrada separadamente.

Uma medida da revisão aprovada vigente pode liberar ou vincular ação operacional, com chave por linhagem entre revisões. A equipe acessa a instrução liberada e o comando normal da ação, sem ganhar acesso ao estudo privado. `/seguranca?acao=<id>` abre o registro correto; transição fixa a versão ao abrir o formulário, e recarregar explicitamente mantém a justificativa.

Levantamento de origem abre a revisão exata. O vínculo de PE abre seu acervo e identifica a versão/hash usada. Somente versões com IDs de contexto congelados verificáveis podem fundamentar o estudo; versões antigas continuam preservadas e podem dar origem a nova revisão conferida. Documento emitido sem contexto verificável não é atribuído pelo estado atual da proposta.

PDF/dossiê, ativos e OS são consumidores posteriores ainda pendentes. Estudo aprovado é um registro profissional da aplicação, sem declaração automática de conformidade ou substituição de ART.

Checkpoint de 22/10/2026. As jornadas abaixo distinguem função disponível, base de backend e dependência ainda ausente. Resultado executado e ambiente ficam em `validacao.md`; não se deduz validação conectada da presença de UI ou SQL.

## Cliente, unidade e contato

1. Usuário com `editar_cadastro` abre Clientes, pesquisa e filtra situação; lista é paginada no servidor. Busca, página e cliente selecionado ficam no recorte da URL.
2. Cadastra cliente preservando nome/identificador informados. O banco normaliza o identificador para detectar duplicidade concorrente sem mesclar por semelhança.
3. Na ficha, cadastra unidade do cliente e contato com unidade opcional. Servidor/banco rejeitam unidade de outro cliente ou organização.
4. Edita por formulário com labels, validação por campo e resumo acessível. A gravação envia versão e chave idempotente; recarga reencontra os registros.
5. Arquiva ou reativa com motivo. Novo cadastro/seleção respeita situação dos pais, preservando referências históricas e trilha gerada no banco.

Se outra sessão editar, `expected_version` rejeita sobrescrita. O preenchimento permanece; o usuário pode comparar/recarregar o registro atual explicitamente e repetir. Erro de consulta exibe recuperação, separado do estado vazio com ação de cadastro. Troca de ficha preserva recorte. Abandonar formulário alterado solicita decisão; gravação pendente impede fechar por acidente.

As abas de projetos, ativos, serviços, inspeções e documentos integrados ainda dependem dos fluxos respectivos. O histórico atual é de alterações reais de cadastro; não é preenchido com documentos ou eventos fictícios.

## Pessoa operacional e ações

Pessoa pode ser cadastrada sem login. Nome, vínculo, função e contatos profissionais são suficientes para iniciar o cadastro; login é associação posterior com membership existente. Gestor pode editar/arquivar com controle de versão. Usuário sem gestão recebe somente sua ficha autorizada. Formulários preservam dados em erro e conflito; lista abre ficha com foco/rolagem no layout móvel.

Equipes, vigências, competências e qualificações têm comandos SQL reais, mas a experiência completa de gestão dessas entidades ainda não foi entregue. Conferência de qualificação segue `enviada → em_conferencia → validada`; revogação exige motivo. A validade é considerada nas reservas, sem conceder papel ou diagnóstico médico.

Uma ação tem um responsável principal, colaboradores, prazo sem horário obrigatório e prioridade. O fluxo atual é `aberta → em_execucao → aguardando_verificacao → concluida`. A etapa de conclusão exige capacidade de revisão; quando a política exige verificação independente, o responsável não pode verificar a própria execução. Devolver uma ação exige correção preservada no histórico; cancelamento requer gestão e motivo. Só o comando canônico executa transições.

Responsável/gestor registra resultado e anexa evidência antes de enviar para verificação. Colaborador não recebe botão de transição para uma operação que o servidor negará. Conflito de versão permite recarregar a mesma ação por ID, sem perder a justificativa preenchida.

O menu `/seguranca` está apresentado como **Ações operacionais** neste checkpoint. Não existe ainda fluxo completo de ocorrência, investigação, achado de inspeção ou OS corretiva; a ação será a identidade reutilizada por esses domínios.

## Arquivos de pessoas, ações, qualificações e engenharia

1. Autor autorizado prepara metadado `pendente` com chave estável, MIME, tamanho e SHA-256 do original. Token permite envio sem sobrescrita.
2. Browser envia ao bucket privado, com progresso/erro visível. Upload externo não é tratado como parte da transação do banco.
3. Confirmação revalida pai, autor e estado; servidor baixa e verifica bytes, tamanho, MIME e hash; comando privilegiado confirma o vínculo.
4. UI só apresenta arquivo confirmado depois dessa confirmação real. Download exige nova autorização e URL temporária de 60 segundos.

Falha antes do envio permite selecionar o mesmo original e retomar. Falha de resposta depois do armazenamento pode ser resolvida por **Reverificar armazenamento**, sem cadastrar outro arquivo. Repetir preparação relê o metadado atual para não regredir um arquivo já confirmado ao snapshot pendente. Mesmo ID não pode ser retomado com outro binário. Arquivo pendente de engenharia pode ser cancelado com motivo; arquivos históricos congelados permanecem. Cancelamento de pendência de anexo operacional ainda não possui comando público. Falta de credencial do servidor é dependência identificada, sem impedir edição interna do cadastro/modelo.

Limpeza automática de órfãos e confirmação de Storage com backend conectado permanecem limites a validar separadamente.

## Projetos de Engenharia

1. Criar acervo independente com cliente, unidade ou local descritivo, finalidade, responsável e visibilidade. Não cria proposta ou projeto operacional fictício.
2. Editar versão nativa documental: seções e parâmetros identificados, fontes e indicação de informação a confirmar. Salvar exige versão; alterações locais têm proteção de saída e desfazer/refazer limitado ao histórico da sessão.
3. Anexar originais privados à versão. Pendências de upload bloqueiam submissão/congelamento, evitando snapshot que declare arquivo inexistente.
4. Submeter revisão editorial; devolver com motivo ou congelar snapshot contendo contexto, conteúdo e manifesto dos originais. Versão congelada permanece imutável.
5. Criar nova versão a partir de uma congelada ou experimentar cenário separado. Comparação considera IDs estáveis. Promover cenário gera novo rascunho, preservando a fonte; definir versão vigente é comando explícito.
6. Exportar representação JSON após autorização atual. O arquivo importado/original permanece independente do modelo editável.

Não há extração OCR/IA, sugestões técnicas automáticas, três famílias geométricas, editor 3D próprio ou emissão de PDF implementados. Congelamento editorial não declara validação profissional, conformidade, ART ou emissão técnica. Cenas existentes não são reaproveitadas como modelo mutável deste editor.

## Fundação temporal e notificações

Backend permite evento independente ou visita de uma ação existente, com responsável e participantes reais. Salvar rascunho não publica reserva. Publicação/reagendamento usa o mesmo comando, valida pessoas, competências, indisponibilidades e conflitos sob locks por recurso. Instantes têm timezone explícito e datas de dia inteiro são armazenadas separadamente. Confirmação de participante não conclui ação nem evento.

Evento segue `rascunho → publicado → em_andamento → concluido`, com cancelamento justificado. Cancelamento libera reservas futuras e preserva participantes anteriores, revisões e origem. Troca de participante encerra vínculo anterior em vez de apagar a pessoa histórica. Evento não executa UPDATE direto no estado da ação.

Mudança de estado, snapshot e evento da outbox entram na mesma transação. O job processa notificações internas com deduplicação e tentativas; visibilidade é reavaliada ao ler a origem. `pg_cron` pode executar com navegador fechado quando configurado; status indisponível fica registrado. Esse job ainda não implementa lembretes de proximidade/atraso, recorrência, manutenção ou geração de OS.

Não há menu `/agenda-equipe` funcional neste checkpoint, nem integração com veículos, ferramentas ou domínios ainda ausentes. Essa fundação não substitui os cenários finais de aceite da Agenda.

## Administração de acesso

Admin vincula um UUID de conta Auth existente, atribui papel e pode associar pessoa ativa da organização. Não pesquisa diretório global de usuários. Servidor não simula convite enviado. Comando permite alterar coordenação e desligar; proteção de último administrador vale também para SQL direto e operações concorrentes.

Desligamento preserva pessoa, histórico e autoria, retira papéis/capacidade e login associado. Novas requisições são negadas por membership; UI revalida contexto e limpa caches em perda de acesso. Transferência de atividades futuras e convites por e-mail ainda não estão entregues.

## Jornadas que continuam pendentes

Levantamento aprovado e adoção no dimensionamento; estudo técnico profissional; planejamento/encerramento operacional de projeto; estoque/reservas físicas; OS, horas e RDO; ativos instalados; checklist/inspeção/achado; investigação de ocorrência; manutenção; logística; títulos/baixas/apropriação; documentação técnica/PDF/dossiê; relatórios e dashboard operacionais; Agenda completa. Seus contratos não devem ser simulados com registros genéricos ou um cadastro paralelo.

## Levantamento aprovado → dimensionamento editável

Criar com cliente/unidade/responsável → programar → iniciar coleta por ponto → salvar medidas e confirmar fotos privadas → enviar à revisão → devolver com pendências ou aprovar com snapshot profissional. Nova revisão preserva a anterior e exige nova conferência.

Na revisão aprovada, escolher medida e sistema em proposta rascunho do mesmo cliente/unidade → comparar valor/origem/componentes no servidor → adotar com hash/versionamento → abrir dimensionamento de destino e recalcular no motor existente. Retry não duplica adoção; estimativa/3D e revisão comercial emitida são rejeitados. Aprovação do levantamento não faz aceite comercial nem modifica orçamento automaticamente.

O período previsto ainda não gera visita/reserva na Agenda; PDF/dossiê e integração com estudo técnico serão conectados nas respectivas etapas. Esses efeitos não são simulados.
