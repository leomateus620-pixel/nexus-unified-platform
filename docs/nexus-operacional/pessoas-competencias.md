# Pessoas e Competências — qualidade da identidade operacional

## Alcance do checkpoint44

Esta fatia corrige consulta, edição e navegação de pessoas. Reutiliza `pessoas`, `salvar_pessoa`, RLS e anexos canônicos; não cria cadastro de colaborador paralelo nem concede login/papel. Não acrescenta migração ou altera o banco conectado. Equipes, competências e qualificações permanecem com comandos SQL existentes e experiência completa ainda pendente.

## Auditoria Product Design

Inspeção de componentes reais no laboratório4182, com transporte isolado e dados de teste. Desktop1440×900; mobile390×845. A [lista desktop anterior](evidencias/pessoas/01-antes-lista-desktop.jpg) e a [lista posterior](evidencias/pessoas/04-depois-lista-desktop.jpg) têm o mesmo recorte de duas pessoas. A imagem mobile anterior foi capturada após selecionar a primeira linha, ainda sem identidade na URL; o refinamento mostra o retorno à lista e a seleção passa a ser persistida.

| Achado | Categoria | Impacto/frequência | Refinamento |
|---|---|---|---|
| Ficha guardava uma cópia da linha, sem consulta própria | Estrutural e privacidade | Alto/toda ficha | Consulta por organização e ID, com atualização e autorização atuais |
| Lista continuava mostrando cache depois de erro | Interação e privacidade | Alto/recuperação e revogação | Erro, vazio e resultado filtrado são distintos; negação fecha editor e arquivos |
| Função e vínculo ficavam fora da primeira vista mobile | Estrutural | Alto/toda consulta mobile | Lista resumida com nome, função e vínculo; tabela comparativa desktop |
| Busca/seleção/página existiam somente em memória | Interação | Médio/navegação e recarga | Recorte validado na URL, retorno e histórico do browser |
| Formulário podia receber resposta de um contexto removido | Consistência | Alto/corrida de sessão | Resposta verifica a identidade da query de acesso e a geração do componente antes de atualizar cache |
| Contagem ausente virava zero no servidor | Informação | Médio/falha de transporte | Resposta incompleta é falha recuperável, sem inventar um total |

[Lista mobile refinada](evidencias/pessoas/03-depois-lista-mobile.jpg) e [ficha mobile](evidencias/pessoas/05-depois-ficha-mobile.jpg). O detalhe recebe prioridade no celular; voltar reapresenta o mesmo recorte. As capturas não comprovam dispositivo físico, teclado virtual, leitor de tela ou backend conectado.

## Contratos e comportamento

`listarPessoas` confere capacidade atual antes e depois da consulta, aplica RLS, busca escapada, paginação25 e ordenação nome/ID. `obterPessoa` consulta a linha autorizada por tenant/ID; ausência sob RLS e negação usam a mesma mensagem pública, sem indicar existência em outra organização.

`salvarPessoa` mantém o RPC e seu payload idempotente/versionado. Depois do efeito, relê a identidade sob autorização atual: retry não apresenta um snapshot antigo do recibo como estado atual. Isso não torna os múltiplos requests HTTP uma única transação; o comando SQL continua dono da escrita.

Query keys ficam sob `['pessoas',org,...]`, compartilhando a limpeza existente. Lista e ficha revalidam no foco e em30 segundos, sem retries automáticos. O formulário fixa sua versão ao abrir. Refetch não avança essa versão nem substitui o preenchimento. Comparação é explícita; recarregar campos adota a versão consultada por decisão do usuário.

Falha de rede conserva o rascunho. Negação na lista, ficha, comando ou comparação fecha o editor, oculta identidade/arquivos e oferece nova consulta autorizada. O guard de resposta tardia foi extraído para `operacao/continuation.ts`; Almoxarifado mantém seu contrato por reexport, sem outra implementação da regra.

## Evidência e continuidade

Passaram oito testes isolados de handler/domínio e quatro do guard compartilhado; a UI isolada passou18 layouts e oito comportamentos em360/390/768/1024/1366/1440. Estão cobertos recarga/retorno, versão fixa, erro de rede, negação de acesso e distinção de vazio/falha. Typecheck global, build, ESLint escopado e regressão de estrutura/formulários também passaram, com alcance em `validacao.md`.

Não houve fixture operacional no ambiente conectado. SQL/RLS existentes não foram alterados e esta fatia não comprova Auth/Storage HTTP conectado ou T35 completo. A próxima entrega funcional deve usar os RPCs reais de equipe/vigência e qualificação/evidência/conferência, sem apresentar cadastro de pessoa como competência validada. Disponibilidade ainda exige correção/cancelamento auditável; liderança temporal e política técnica versionada continuam dependências explícitas.
