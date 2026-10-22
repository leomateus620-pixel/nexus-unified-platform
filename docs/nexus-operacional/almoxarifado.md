# Almoxarifado e Ferramentas

## Escopo e fonte dos dados

Jornada do checkpoint43. Materiais reutilizam o catálogo; ferramentas representam patrimônios individuais. Aquisição fiscal e custo de catálogo não provam recebimento físico. A entrada exige conferir um recebimento real de OC ou apontamento de produção, com quantidade, conversão documentada, local e classificação. Não há saldo retroativo presumido dos eventos antigos.

O ledger PostgreSQL confirma transferências, reservas, retiradas, consumo, devolução, inventário e estornos. Valores decimais atravessam o contrato como texto. O frontend apresenta saldos retornados pelo servidor e não calcula disponibilidade ou custo. Estoque aceito, quarentena, rejeitados, material em poder e consumido são posições distintas. Pessoas, projeto e OP usam os cadastros existentes.

Ferramentas têm patrimônio, propriedade, condição, reserva temporal e custódia. Calibração depende de política publicada por profissional autorizado, evidência privada e conferência; nenhum prazo normativo foi inventado. Arquivos reutilizam `anexos`, com FKs explícitas para ferramenta ou calibração e autorização pelo pai.

O fluxo de compra operacional independente, vínculos a OS, custo realizado, kits e integração final com Agenda ainda serão conectados. Este checkpoint não declara os módulos inteiros de compras, projetos ou execução concluídos.

## Auditoria Product Design

A baseline publicada não tinha rota de almoxarifado. Esse achado é de inventário estático; não há uma captura histórica de uma tela inexistente. A primeira composição implementada foi examinada no navegador integrado, com componentes reais e transporte isolado de teste, antes de disseminar o padrão.

| Achado | Categoria | Impacto / frequência | Refinamento |
|---|---|---|---|
| Sete abas ocupavam quatro faixas no celular | Estrutural | Alto / toda entrada no módulo | Seletor de área no mobile; navegação por abas no desktop |
| Saldo disponível ficava fora da primeira vista da tabela mobile | Estrutural | Alto / consulta e retirada | Lista resumida mobile com identificação, saldo, situação e vínculo; tabela comparativa desktop |
| Produto já conhecido repetia busca e seleção desabilitadas | Interação | Médio / reserva e movimentação contextual | Identificação compacta somente para leitura, mantendo o ID canônico |
| Foco inicial tentava entrar no primeiro campo desabilitado | Interação | Alto / formulários contextuais | `OperationalDialog` escolhe o primeiro campo habilitado; abertura e retorno de foco precisam de regressão compartilhada |
| Conferência de inventário podia receber rótulo de produção | Informação | Alto / auditoria de movimentos | Origem explícita distinta de OC/OP; estorno de evento só aparece quando há esse evento de origem |
| Cadastro de rastreabilidade competia com a operação diária | Refinamento | Médio / recebimento | Conferir entrada como ação principal; configuração de material em seção secundária |

Capturas a 390×845 CSS px: [primeira composição](evidencias/almoxarifado/01-primeira-lista-mobile.jpg) e [refinamento da lista](evidencias/almoxarifado/02-refinada-lista-mobile.jpg). A [ficha final desktop](evidencias/almoxarifado/04-ficha-final-desktop.jpg) foi examinada a 1440×900; o [formulário contextual mobile](evidencias/almoxarifado/05-reserva-final-mobile.jpg) registra o foco no primeiro campo habilitado. A comparação mobile usa a mesma condição de dados e viewport. O refinamento reduz a área de navegação e permite ler o saldo sem rolagem horizontal da página.

Na inspeção por teclado, o formulário de reserva passou a focar a busca de local habilitada; fechar sem alterações retornou ao acionador. A ampliação, descarte, recuperação, erros e outras larguras têm testes próprios. Isso não certifica leitor de tela, dispositivo físico, teclado virtual real ou conformidade integral de acessibilidade.

A [configuração pela lista](evidencias/almoxarifado/06-politica-consultada-mobile.jpg) consulta e fixa a política atual do produto antes de liberar campos e envio. Erro de consulta preserva a seleção; conflito exige comparar e adotar a versão atual explicitamente. O código do produto e sua política não são criados novamente por esse formulário.

## Comportamento

Sete áreas compartilham busca, filtros e paginação de 25 registros no servidor. A URL preserva área, registro, filtro, busca e página. Uma ficha abre a origem de movimento ou reserva e mantém o recorte no retorno. Carregamento, ausência de registros, resultado filtrado, erro e negação de acesso são estados distintos.

Os 23 comandos possuem formulários específicos. Não há alteração livre do ledger. A versão de edição é capturada ao abrir; polling não troca sua base. Erro de rede mantém o preenchimento e a chave de tentativa. A consulta de comparação apresenta a versão atual; só a decisão explícita adota outra base. Revogação reconhecida na consulta, comando ou comparação oculta o conteúdo privado e fecha o editor. Nova leitura autorizada permite recuperar a ficha.

Quantidade conferida é expressa na unidade do evento de origem; aceita/quarentena/rejeitada usam a unidade canônica do produto e precisam fechar com a conversão confirmada pelo banco. A interface mantém essa distinção. Datas de calibração são civis. Os formulários de reserva identificam o fuso real do navegador antes de converter instantes; a experiência final da Agenda ainda precisa consolidar a configuração temporal da organização.

Anexos distinguem leitura de capacidade de envio. A consulta retorna flags atuais por registro; erro oculta cache e controles. Envio pendente pode ser retomado com os mesmos bytes/metadados ou cancelado com motivo. Uma nova tentativa após cancelamento recebe outra identidade, sem apagar evidência confirmada. URLs e confirmação revalidam o pai no servidor.

## Limite de validação

As evidências locais de banco, concorrência e UI são registradas separadamente em `validacao.md` e nos relatórios do checkpoint. A migração0023 foi aplicada ao projeto confirmado em22/10/2026 às13:16:47.507078 UTC, com a mesma fonte congelada testada. A ambiguidade de FKs identificada pela geração oficial dos tipos foi corrigida pela0024, aplicada em13:29:30.366847 UTC; nomes históricos e ações de exclusão foram preservados. A conferência posterior de catálogo/ledger passou e a análise de tipos voltou a passar sem alterar consultas antigas. A UI final passou228 layouts/17 comportamentos e anexos seis layouts/cinco comportamentos, com transporte isolado.

As fixtures permanecem no laboratório/PostgreSQL descartável. Conforme decisão do usuário, não há E2E Auth/Storage HTTP conectado, cadastros fictícios operacionais ou certificação de desempenho de produção.
