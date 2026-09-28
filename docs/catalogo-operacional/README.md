# NEXUS — Catálogo Operacional

Base conferida: `5286881c4133c3d123812226b20081d67bc61c07` (`main` e `origin/main`). Checkout limpo antes da branch `codex/nexus-catalogo-operacional`. As mudanças recentes de bloqueios OC/OP são parte da base e não serão revertidas.

## Matriz de preservação

| Tela | Objeto / visualização | Editor / ações preservadas | Persistência |
| --- | --- | --- | --- |
| Itens comerciais | Componentes da revisão em catálogo | Modalidade, fornecedor, custo com justificativa, memória, filtro, seleção, lote, colagem | Rascunho de `revisao_componentes`; custo recalcula |
| Dimensionamento | Sistemas e composição | Identificação, tipo, metragem, trechos, adicionar, duplicar, excluir, colar, override com justificativa | Rascunho de sistemas/overrides; motor canônico |
| Orçamento | Sistemas ou componentes calculados | Agrupamento, recálculo, recursos e resultado interno | Leitura de `totais`, sem novo motor |
| Compras | Demandas de compra/terceirização | Atualizar demanda, gerar ordens e abrir OC | Ações e estados existentes |
| Produção | Demandas de fabricação | Atualizar demanda, gerar ordens e abrir OP | Ações e estados existentes |
| Resumo | Documento e painel de textos | Cinco textos, impressão, emissão, aceite, recusa, documentos imutáveis | Controle de versão e transições existentes |
| Parâmetros | Quatro grupos | 22 campos, unidades, validação e autosave | Parâmetros da revisão, não globais |
| Histórico | Revisões formais e salvamentos | Nova revisão com motivo, antes/depois e logs técnicos recolhidos | Checkpoint atômico, separado de cálculo |

## Evidência

Capturas e medições do laboratório usam JSX e hooks da aplicação com fronteiras de rede substituídas em `tests/ui`. Fixtures ficam exclusivamente em testes. Não representam registros reais nem validação da autenticação de produção. Ensaios SQL devem aplicar as migrations reais em PostgreSQL isolado; nenhum schema de produção será modificado nesta entrega.

## Invariantes

URLs, parâmetros de rota, guards, motor, precisão, estados documentais e condições de OC/OP permanecem. Nenhum arquivo de CAD, Trevisan ou Mapas 3D faz parte do escopo. Revisão documental e versão de checkpoint são conceitos distintos.

## Implementação entregue

O commit `2bd3483` substitui as estruturas principais de planilha nas oito etapas. `46ca356` contém a extensão funcional de salvamento, sua migration e testes. O commit `480f819` contém os ajustes de reflow, diálogos e testes finais; as evidências acompanham a documentação, sem reescrever os anteriores.

`ui/ObjectCards.tsx` contém as primitivas semânticas e as composições específicas de sistema, compra, produção e revisão. `ProductComponentCard` e `SaveEventCard` têm composições próprias. A coleção usa lista/artigo, não roles de tabela. Componentes e sistemas carregam mais 48 objetos por ação; busca e seleção abrangem o conjunto completo, com aplicação em lote limitada à interseção entre seleção e filtro atual.

O inspetor mede o container: lado a lado a partir de 920 px úteis, modal opaco abaixo disso e tela inteira no celular. Há uma única instância editável. Escape, ciclo de Tab modal, retorno ao acionador e preservação de scroll são exercitados. No painel lado a lado não há aprisionamento de foco.

Os tokens OKLCH ficam restritos à proposta e aos detalhes OC/OP. O tema escuro escolhido continua respeitado. Mantidas as fontes existentes Barlow/Saira, sem outra dependência. Superfícies, campos e menus são opacos; seleção tem marcador textual. Compras e produção mantêm ações reais, condições e estados; não existe movimentação por arrastar. A única tabela nas oito etapas fica no documento de Resumo, cuja fonte histórica permanece a existente.

No notebook 1366×768, o contexto começa em 52 px, a navegação termina em 158 px e a área de trabalho começa em 168 px. Os primeiros cards de itens/sistemas começam em 224/220 px, após a faixa de ferramentas. Portanto, a meta de 180 px é atendida pela área útil, **não pela borda do primeiro card**. Orçamento apresenta os totais e pendências antes da coleção; esses valores continuam explícitos. Não foram usados deslocamentos negativos para encobrir cabeçalhos.

## Contrato de salvamento

