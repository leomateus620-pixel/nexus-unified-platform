# Permissões efetivamente implementadas

## Estudos técnicos — checkpoint 41

Leitura exige capacidade técnica e escopo da ficha, além da autorização atual de **todas** as fontes já vinculadas, inclusive históricas/desativadas. Coordenação operacional e Campo não recebem a análise profissional inteira. A ação liberada usa a entidade canônica e contém somente instrução explicitamente redigida para a execução.

Publicação de método, submissão e aprovação conferem pessoa ativa e registro profissional declarado. Aprovar/devolver exige o revisor designado; a política pode exigir independência do responsável. Admin não substitui essa identidade profissional. Os comandos revalidam autorização após locks e antes de retornar retries, sem permitir DML direto do browser nas 13 tabelas novas.

Revisões aprovadas, submissões/decisões, arquivos vinculados e relações de substituição são preservados. Downloads reautorizam o pai e expiram em 60 segundos; um link já emitido pode funcionar até expirar. Interface refaz consultas sensíveis no foco/intervalo e remove conteúdo técnico ao receber negação; falha de rede mantém o rascunho recuperável. Testes distinguem esses dois estados.

As provas SQL são locais com tenants/perfis isolados; o conectado foi conferido por catálogo, RLS, grants e policies. Não há prova de sessão Auth/Storage HTTP remoto. A revisão futura de suprimentos identificou `aquisicoes` com SELECT por membership contendo custos; isso exige saneamento antes de afirmar proteção financeira global. A nova projeção operacional não é justificativa para manter um endpoint financeiro legado exposto.

Checkpoint local de 22/10/2026. Este documento descreve o código e as migrações `0012`–`0020`; aplicação no projeto conectado e resultados executados pertencem a `migracoes.md` e `validacao.md`. Não certifica todos os módulos previstos no escopo.

## Identidade, navegação e comandos

`auth.users` identifica o usuário; `memberships` concede vínculo com a organização; `user_roles` contém seus papéis nessa organização. `pessoas` identifica a pessoa operacional, com login opcional. Cadastrar uma pessoa não cria usuário nem papel. A organização nunca é deduzida do cliente.

`ACESSO_POR_PAPEL`, em `src/lib/nexus-nav.ts`, controla menus, rotas e etapas da proposta. O gate autenticado consulta essa mesma fonte. Papéis ausentes ou desconhecidos não concedem acesso; em uma combinação de papéis, somente os conhecidos participam da união. A correspondência exige fronteira de caminho: `/projetos` não concede `/projetos-engenharia`. Rotas públicas de demonstração 3D continuam públicas e não carregam novos registros privados.

| Papel      | Menus concedidos neste checkpoint                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin      | Lista explícita dos 19 menus existentes, incluindo Pessoas, Ações e Projetos de Engenharia; não inclui menus futuros automaticamente                                        |
| comercial  | Dashboard, Clientes, Comercial, Produtos                                                                                                                                    |
| engenharia | Dashboard, Clientes, Comercial, Produtos, Levantamentos, Engenharia, Projetos de Engenharia, Mapas 3D, Escada, Projetos, Execução, Documentação, Inspeções, Pessoas e Ações |
| compras    | Dashboard, Clientes, Produtos, Compras, Projetos                                                                                                                            |
| financeiro | Dashboard, Financeiro, Relatórios, Projetos                                                                                                                                 |
| campo      | Dashboard, Execução, Documentação, Inspeções, Pessoas e Ações                                                                                                               |

Engenharia mantém acesso direto às ordens de compra/produção abertas a partir da proposta; as etapas `resumo-executivo`, `parametros` e `historico` permanecem ocultas nesse papel. A existência de menu não declara o fluxo completo implementado: Execução, Inspeções e outros ainda têm lacunas registradas no inventário.

As ações comerciais existentes seguem `MATRIZ` em `src/features/auth/autorizacao.ts` e `public.pode()`. A fundação usa `public.operacao_pode()` para as ações operacionais. As duas funções SQL exigem usuário autenticado e membership atual. A matriz de interface melhora a apresentação; autorização definitiva e RLS ficam no banco.

| Ação                                                   | Papéis além de admin                       | Capacidade adicional |
| ------------------------------------------------------ | ------------------------------------------ | -------------------- |
| `editar_cadastro`                                      | comercial, engenharia, compras             | —                    |
| `ver_custos`                                           | comercial, engenharia, compras, financeiro | —                    |
| `ver_equipe`, `ver_operacao`                           | engenharia, compras, campo                 | `coordenar_operacao` |
| `gerir_equipe`, `gerir_operacao`                       | engenharia                                 | `coordenar_operacao` |
| `revisar_operacao`, `gerir_documentos`                 | engenharia                                 | —                    |
| `ver_projetos_engenharia`, `gerir_projetos_engenharia` | engenharia                                 | —                    |

`user_capacidades` acrescenta coordenação operacional ao vínculo, sem papel admin e sem capacidade de revisão técnica. A capacidade explícita acrescenta Dashboard, Pessoas, Ações e Execução à navegação; não concede Configurações, custos ou Projetos de Engenharia. Não substitui qualificação profissional. A tela consulta capacidades atuais pelo servidor; não deriva esses poderes apenas de um nome de papel.

## Escopo dos registros

