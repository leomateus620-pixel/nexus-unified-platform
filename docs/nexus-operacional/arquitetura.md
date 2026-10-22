# Arquitetura do checkpoint operacional

Estado em 22/10/2026. Este documento descreve a fundação e as primeiras jornadas implementadas. O escopo integral dos 24 menus está em `escopo.md`; tabelas ou contratos iniciais não equivalem à conclusão dos módulos dependentes.

## Aplicação e limites de domínio

A aplicação continua como monólito modular React/TanStack Start com um PostgreSQL/Supabase. Rotas de negócio ficam sob `_authenticated`; sessão e organização são resolvidas no browser, enquanto funções de servidor autenticadas e RLS autorizam cada leitura/escrita. Rotas públicas de mapas, Escada e demais experiências 3D preservam cenas, geometrias, assets e controles. Nenhum dado privado novo foi incorporado a esses assets.

| Domínio implementado   | Responsabilidade e fronteira                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso                 | Auth + `memberships` + `user_roles`; `user_capacidades` concede coordenação sem papel admin global                                                                          |
| Pessoas                | Pessoa operacional com login opcional; equipes, vigências, competências e qualificações têm comandos SQL próprios; a UI completa dessas últimas entidades continua pendente |
| Clientes               | Cadastro canônico de clientes, unidades e contatos; edição, arquivamento/reativação, histórico, busca paginada e conflitos                                                  |
| Ações                  | `acoes_operacionais` é a tarefa atribuível; conclusão, devolução e verificação seguem o comando do domínio; ainda não há módulo completo de ocorrências/investigações       |
| Arquivos               | `anexos` para pessoa/ação/qualificação e `pe_arquivos` para versão de engenharia; FKs explícitas e o mesmo bucket privado                                                   |
| Projetos de Engenharia | `pe_projetos`, versões e cenários documentais independentes de proposta e projeto operacional                                                                               |
| Tempo                  | Eventos, participantes, reservas de pessoas, indisponibilidades, qualificação e outbox têm fundação SQL; a Agenda Equipe ainda não possui sua experiência final             |
| Administração          | Vínculo de conta Auth existente, papéis, coordenação e desligamento; proteção concorrente do último administrador; não simula convite por e-mail                            |

Produtos, composição, `sistema_componentes`, motores de orçamento/custo, geração de códigos, revisões/documentos comerciais emitidos e geração idempotente de OC/OP permanecem canônicos. O novo acervo não calcula orçamento, não gera obra e não altera o catálogo ou dimensões dos mapas.

## Escritas, concorrência e autorização

Schemas Zod validam contratos de servidor. Comandos SQL produzem autoria e histórico, validam estados e usam recibos idempotentes por organização e ator. A mesma chave com payload divergente é rejeitada; recibos não são uma tabela pública de snapshots acessível após revogação. Edições exigem `expected_version`; conflito conserva o preenchimento local para comparar/recarregar.

RLS protege todas as novas tabelas expostas. Organização, autor e vínculos centrais são imutáveis ou validados por FKs compostas/gatilhos. `pode`, `has_org_role` e `can_see_costs` também exigem membership atual. Papéis desconhecidos não recebem acesso por omissão. Coordenação concede apenas os menus operacionais explícitos e não concede custos, administração, revisão técnica ou acesso a Projetos de Engenharia.

Navegação e acesso direto usam a mesma matriz e capacidades. A sessão revalida organização/papéis/capacidades em foco e a cada 30 segundos; alterações cancelam requests e retiram dados/URLs temporárias do cache anterior. Essa revalidação de interface não substitui a autorização por request no banco/servidor.

## Acervo nativo e originais

`pe_executar` é o único comando de escrita do acervo. A linha do projeto serializa sequência e promoção de cenário; versão e cenário têm controle de concorrência próprio. Cenário nasce de uma versão congelada, conserva `base_id`, e sua promoção cria outra versão e encerra o cenário de forma atômica. A baseline anterior permanece intacta. Descarte preserva o registro e exige motivo.

