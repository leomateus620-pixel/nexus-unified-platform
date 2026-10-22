# Projetos de Engenharia: primeira jornada nativa

Esta entrega implementa autoria documental, originais privados e versionamento independente de proposta/obra. O escopo completo do prompt 24 permanece aberto nos pontos explicitados abaixo. Migrações preparadas: `drizzle/migrations/0014_projetos_engenharia.sql`, após a fundação operacional 0012 e os cadastros 0013, e `0017_pe_arquivos.sql` para o fluxo de originais. Aplicação remota e evidências executadas são registradas no documento geral de migrações/validação.

## Jornada implementada

1. Buscar cliente e pessoa nos cadastros canônicos. Selecionar unidade compatível ou descrever local ainda a confirmar.
2. Criar o projeto e V1 rascunho em uma transação idempotente, sem gerar proposta ou obra.
3. Editar seções e parâmetros com IDs estáveis, valor original, unidade, natureza, conferência e fonte. Valores são declarados; nenhum motor resistente ou preço paralelo é executado.
4. Salvar explicitamente com versão esperada. Enviar para revisão interna; devolver com motivo ou congelar conteúdo/snapshot/contexto com SHA-256.
5. Criar próxima versão a partir de uma congelada, conservando pai e original. Selecionar vigente explicitamente; congelar não define vigente por omissão.
6. Criar experimento separado da baseline. Salvar, comparar, desfazer/refazer localmente, promover para nova versão ou descartar mantendo histórico.
7. Exportar o modelo documental e manifesto JSON após revalidar acesso no servidor. Rascunho local não salvo tem identificação explícita e não leva hash de snapshot congelado.
8. Arquivar/reativar com motivo e controle de versão, preservando versões e eventos.
9. Anexar PDF/imagem de até 20 MiB ao rascunho, confirmar bytes no servidor, reencontrar e baixar o original autorizado. Retomar usa o mesmo arquivo/hash; reverificação recupera envio cujo resultado se perdeu; cancelamento de envio pendente preserva evento.

Congelamento é preservação editorial interna. Não comprova habilitação profissional, aprovação de engenharia, ART, conformidade, orçamento aceito ou autorização de execução.

## Objetos e integridade