| Registros                                                       | Restrição implementada                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pessoas, qualificações, indisponibilidades e vínculos de equipe | Gestor de equipe lê o escopo organizacional; demais usuários autorizados leem os próprios registros ligados à pessoa ativa                 |
| Equipes e competências                                          | Leitura por `ver_equipe`; comandos de gestão exigem `gerir_equipe`                                                                         |
| Ações                                                           | Gestor operacional ou pessoa ativa responsável/colaboradora; conhecer o UUID não concede acesso                                            |
| Transições de ação                                              | Execução por responsável/gestor; conclusão exige revisão e, quando configurado, pessoa diferente do responsável; cancelamento exige gestão |
| Anexos                                                          | Acesso herdado de pessoa, qualificação ou ação por FK explícita; somente um desses pais por arquivo                                        |
| Clientes, unidades e contatos                                   | Membership da organização para consulta; `editar_cadastro` para comandos; filho deve pertencer ao cliente e à organização                  |
| Projetos de Engenharia                                          | Capacidade de leitura mais visibilidade organizacional, autoria, responsabilidade ou admin, conforme `pe_ler_projeto()`                    |
| Versões, cenários, eventos e arquivos de engenharia             | Herdam a autorização do projeto; não têm cadastro de acesso paralelo                                                                       |
| Agenda e participantes                                          | Gestor ou participante/responsável atual; origem de ação exige também acesso atual à ação                                                  |
| Notificações                                                    | Apenas destinatário autenticado que ainda possa ler o evento e sua origem                                                                  |
| Recibos idempotentes e outbox                                   | Sem leitura direta por sessão de aplicação; comandos verificam permissão antes de retornar resultado                                       |

Os novos vínculos centrais usam chaves compostas com organização. As tabelas novas expostas habilitam RLS; escritas passam por comandos autenticados. Funções privilegiadas têm `search_path` fixo, nomes qualificados e grants deliberados. Históricos oficiais são produzidos por banco/servidor, sem INSERT de aplicação.

## Arquivos privados

O bucket `nexus-operacional` é privado. Políticas consultam metadado e pai autorizado; o prefixo do caminho não é a autorização. Upload exige autor, permissão e estado editável; arquivos confirmados não podem ser sobrescritos. O servidor confere bytes, tamanho, MIME e SHA-256 antes da confirmação privilegiada. A service role é importada somente no servidor, depois da autorização pelo cliente/RLS e com nova validação antes da confirmação. A `0020` revalida no banco o escopo atual do autor sob locks de acesso/pai, inclusive em retry já confirmado; predicados de autor explícito não têm RPC concedida à aplicação. `operacao_pode` delega ao predicado vigente com `auth.uid()`.

Downloads revalidam o registro e emitem URL por 60 segundos. Uma URL já emitida pode continuar válida até expirar; revogação de papel impede novas emissões, mas não desfaz retroativamente essa credencial temporária. Confirmação de upload depende de `SUPABASE_SERVICE_ROLE_KEY` no servidor. Sua ausência produz erro específico e mantém o restante do módulo utilizável.

## Administração e revogação

`administrar_vinculo_operacional` exige admin e repete essa verificação dentro de lock da organização. Vincula conta Auth existente por UUID informado, sem listar usuários globais e sem simular convite por e-mail. Pode gerir papéis, capacidade de coordenação e desligamento. Desligar remove papéis, desassocia login da pessoa e remove membership; preserva pessoa e autoria histórica.

Triggers impedem remover o último administrador ativo, inclusive por escrita direta e concorrente. UPDATE de membership não pode trocar sua organização ou usuário. Não há novo fluxo de convite externo, recuperação de senha ou transferência automática de trabalhos futuros.

`useOrg` usa a matriz para `canSeeCosts`, sem conceder custos por ausência de papel de campo. Mudança de usuário, organização, papéis ou perda de contexto cancela e remove caches sensíveis. Revalidação ocorre a cada 30 segundos e no foco; autorização SQL é verificada por requisição, independentemente desse intervalo. A consulta de capacidades operacionais também limpa caches de pessoas, ações e anexos quando a capacidade muda. Componentes de ficha são remontados para descartar seleção local obsoleta.

## Evidência e alcance

Testes relevantes: `tests/nexus-nav.test.ts`, `tests/autorizacao.test.ts`, `tests/session-access.test.ts`, `tests/operacao-permissions.test.ts`, `tests/db/operacional.sql`, `tests/db/clientes-operacionais.sql` e cenários SQL de Agenda, arquivos, engenharia e administração inscritos nos runners. Testes incluem ausência/papel desconhecido, fronteiras de rota, conflito de payload, dois tenants, escrita por perfil sem capacidade e revogação. `validacao.md` registra quais foram efetivamente executados e em qual ambiente. UI com fixtures não comprova RLS ou Storage conectado.

## Levantamentos — checkpoint 40

Campo pode abrir `/levantamentos`, consultar/coletar somente os registros de sua responsabilidade e operar seus arquivos autorizados. Coordenação possui concessão explícita de navegação e gerencia contexto/programação. Busca de opções para cadastro exige gestão; não permite a um coletor enumerar toda a clientela ou pessoas.

`lev_ler`/RLS e comandos aplicam o pai/tenant. Aprovação e publicação de modelo exigem capacidade de revisão e pessoa ativa vinculada ao ator com registro profissional declarado. Admin isoladamente não comprova esse requisito. Locks estabilizam membership, papéis, capacidades e pessoa antes de decisões/replays; testes locais exercitam revogação durante espera. Custos não integram esses DTOs.

Matriz reaproveitada: `ver_operacao`, `gerir_operacao`, `revisar_operacao`; nenhum papel novo. Concessões de navegação em `ACESSO_POR_PAPEL`/capacidade são testadas junto do escopo SQL. Evidência de schema conectado e testes locais não substitui Auth/Storage HTTP remoto.