O modelo nativo atual é documental: seções e parâmetros com IDs estáveis, valor original, unidade, natureza, conferência e fonte. Não executa código livre nem cálculos estruturais. Texto é renderizado como texto pelo React. Revisão e congelamento são controles editoriais internos, sem equivalência com aprovação profissional ou emissão técnica. Congelamento fixa conteúdo/contexto e manifesto de arquivos confirmados, com SHA-256; nova revisão copia o conteúdo para outro registro com pai explícito.

Upload é uma operação separada da transação PostgreSQL: staging → upload privado sem upsert → conferência server-side → vínculo confirmado. O servidor autoriza o pai pelo cliente do usuário antes de carregar service role, baixa os bytes e verifica tamanho, assinatura de formato e SHA-256. A RPC privilegiada PE revalida autor, membership, papel, escopo e estado. O limite inicial é 20 MiB para PDF/PNG/JPEG/WebP. A verificação de assinatura identifica formato; não é OCR, interpretação profissional ou serviço antimalware.

Metadados e binários confirmados não podem ser sobrescritos/apagados pelas sessões da aplicação. Downloads exigem acesso atual ao pai e geram URL de 60 segundos. Uma URL já assinada pode permanecer utilizável até expirar; o projeto não oferece revogação instantânea dessa URL. Tokens de upload emitidos antes de cancelamento/revogação podem deixar objetos órfãos, sem autorizar confirmação nem modificação de snapshot. Limpeza com retenção e janela segura continua pendente.

Revisão final identificou janelas na confirmação privilegiada: anexos operacionais de `0015` necessitam revalidar papel/escopo do autor sob lock; em `0017`, um retry já vinculado retornava antes da segunda revalidação após esperar o lock. A correção append-only `0020` acrescenta travas de autorização e revalida o escopo após esperas antes de qualquer retry ou confirmação nos dois fluxos. Sua revisão estática não identificou ampliação de permissão. A rodada local de 39 migrações passou, incluindo 12 assertions de autorização e cinco disputas reais entre sessões para papel, capacidade, reatribuição de ação e confirmação/retry de PE restrito. O estado efetivo de aplicação compartilhada deve ser conferido em `migracoes.md` e `validacao.md`; testes locais não comprovam Auth/Storage HTTP remoto. As migrações já aplicadas permanecem intactas.

## Backend temporal e processamento

Eventos independentes ou vinculados a ações usam participantes canônicos e reservas transacionais de pessoas com intervalos semiabertos. A fundação não implementa ainda todas as origens propostas, veículos/ferramentas ou recorrências. Outbox e notificações internas são persistidas; worker idempotente permite reprocessamento. `0018` instala `pg_cron` quando disponível e agenda notificações a cada minuto; o resumo autorizado de jobs evita payloads/dados de outros tenants.

No projeto confirmado foram aplicadas `0012`–`0020` (39 entradas no ledger), bucket privado e disparo automático com fila vazia. Isso prova schema/scheduler no alcance documentado, sem comprovar jornada autenticada completa, arquivos binários HTTP ou notificação de atividade real.

## Tipos e próximos contratos

Não foi executada regeneração de `src/integrations/supabase/types.ts` nesta etapa, nem alteração manual do arquivo. As funções novas usam contratos Zod e adaptadores tipados de domínio sobre o cliente Supabase; os casts do cliente não comprovam paridade do schema gerado. A regeneração pelo mecanismo do projeto/conector e nova verificação de tipos são pendências explícitas após reconciliar o schema. Não foi localizado script dedicado de regeneração em `package.json`.

Continuam abertos: OCR/extração por página/imagem, provedor de IA do aplicativo, sugestões com evidência, PDF/dossiê emitido, editor geométrico/paramétrico e 3D próprio de engenharia, Agenda UI/recorrência/todas as origens e as jornadas de Levantamentos, estudos técnicos, OS/RDO, ativos, inspeções, ocorrências, manutenção, estoque/ferramentas, logística e financeiro operacional. Os contratos compartilhados e a matriz de aceite orientam a continuação sem cadastros paralelos.