| Objeto        | Responsabilidade e relações                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pe_projetos` | Cliente/unidade, responsável `pessoas`, local, título, acesso e seleção de vigente; identidade própria, sem dependência de `projetos` operacional |
| `pe_versoes`  | Sequência única por projeto, pai do mesmo projeto/tenant, elaboração/autor/revisão declarados, conteúdo tipado, estado, snapshot e hash           |
| `pe_cenarios` | Base congelada, modelo independente, versão concorrente, descarte e versão promovida do mesmo projeto                                             |
| `pe_eventos`  | Autor do servidor, comando, motivo, referências de projeto/versão/cenário e instante; sem escrita direta do browser                               |
| `pe_arquivos` | Originais privados por versão, com MIME/tamanho/hash/caminho e confirmação; usa o mesmo bucket `nexus-operacional`, sem sobrescrever confirmado   |

FKs compostas protegem os pais do domínio e o responsável. O gatilho do projeto confere organização do cliente e relação unidade/cliente. Gatilhos preservam organização, identidade, autoria e origem; congelados não podem ser editados/apagados. Somente RPC autorizada escreve; as tabelas expostas têm RLS e SELECT mínimo.

`pe_executar` aplica comandos de domínio e usa `operacao_repetir`/`operacao_concluir` da fundação. A chave pertence a organização + autor. Repetição idêntica retorna o resultado anterior; conteúdo divergente conflita. A linha do projeto é bloqueada para serializar nova sequência e promoção concorrente. `expected_version` impede sobrescrever versão, cenário ou projeto desatualizados.

O documento tem `schema_version=1`, família `documental`, finalidade explícita e listas limitadas de seções/parâmetros. Não aceita código livre ou campos executáveis. Texto é renderizado pelo React como texto, sem HTML arbitrário. O JSONB preserva conteúdo estruturado; clientes, pessoas, versões e relações continuam relacionais.

## Acesso e consultas

`operacao_pode(...,'ver_projetos_engenharia'|'gerir_projetos_engenharia')` exige membership atual e papel admin/engenharia. A visibilidade `restrito` também exige criador, pessoa responsável vinculada ao usuário ou administrador autorizado. `organizacao` libera para engenharia autorizada do tenant, não para qualquer usuário do sistema. Campo/comercial/compras não herdam acesso pelo silêncio da matriz.

`pe_ler_projeto` é usado no RLS de versões/cenários/histórico. `pe_ler_arquivo` confere o pai e estado, sem usar caminho ou hash como permissão. Nenhum dado privado é colocado em assets/rotas públicas de 3D.

Listagem pagina 25 projetos no servidor. Seletores limitam 25 resultados e unidades são filtradas por cliente. Ficha traz até 100 resumos recentes de versões/cenários/eventos; não baixa todos os modelos. Seleção carrega o conteúdo atual e sua base para comparação. Projetos extensos ainda precisam de paginação completa do histórico, identificada como pendência.

Query keys começam com `['pe', organization_id]` e o comando invalida o domínio dessa organização. Seletores usam `pe-opcoes` com organização/tipo/busca/cliente. O ciclo geral de sessão deve limpar todos os caches sensíveis ao revogar, trocar organização ou sair.

No checkpoint 42, a consulta de arquivos usa `['pe-files', organização, versão]` e retorna `{rows,permissoes:{ler:true,adicionar}}`. O servidor consulta somente contexto mínimo da versão/projeto por RLS, revalida `pe_ler_projeto` e determina envio pela capacidade atual, rascunho e projeto ativo. Uma resposta vazia de arquivos não substitui autorização pelo pai. Arquivo de projeto arquivado ou versão congelada permanece legível quando autorizado, sem permitir novo envio.

`ArquivosPe` revalida em 30 segundos e ao recuperar foco, sem repetir automaticamente falhas; o sinal de cancelamento da requisição alcança as consultas Supabase. Em erro de consulta, metadados anteriormente em cache, upload e cancelamento deixam de aparecer. O foco retorna à região de arquivos para apresentar o erro recuperável. Organização + versão identifica a instância do componente, suas mensagens, cancelamento e intenções; mudar versão não reapresenta estado local do arquivo anterior.

A consulta traz até 100 originais recentes e apresenta aviso quando alcança esse limite. Não informa esse número como total histórico; originais anteriores permanecem preservados. Paginação completa ainda é requisito aberto.

## Recuperação de edição

Conteúdo alterado mostra estado local não salvo. Trocar versão/cenário ou voltar ao acervo pede confirmação de descarte quando necessário; fechar/recarregar a aba sinaliza alterações. A operação mantém a mesma chave quando uma tentativa com o mesmo payload falha.

Refetch não substitui um rascunho local alterado. O editor conserva a versão de base, permite consultar a edição do servidor, comparar e recarregar explicitamente. Salvar com base antiga é recusado no banco. Isso não representa suporte offline completo: persistência local criptografada, retomada após fechamento abrupto e sincronização de anexos ainda não foram implementadas.

## Originais privados e confirmação

`pe_preparar_arquivo` exige pessoa autenticada com capacidade, projeto autorizado/ativo e versão em rascunho. Usa idempotência da fundação; caminho opaco inclui organização/projeto/versão/UUID. O mesmo hash na mesma versão reutiliza a identidade existente, sem mesclar arquivos de outros projetos. O arquivo confirmado conserva nome original, MIME, tamanho e SHA-256.

O handler assina upload sem upsert. Após armazenamento, o handler confirma autorização pelo cliente do usuário antes de importar service role. Baixa o binário privado, verifica tamanho, assinatura de formato e SHA-256 com o validador comum, revalida acesso e chama `pe_confirmar_arquivo`. Essa RPC é executável apenas por service role e confere novamente membership, papel, escopo do projeto, autor e metadados de Storage. O browser não confirma arquivo ausente por conta própria. Ausência de `SUPABASE_SERVICE_ROLE_KEY` gera dependência específica de confirmação, sem bloquear a autoria nativa.

Download usa cliente autenticado e policy do pai, com URL temporária de 60 segundos. Não há UPDATE/DELETE para o usuário em Storage. Metadados confirmados e cancelados são protegidos por trigger. Versão em revisão/congelada e projeto arquivado recusam novos envios. A submissão e o congelamento bloqueiam arquivos pendentes; congelar fixa manifesto dos originais confirmados e recalcula SHA-256 do snapshot incluindo seus hashes.

O fluxo mantém limite inicial de **20 MiB** no bucket e no verificador existente. Não declara suporte ao pacote `out_all.pdf` descrito com aproximadamente 36,6 MB: ampliar runtime/verificação e limite é requisito aberto, sem reduzir ou substituir silenciosamente o original. A tabela admite evolução de limite, mas staging, interface e servidor recusam acima de 20 MiB.

Falha antes do upload mantém registro pendente. Retomada exige que o usuário selecione os mesmos bytes; assinatura de MIME/tamanho/hash é conferida antes de enviar ao mesmo destino. Se o upload já terminou, reverificação confirma o objeto existente, sem sobrescrever. Cancelar o pendente registra motivo e impede vinculá-lo; limpeza física de órfãos após janela segura ainda depende do job de retenção e não é declarada concluída. Um token de upload antigo eventualmente usado após cancelamento não autoriza vincular o objeto nem altera snapshot congelado.

A interface conserva a chave da mesma intenção durante falha de transporte e reencontra o pendente consultado. A identidade local inclui organização, versão, nome, hash, tamanho e MIME. O servidor pode deduplicar os mesmos bytes de nomes locais distintos no original canônico; cancelar encerra todos esses aliases da mesma versão e um novo envio recebe outra chave, preservando as intenções de outros arquivos/versões. A perda da capacidade de enviar fecha os controles de alteração, mantendo a leitura histórica autorizada. Conclusões assíncronas de uma instância desmontada não abrem o download nem alteram mensagens da versão seguinte.

Os testes SQL usam apenas metadados de Storage em PostgreSQL isolado. Teste unitário do validador cobre bytes/tipo/hash. Nenhum desses testes comprova upload HTTP no Storage conectado, que exige E2E no ambiente confirmado.

Validação específica da correção de privacidade: `npx vitest run --config tests/vitest.pe-arquivos.config.ts` passou **9 testes unitários de endpoint**, cobrindo pai ausente/negado, lista vazia por RLS, leitura histórica, capacidade de envio, consultas mínimas e cancelamento HTTP. `node tests/ui/pe-arquivos-quality.mjs` passou **8 cenários com transporte isolado**, cobrindo cache/foco em revogação, falha de rede/retomada, leitura distinta de envio, troca de versão, confirmação repetida na mesma identidade, nova intenção após cancelar, aliases de nome deduplicados e aviso de limite 100. Resultado: `../evidencias/ui-pe-arquivos/pe-arquivos/results.json`. Typecheck escopado e lint dos arquivos alterados também passaram. Esses resultados não demonstram uma jornada real de Auth/Storage HTTP no projeto conectado; a aplicação SQL do checkpoint 42 e sua verificação de catálogo são evidências separadas, registradas em `../migracoes.md`.

## Limites ainda abertos do prompt 24

- E2E de upload/retomada/download no Storage conectado e ampliação necessária para PDFs acima de 20 MiB; código e testes locais não demonstram PE02 real nesse ambiente.
- Extração por página, OCR, leitura multimodal, thumbnails, marcação de região, cobertura e correção de dados extraídos (PE04–PE19 conforme cenário).
- Provedor de IA real do aplicativo, fila, limites, validação de evidência e sugestões acionáveis. IA do construtor não é integração do aplicativo.
- Templates paramétricos funcionais de LVHF, escada preliminar e silo/tulha/tanque, grafo de derivados e 3D próprio. A família documental não se apresenta como substituta desses templates.
- Emissão/renderização de PDF, artefato privado confirmado, dossiê e integração com Documentação. Exportação JSON não é PDF emitido.
- Reimportação do manifesto nativo e reconciliação de fontes; manifesto atual exporta modelo e snapshot, sem pacote de binários.
- Aprovação técnica profissional e requisitos de emissão; revisão interna atual não concede essa capacidade.
- Ações/Agenda e adoção explícita nos outros domínios; a variante não atualiza catálogo, proposta, ativo ou obra automaticamente.
- Auditoria granular de cada alteração de parâmetro durante rascunho; eventos atuais registram comando/motivo/autor e congelamentos preservam snapshot.
- Busca no texto integral/cliente/código técnico e navegação paginada de todo o histórico.
- E2E com backend real, arquivos, duas sessões, dispositivo móvel físico e a totalidade PE01–PE35. Captura com fixture não comprova esses itens.

Os três PDFs mencionados no prompt são referências preparatórias. Nesta tarefa foram localizadas as cópias da Escada em Downloads; Telhado Dyno e `out_all.pdf` não foram encontrados em Downloads/workspace. Nenhum deles foi importado em banco operacional para compor evidência.
