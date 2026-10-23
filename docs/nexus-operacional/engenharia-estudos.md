# Engenharia — estudos técnicos

## Auditoria Product Design da experiência atual

22/10/2026. Rota real `/engenharia`, exibida no laboratório isolado `/?page=engenharia`. Navegador integrado, 1440×900 e 390×845 CSS px; fontes carregadas e largura conferida no DOM. [Desktop antes](evidencias/engenharia/01-antes-desktop.jpg) e [celular antes](evidencias/engenharia/02-antes-mobile.jpg). A sessão de laboratório não comprova Auth ou persistência conectada.

| Achado | Categoria | Impacto / frequência | Direção |
|---|---|---|---|
| Estudos técnicos não têm cadastro ou fluxo: aviso ocupa o conteúdo | Estrutural | Alto / toda apreciação, classificação ou memorial | Lista e ficha por cliente/unidade, método configurado e fontes autorizadas |
| Há acesso aos dimensionamentos e suas regras existentes | Padrão preservado | Alto / trabalho de engenharia comercial | Manter links e motores; separar estudo profissional de dimensionamento e de acervo editorial |
| Não existem controles de revisão/aprovação de estudos para avaliar | Interação não observável na baseline | Alto / elaboração e conferência | Rascunho, submissão imutável, devolução, nova revisão e decisão atribuída ao profissional |
| Cards atuais cabem no celular, mas o aviso não oferece próxima ação interna | Interação | Alto / início do trabalho | Ação de cadastro conforme permissão; estado vazio distinto de método ou fonte ausente |

Na baseline não havia estados de salvamento, erro ou conflito de estudos para observar. Essa lacuna era interna, sem depender de integração externa.

## Contrato implementado

Métodos, fontes bibliográficas e requisitos configurados/versionados, sem fórmulas ou limites normativos predefinidos. Revisões e decisões preservam o contexto e a autoria; aprovação editorial do acervo PE continua distinta de aprovação profissional. Referências a PE/documentos devem herdar a autorização atual da fonte, sem copiar conteúdo privado ou valores de proposta para a ficha técnica.

Esta página distingue a baseline da jornada implementada abaixo. A decisão de validar localmente permanece aplicável; não foram criados registros fictícios no banco operacional.

## Jornada do checkpoint 41

`/engenharia` mantém as ferramentas existentes e acrescenta lista pesquisável/paginada, ficha por cliente/unidade, identificação e revisões. A ficha separa conteúdo/método, perigos/medidas, fontes/arquivos e decisões. No celular, contexto e ferramentas secundárias recolhem para priorizar a elaboração. Filtros e registro aberto ficam na URL.

Um método é publicado por profissional autorizado, com fontes bibliográficas tipadas, edição, emissor, instruções e requisitos explícitos. Não há método, fórmula, tolerância ou periodicidade normativa embarcada como padrão. A elaboração permite informação pendente; a submissão aplica os bloqueios calculados pelo servidor. Cadastro de registro profissional é informação declarada, sem validação externa automática.

Submeter produz snapshot e hash. Devolução preserva a submissão; novo envio produz outra. A decisão exige o revisor profissional designado, e a política pode exigir independência. Aprovação congela a revisão; evolução abre outra e a substituição é uma relação persistida, sem reescrever a aprovação anterior. A emissão de PDF/dossiê pertence ao fluxo documental ainda pendente.

Perigos mantêm avaliação textual atribuída ao responsável, com medidas e justificativas. Uma medida pode gerar ou vincular a ação operacional canônica, uma vez por linhagem entre revisões. A instrução para a equipe começa vazia e exige liberação explícita; análise, fontes e anexos privados do estudo não são copiados para o campo. O vínculo abre `/seguranca?acao=<id>`, com consulta e autorização próprias.

Fontes operacionais usam FKs explícitas para levantamento aprovado, versão congelada do acervo PE e documento emitido. O acesso ao estudo intersecta as permissões **atuais de todas as fontes históricas**, inclusive desativadas. Falha de rede preserva o formulário; negação de acesso fecha os editores e oculta o conteúdo técnico armazenado em cache. Anexos revalidam o pai antes de enviar, confirmar ou baixar; veja [arquivos-estudos.md](arquivos-estudos.md).

## Contexto histórico das fontes

Nomes de empresa/unidade em um snapshot antigo não provam seus IDs. Não há backfill por semelhança de nome. A migração 0022 faz novas congelações PE preservarem os IDs canônicos no snapshot e seu hash; versões antigas continuam no acervo com arquivos/hashes intactos. Uma fonte PE sem contexto verificável fica indisponível para o estudo, com orientação para conferir o contexto e preparar uma nova revisão. O comando de congelamento mantém seus demais ramos e regras protegidos por comparação exata no teste de instalação.

Documentos comerciais emitidos sem IDs verificáveis no snapshot continuam preservados no domínio original. O contexto atual da proposta não é usado para atribuir retroativamente esses documentos a uma unidade. Sua utilização como fonte operacional depende de nova emissão contextual pelo domínio documental; o emissor comercial permanece preservado.

Passaram 56 cenários SQL, 32 de arquivos, 12 concorrências e 37 testes de domínio/handlers. A UI isolada cobriu 61 layouts em seis larguras e 12 comportamentos, além de três cenários da ação vinculada. Typecheck global e build passaram após a geração oficial de tipos. A migração 0022 foi aplicada e seus metadados conferidos com o manifesto 41; veja `engenharia/banco-validacao.md` e `validacao.md`.

Na revisão Product Design posterior, a lista foi capturada nas mesmas condições da baseline: [desktop](evidencias/engenharia/04-depois-lista-desktop.jpg) e [celular](evidencias/engenharia/03-depois-lista-mobile.jpg). A ficha foi examinada em [desktop](evidencias/engenharia/05-depois-perigo-desktop.jpg) e [celular](evidencias/engenharia/06-depois-perigo-mobile.jpg), incluindo a [região de medidas e arquivos](evidencias/engenharia/07-depois-medidas-mobile.jpg). O contexto recolhível preserva espaço; títulos/ações se reorganizam sem sobreposição. Foi removido um título de evidências duplicado. Os cenários automatizados verificam foco, erros recuperáveis e acesso revogado; não há certificação integral de acessibilidade.

Essas evidências não comprovam aprovação técnica de serviço real, dispositivo físico ou transporte Auth/Storage HTTP conectado. PDF/dossiê, consumidores de OS/ativos e medição de desempenho com carga representativa continuam pendentes. O módulo Engenharia não é declarado integralmente concluído.
