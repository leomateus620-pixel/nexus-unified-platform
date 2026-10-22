# Almoxarifado e ferramentas — contrato de banco

Migração `0023_almoxarifado.sql`, após o checkpoint publicado de 41 arquivos (`0022`).
Aplicada em22/10/2026 às13:16:47.507078 UTC; catálogo, ledger e segurança verificados por metadados.
A geração oficial42 detectou FKs duplicadas; a corretiva0024 foi aplicada em22/10/2026
às13:29:30.366847 UTC e verificada por catálogo/ledger às13:30:19.277589 UTC. Os tipos43
e o typecheck global passaram com consultas históricas preservadas. Não comprova upload binário
real, implantação da interface ou conclusão de compras operacionais sem proposta.

## Fontes e quantidades

`produtos` continua sendo o catálogo. A aquisição continua sendo um fato financeiro, independente
do recebimento físico. `recebimentos` e `apontamentos` positivos são as origens de conferência;
nenhum histórico é transformado automaticamente em saldo. Estoque inicial exige contagem física
e aprovação explícita do inventário. Não há depósito ou material de demonstração criado pela migração.

`estoque_conferencias` referencia exatamente um recebimento, apontamento ou inventário aprovado.
Sua `quantidade` usa a unidade de origem; `fator` é snapshot da conversão confirmada já existente em
`produto_conversoes`, ou 1 quando as unidades coincidem. `aceita`, `quarentena` e `rejeitada` usam a
unidade canônica do produto e somam exatamente `quantidade × fator`. Uma conversão não representável
é recusada, sem arredondamento silencioso. Item avulso sem produto requer reconciliação explícita
com um produto existente, com justificativa; a revisão comercial permanece intacta.

Eventos e comandos usam `numeric(18,6)`: até 12 inteiros e seis casas decimais, retornados como texto.
O fator é texto decimal positivo, separado da quantidade. Agregados organizacionais podem ultrapassar
o limite de um evento e permanecem texto decimal exato. Produtos indivisíveis não aceitam frações.
Após existir histórico físico, unidade e indivisibilidade do produto não podem ser trocadas para
reinterpretar esse histórico. Identificação de lote/série é política explícita do produto; série
representa uma única ocorrência física e é única dentro da organização/produto.

## Ledger e concorrência

`estoque_operacoes` identifica a operação e suas FKs reais; `estoque_movimentos` registra quantidades
com sinal e posição (`aceito`, `quarentena`, `rejeitado`, `em_poder`, `consumido`). Cada movimento
preserva a conferência original, inclusive após transferência. Não se pode editar ou excluir eventos
confirmados. Transferência e mudança de qualidade geram os dois lados na mesma transação.

`estoque_reservas` possui destino exclusivo projeto ou OP, pessoa responsável, local e validade.
`estoque_reserva_itens` fixa a alocação por proveniência, priorizando conferências mais antigas.
O banco serializa as mutações físicas com lock transacional por organização. Este primeiro contrato
privilegia correção; sua contenção sob carga real ainda deve ser medida antes de alegar capacidade.
Operações que usam recebimento/apontamento primeiro travam o item legado, mantendo a mesma ordem
do comando de suprimentos. Não há teste baseado apenas em uma consulta antecipada no navegador.

Retirar muda `aceito → em_poder`; consumir muda `em_poder → consumido`; devolver sobra muda
`em_poder → aceito`. Receber 10, reservar/retirar 8, consumir 6 e devolver 2 resulta em físico 4,
consumido 6 e disponível 4. A retirada não representa consumo nem cria custo ou aquisição.
Reserva expirada deixa de bloquear saldo; não permite nova retirada, mas continua aceitando a
correção do material em poder. Cancelar exige motivo e ausência de material ainda em poder.

O estorno do comando legado `registrar_movimento` é integrado por trigger na mesma transação:
primeiro reduz a parcela ainda não conferida e depois remove somente saldo físico livre da origem.
Reserva, custódia ou consumo não podem ser compensados com outra compra. Se o material original
não estiver disponível, falham juntos o estorno, o acumulador da ordem e o ledger físico.
O corpo publicado de `registrar_movimento`, `gerar_ordens`, `_plano_ordens`, `planejar_ordens` e
os motores financeiros permanece preservado nesta etapa.

Inventários contam material aceito em produto/local/lote, separando quarentena e rejeição.
A captura fixa saldo e sequência do ledger; movimento posterior exige nova contagem, com conflito
`40001`. Aprovação produz ajuste rastreável; ajuste negativo não pode consumir reserva ativa.
Produto serializado não admite entrada por contagem agregada sem identificação individual.

## Ferramentas e certificados

`ferramentas` é patrimônio operacional individual, separado de produto e de ativo instalado.
Condições: disponível, avariada, quarentena, manutenção ou desativada. `ferramenta_custodias` é a
reserva temporal canônica e posterior retirada/devolução. Intervalos são semiabertos `[início,fim)`;
horários adjacentes são permitidos. Custódia retirada e ainda não devolvida impede segunda alocação.
Uma reserva pode referenciar um `agenda_eventos` existente, sem gerar outra identidade temporal.