1. Digitação é trabalho local. Blur e os debounces existentes sincronizam o **rascunho**. O feedback global distingue campos locais, sincronização, rascunho no servidor, consolidação, confirmação e erro/conflito. Justificativa aberta não é tratada como alteração concluída.
2. **Salvar proposta** captura os formulários válidos, conclui os trabalhos já enfileirados e cancela o recálculo adiado redundante. Uma fila por revisão impede ultrapassagem. Novas edições entram depois do checkpoint capturado; o retorno não remonta campos nem apaga o que foi digitado enquanto aguardava.
3. O servidor autentica a organização e a ação existente `editar_revisao`. `capturar_revisao` lê snapshot e versões sob lock; o mesmo motor canônico calcula fora da transação longa. `concluir_revisao` adquire novamente o lock, compara versões e snapshot com o banco e rejeita concorrência.
4. Persistência de composição/resultado, execução do cálculo, checkpoint, evento e resposta idempotente ocorre em **uma transação PostgreSQL**. Não se trata de uma sequência de inserts do navegador. Falha de auditoria desfaz essa consolidação; rascunhos já sincronizados continuam no banco e a interface não anuncia confirmação.
5. `proposta_rascunho_autores` captura usuários autenticados das alterações. O evento separa quem consolidou dos autores dos campos. Valores antes/depois vêm de snapshots verificados pelo servidor. Nomes de fornecedores são guardados junto aos snapshots, sem reescrever seus IDs.
6. Cada diferença efetiva entre checkpoints conta uma vez. Reverter ao inicial, navegar, selecionar, filtrar e recalcular não cria edição comercial. Parâmetros e textos são objetos próprios. Valores padrão usados para exibir parâmetros legados incompletos só são persistidos se efetivamente editados. Quantidades calculadas, timestamps, IDs e remoções derivadas de composição não inflam campos manuais. Justificativas acompanham as diferenças.
7. O total anterior é o do checkpoint confirmado, não o de um recálculo intermediário. Quando indisponível, aparece como indisponível. Resultados calculados ficam separados das diferenças manuais.
8. A mesma chave UUID retorna a mesma resposta, inclusive após perda da confirmação. Clique duplo é bloqueado na fila. Uma rejeição definitiva permite nova tentativa com outra operação; erro de transporte conserva a chave anterior.
9. Custos, margens, diferenças, impactos e contadores do evento exigem a permissão de custos na UI, no servidor e na RLS. Os logs legados permanecem, com limitação explícita de autoria/diffs. Execuções de cálculo são detalhes técnicos recolhidos. O histórico confirmado carrega páginas de 50, sem limite total artificial.
10. Checkpoint não emite, aceita ou cria revisão documental. Triggers de documentos emitidos e todas as transições operacionais anteriores continuam intactos. Alterar entrada marca o cálculo anterior como desatualizado até a confirmação de um novo cálculo.

### Ativação

A migration aditiva é `supabase/migrations/20260928010000_proposta_checkpoints.sql`. Ela estabelece o estado atual das revisões existentes como ponto inicial, **sem inventar eventos anteriores**. Aplicá-la no ambiente de homologação antes de publicar o frontend/servidor correspondente. A versão antiga do backend não deve ficar gravando cálculos em paralelo depois da ativação do contrato novo. O banco de produção não foi acessado nem alterado nesta entrega.

As RPCs mantêm o mesmo perímetro de autorização de edição da revisão; o motor TypeScript fica no servidor da aplicação. Os testes SQL exercitam atomicidade e autorização, usando resultados calculados sintéticos próprios de teste. Não são uma prova de integridade criptográfica do motor contra um cliente autorizado a escrever no banco.

## Verificação e limites

- Typecheck e build de produção passaram.
- 27 testes de orçamento, autorização, importação e fila passaram. O arquivo do motor não mudou.
- PostgreSQL 17 isolado: 25 cenários existentes, 24 verificações de checkpoint e um ensaio de dez sessões simultâneas passaram. Foram testados 5 campos/3 objetos/1 evento, reversão, no-op, autoria de outro usuário, conflitos, retry, falha de cálculo/auditoria, RLS, revisão emitida e impacto entre checkpoints.
- 16 testes industriais e 8 de Trevisan passaram; os arquivos desses módulos não mudaram.
- O comparador AST/hashes conserva rotas, 46 arquivos protegidos da base e as funções antigas de transição/documentos/ordens. As mudanças autorizadas de coordenação são enumeradas no relatório, não mascaradas como idênticas.
- ESLint do escopo: zero erros e um aviso existente de Fast Refresh em `Etapas.tsx`. O lint global continua falhando na base Windows: 21.276 erros nesta árvore, predominantemente CRLF/Prettier, além de um `prefer-const` preexistente fora do escopo. Não foi aplicada formatação global.
- Matriz visual: 320, 360, 390, 768, 1024, 1366, 1440 e 1920 px, incluindo 1366×768, nas oito etapas e nas telas de lista/OC/OP. Sem overflow horizontal da página. Doze cenários adicionais cobrem vazio, pendência, erro, conflito, restrição e documentos emitidos.
- O laboratório exercita componentes/handlers reais, mas substitui sessão, Router/Start e Supabase. Portanto, screenshots são capturas reais de navegador **com fixtures isoladas**, não fotografias de propostas de produção. Nenhum cadastro foi criado em produção.
- Zoom CSS 200%, viewport baixo como aproximação de teclado, contraste de tokens, foco e reduced motion são ensaios automatizados. Zoom nativo, leitor de tela, teclado virtual real, Safari/Android físicos e o fluxo autenticado completo no Supabase hospedado ainda precisam de homologação. Não há afirmação de conformidade WCAG integral.

Consulte [medição completa](PERFORMANCE.md), [galeria antes/depois](SCREENSHOTS.md) e [logs de validação](evidence/). As medições locais não incluem rede. O relatório registra regressões, além de melhorias.