`ferramenta_calibracao_politicas` contém método/fonte versionados, política de validade e profissional
autorizado. Não existem limites ou periodicidades normativas pré-configurados. Calibração segue
enviada → em conferência → validada/revogada; validação exige profissional autorizado e certificado
privado confirmado. Referência textual não substitui arquivo. A política e a validade precisam cobrir
o período planejado e são verificadas novamente na retirada. Cada custódia preserva o fuso IANA
declarado (`America/Sao_Paulo` como default compatível). A data civil considera esse fuso, inclusive
o fim exclusivo do período. Quando existe evento vinculado, fuso, janela e participante precisam
corresponder ao evento autorizado. Alteração de período/fuso ou cancelamento do evento exige resolver
as custódias ativas antes, até a futura entrega do reagendamento conjunto pela Agenda.

Os arquivos reutilizam `anexos`, agora com pais exclusivos `ferramenta_id` ou `calibracao_id`, além
dos três pais anteriores. Não existe tabela paralela de binários. Pais, autor, MIME, tamanho e hash
são imutáveis; preparação, política de upload, confirmação por serviço e cancelamento reavaliam
autorização atual. A confirmação trava autor/pai antes de decidir, inclusive no retry já vinculado.
O bucket continua privado, com limite de 20 MiB. Testes SQL exercitam metadados e RLS, sem simular
que um objeto de teste equivale a bytes enviados ao Storage remoto.

## Autorizações e RPCs

As capacidades são compostas das matrizes existentes: leitura requer `ver_operacao`; gestão usa
`gerir_operacao` ou `pode('receber')`; conferência/ajuste usa recebimento; validação técnica requer
profissional ativo com registro declarado. Campo executa somente reservas/custódias próprias.
Sua leitura histórica de ferramenta devolvida preserva a própria trilha, sem revelar custódias de
outras pessoas. A mesma restrição existe em SQL/RLS e no DTO; custos nunca integram essas projeções.
O SELECT histórico de `aquisicoes` foi restringido a `ver_custos`, fechando leitura direta por Campo.

`alm_listar` e `alm_opcoes` retornam projeções autorizadas e paginadas (25, máximo 50).
`alm_obter` retorna o detalhe autorizado; suas coleções (histórico, lotes,
custódias e políticas) ainda não têm paginação própria e não são truncadas silenciosamente.
Devem receber consulta/paginação específica antes de alegar suporte a históricos extensos.
`alm_executar` concentra comandos, versão e chave idempotente. Mesmo payload/chave não produz novo
efeito; chave com payload diferente gera `23505`; versão desatualizada gera `40001`. Retries
reconstroem o detalhe autorizado atual, evitando devolver a visão ampla de um antigo gestor.
Os helpers internos e escritas diretas não são RPCs concedidas ao usuário.

`listar_anexos_operacionais` retorna registros e flags atuais de adicionar/retomar/cancelar.
`operacao_pode_enviar_anexo` distingue leitura de permissão de upload. Novos pais são opcionais sem
default nos contratos de entrada: o JSON e o hash de intenções antigas não recebem campos extras.
Não foi introduzida deduplicação de conteúdo: a identidade de intenção permanece chave + payload.

## Aceite comercial e projeto

O defeito legado foi reproduzido: uma OC emitida antes do aceite recusava o vínculo do projeto,
e chamadas separadas podiam deixar revisão aceita/projeto criado sem conectar as ordens.
`aceitar_projeto_operacional(org,revisao,chave,motivo)` agora executa aceitação, projeto, proposta,
vínculos OC/OP, auditoria e recibo na mesma transação, com autorização atual e `travar_revisao`.
O código de projeto mantém a regra existente `PRJ-` + número com primeira barra substituída.
Estado já aceito permite reconciliar vínculos antigos sem registrar outro aceite fictício.

O guard de cabeçalho permite somente `projeto_id NULL → projeto exato` da organização/revisão/
proposta/cliente aceitos; todas as demais colunas permanecem idênticas. Projeto já ligado não é
substituído. Novas FKs compostas validam organização e revisão dos cabeçalhos/eventos, e recusam drift.
O ramo de enviar/recusar, documentos emitidos e fórmulas comerciais não são reabertos por esta RPC.

## Limites desta etapa

- Compra operacional sem proposta depende da próxima evolução tipada de requisição/OC; não há
  proposta comercial fictícia como atalho.
- Reserva para OS e custo realizado por consumo aguardam o domínio canônico de OS/financeiro.
  Esta etapa não declara financeiro conciliado nem cria preço médio paralelo.
- Conjunto de ferramentas/kits, QR e inventário serializado em lote não foram entregues nesta base.
- Agenda completa e gestão de frota permanecem etapas próprias. A custódia temporal já tem contrato
  para vinculação, mas não equivale à experiência final de Agenda Equipe.
- Desempenho de produção, dispositivos físicos, Auth/Storage remotos e publicação do frontend
  precisam de evidência específica; fixtures locais e emulação não comprovam essas condições.
- Coleções do detalhe ainda são integrais. A latência e o tamanho desses payloads não foram
  homologados para históricos grandes; a próxima evolução deve oferecer paginação visível.
