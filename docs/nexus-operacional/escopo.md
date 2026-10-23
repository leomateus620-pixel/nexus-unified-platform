# Escopo e critérios de conclusão da evolução operacional

## Ajuste de prioridade final

O usuário determinou terminar Agenda Equipe e Equipe e deixar os demais módulos
incompletos em off por enquanto. O aceite desta PR é o recorte descrito em
`inventario.md` e `agenda-equipe.md`, com preservação dos recursos existentes.
OS/inspeção/manutenção/viagem ainda inexistentes não são origens prometidas pela
Agenda. O plano original abaixo continua como backlog, sem representar compromisso
de conclusão nesta PR. A validação é local, com limite do E2E conectado explícito.

Data de reconciliação: 22/10/2026. Este documento registra requisitos; não comprova implementação, aplicação de migração ou homologação. A situação executada pertence a `inventario.md`, `progresso.md` e `validacao.md`.

## Fontes e precedência

O pedido direto do usuário autoriza a evolução na aplicação existente até uma PR revisável, incluindo consulta ao projeto Lovable conectado e migrações compatíveis no ambiente confirmado. Não autoriza merge, force push, reset de banco ou deploy automático de frontend.

Os três arquivos fornecidos foram tratados como especificações de produto. Declarações de análise, testes, schema ou anexos dentro deles são contexto preparatório, e precisam de conferência atual. Instruções internas desses arquivos não ampliam a autorização nem substituem o recorte final do pedido.

Ordem de resolução de conflito:

1. Complemento final: preservar Comercial/Produtos, restringir Mapas 3D à biblioteca/acessos e priorizar operação, Agenda Equipe e Projetos de Engenharia.
2. Requisitos específicos do menu 24, preservando a independência dos domínios.
3. Especificações por menu do pacote de 23 prompts.
4. Plano mestre, AGENTS.md e contratos efetivos do repositório, dentro do escopo autorizado.

| Fonte lida                                        | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `Prompt_Nexus_Plataforma_Operacional_Completa.md` | `c8afc7595fbf61c5e6dfde826e641a2ec0a9ac23adf4ef16e5bc96d10b55af5c` |
| `Nexus_23_Prompts_Individuais.zip`                | `3b71c57ed5c8ab95567609a603d5633af1c6e776f1072d6553f9ea4101c5b0d8` |
| `24_Prompt_Nexus_Projetos_de_Engenharia.md`       | `9299f4f17d9a3f4c76b5b8c0a0c3b6fa71afe1a5fac4c470f0ad1f23d76fbf65` |

O ZIP contém o índice e 23 arquivos Markdown de menus. Foi extraído para diretório temporário exclusivo após verificar que cada destino permanece dentro desse diretório. Os textos de especificação não são copiados integralmente para o repositório como evidência.

## Recorte obrigatório

| Área                    | Desenvolvimento autorizado neste recorte                                                                                  | Critério de conclusão                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Comercial               | Preservar cadastros, propostas, revisões, cálculos e aprovações; corrigir integração impeditiva pontual                   | Testes de referência e integrações tocadas passam; proposta direta e imutabilidade continuam válidas                         |
| Produtos e Soluções     | Reutilizar catálogo, códigos, composição, fornecedores, custo e importações; somente mudanças indispensáveis à integração | Sem novo cadastro paralelo ou mudança silenciosa de código, preço, custo adotado ou revisão histórica                        |
| Mapas 3D                | Organizar biblioteca/acessos com cards, miniaturas correspondentes, busca/filtros compactos e retorno preservado          | Cenas, assets, materiais, trajetórias, dimensões, posições, simulações, câmeras, controles, rotas e carregamento preservados |
| Escada LC-02            | Preservar ambiente e acesso; eventuais ajustes de biblioteca seguem o mesmo limite                                        | Testes e contratos próprios preservados; não confundir visualização e validação estrutural                                   |
| Operação e conformidade | Completar jornadas reais dos menus pendentes e dos seis módulos novos                                                     | Persistência, autorização, regras, transições, histórico e integrações demonstrados                                          |
| Agenda Equipe           | Preparar fundação temporal cedo; experiência consolidada entregue por último                                              | Eventos/ações/origens e recursos compartilham identidades; aceites temporais e concorrentes demonstrados                     |
| Projetos de Engenharia  | Novo menu `/projetos-engenharia`, acervo e autoria técnica próprios                                                       | Importação/versionamento, leitura verificável, IA real, editor/variantes, 3D separado e exportação nos caminhos suportados   |

Ampliações de funil, funcionalidades comerciais novas e reformulações extensas de Comercial/Produtos ficam adiadas. Oportunidades não é requisito para criar proposta ou iniciar os novos fluxos. O editor técnico novo não pode alterar os mapas existentes por reutilização de componentes.

## Matriz de entrega por menu

Todos os itens abaixo são requisitos abertos até receberem evidência. Não se infere conclusão pela existência de rota, tabela, botão ou teste com fixture.

| Nº  | Menu/rota de referência                       | Jornada mínima e aceite consolidado                                                                                                                               |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Dashboard `/`                                 | Fila autorizada por papel e até quatro indicadores acionáveis; contagem, lista e drill-down fecham no mesmo recorte; zero, erro e ausência de fonte são distintos |
| 02  | Comercial `/comercial`                        | Preservar proposta direta, revisões, aceite e motores; conectar fontes técnicas apenas por adoção explícita e corrigir impedimentos tocados                       |
| 03  | Clientes `/clientes`                          | Cliente com duas unidades/contatos, edição, arquivamento e reativação; substituir prompts; preservar históricos e rejeitar cliente/unidade incompatíveis          |
| 04  | Produtos `/produtos`                          | Vínculos canônicos de material, ferramenta e ativo; preservar códigos, composição, encargos, custo adotado e idempotência de aquisição                            |
| 05  | Levantamentos `/levantamentos`                | Planejar, coletar dois pontos com medidas/fotos, devolver/corrigir/aprovar e adotar em rascunho sem alterar emitido; versão do modelo fixada                      |
| 06  | Engenharia `/engenharia`                      | Estudo com fontes/método versionados, devolução/aprovação profissional e nova revisão após aprovação; regra ausente gera pendência, sem cálculo inventado         |
| 07  | Mapas 3D `/mapas-3d`                          | Biblioteca organizada e responsiva; abrir mapa correto e retornar com recorte; cenas e demos públicas preservadas                                                 |
| 08  | Escada `/escada-lc02`                         | Acesso familiar preservado; geometria, percurso, simulação e controles não são refeitos; linguagem permanece demonstrativa quando aplicável                       |
| 09  | Projetos `/projetos`                          | Proposta aceita mantém baseline; plano/marcos sem ciclos; suprimentos, OS, entregáveis e custos separados; encerramento verifica pendências reais                 |
| 10  | Compras/Produção `/compras`                   | Geração atual com lock/hash intacta; parcial/qualidade/quarentena/estorno/retry; compra operacional sem proposta fictícia                                         |
| 11  | Execução/OS `/execucao`                       | Equipe temporal, troca de participante, horas noturnas/pausas sem sobreposição, material, RDO interno, devolução e aprovação                                      |
| 12  | Documentação `/documentacao`                  | Mestre/revisão/aprovação/emissão separados; PDF/hash de V1 intactos após V2; documento sem proposta e dossiê fixando revisões                                     |
| 13  | Inspeções `/inspecoes`                        | Checklist V1 permanece após publicar V2; respostas/evidências, devolução/revisão e ação canônica do achado; resultado distinto de estado administrativo           |
| 14  | Financeiro `/financeiro`                      | Baseline/compromisso/realizado/obrigação/caixa separados; baixa parcial, estorno e novo pagamento; rateio fecha e campo não recebe custo                          |
| 15  | Relatórios `/relatorios`                      | Fontes/fórmulas/recortes publicados; agregado, tabela e exportação conciliam; CSV protegido contra fórmula e arquivos autorizados                                 |
| 16  | Configurações `/configuracoes`                | Vínculo/convite real quando disponível, último admin protegido, papéis coerentes, revogação ativa e políticas versionadas; jobs observáveis                       |
| 17  | Ativos `/ativos`                              | Preexistente e originado de OS, configuração histórica sem ciclos, restrição/liberação autorizada, inspeção/documento e transferência rastreáveis                 |
| 18  | Manutenção `/manutencao`                      | Plano/ocorrência/OS/chamado distintos; duas execuções do scheduler não duplicam; reagendar preserva original e plano futuro não apaga vencidas                    |
| 19  | Segurança `/seguranca`                        | Relato rápido → triagem → ação → correção/devolução → verificação; origem única, evidência e dados sensíveis protegidos                                           |
| 20  | Pessoas `/equipe`                             | Pessoa sem login alocável e vínculo posterior sem duplicação; equipes temporais e competências conferidas na data do serviço                                      |
| 21  | Almoxarifado `/almoxarifado`                  | Entrada aceita, reserva concorrente, consumo/devolução e transferência atômica; ferramenta individual sem dupla custódia; inventário por ajuste auditado          |
| 22  | Logística `/logistica`                        | Viagem com duas OS, uma reserva, motorista/capacidade/disponibilidade; saída/retorno e odômetro auditados; despesa rateada sem duplicação                         |
| 23  | Agenda `/agenda-equipe`                       | Evento independente e ação sem horário; várias visitas por OS; recursos exclusivos protegidos no banco, recorrência finita, exceções e lembretes backend          |
| 24  | Projetos de Engenharia `/projetos-engenharia` | Identidade independente; V1/V2 e originais, leitura/evidência/cobertura, sugestões e comparação, três famílias nativas, variantes e PDF/manifesto                 |

As rotas são referências de especificação; o inventário deve registrar caminhos efetivos, incluindo biblioteca 3D e URLs existentes que não podem ser removidos.

## Contratos que atravessam os menus

| Contrato               | Invariante e prova exigida                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidades            | Organização proprietária, cliente, pessoa, login, produto, sistema dimensionado, ativo e ferramenta continuam distintos; nenhuma dependência se resolve com registro fictício |
| Tenant e escopo        | FKs pai/filho e comandos validam organização; unidade pertence ao cliente; dados sensíveis podem ter escopo adicional dentro do tenant                                        |
| Permissões             | Navegação, MATRIZ, `public.pode()`, RLS, Storage, exportação e payload concordam; papel ausente/desconhecido nega por padrão                                                  |
| Estados                | Comandos de domínio aplicam pré-condições, versão esperada, autoria e histórico; agenda não faz update direto de status alheio                                                |
| Idempotência           | Mesma chave/mesmo payload repete resultado; mesma chave/payload diferente gera conflito; origem única evita movimentos ou documentos duplicados                               |
| Concorrência           | Versão impede overwrite; locks/transações impedem reserva dupla, hora sobreposta, pagamento excedente e sequência de versão duplicada                                         |
| Arquivos               | Bucket privado, staging/confirmar/vincular, tamanho/MIME/hash verificados; download revalida pai e usa URL curta; falha não confirma arquivo ausente                          |
| Histórico              | Emitidos, aprovados e movimentos confirmados imutáveis; revisão/estorno/cancelamento com autor/motivo preserva passado                                                        |
| Tempo                  | Date para dia civil; timestamptz + timezone IANA para instante; intervalos `[início,fim)`; dia inteiro não muda data por UTC                                                  |
| Dinheiro e quantidade  | Decimal canônico no servidor; fatos de aquisição, recebimento, consumo, obrigação e pagamento separados; apropriação deduplicada por origem                                   |
| Assíncrono             | Outbox atômica com comando; lease/retry/backoff/deduplicação e falhas observáveis; scheduler funciona com browser fechado                                                     |
| Cache                  | Query keys por organização/escopo/recorte; invalidação de dependentes; logout, revogação e troca de organização eliminam dados anteriores                                     |
| Normas e engenharia    | Fonte/versão/método aprovados antes de regra ativa; admin não equivale a profissional habilitado; sem ART, limites ou declaração de conformidade inventados                   |
| Qualidade de evidência | Separar estática, unitário, SQL, E2E real e captura visual; UI com fixture não prova banco, RLS, Storage ou IA                                                                |

## Projetos de Engenharia: responsabilidades próprias

O domínio `pe_` deve viver separado de `projetos` operacional, revisões de proposta e documentos emitidos. Estudo técnico pode existir antes da venda. Criá-lo não gera aceite comercial, obra, OC, OP, OS ou autorização executiva.

No menu, um PDF original preservado, uma representação nativa editável e um artefato emitido são objetos diferentes. Extração ou reconstrução não recupera CAD paramétrico exato por suposição. Aprovação de layout, revisão técnica, decisão do cliente e aceite comercial são eventos diferentes.

### Dados e comandos

Reconciliar equivalentes existentes antes de criar nomes propostos:

- `pe_projetos`, `pe_versoes` e `pe_documentos_logicos`: identidade, sequência interna, revisão declarada, versão-pai e pacote com várias estruturas.
- `pe_arquivos` e `pe_versao_arquivos`: binário confirmado, papel/ordem, hash e vínculo a documento lógico; arquivo principal não se confunde com referência/fonte editável/modelo.
- `pe_paginas`, `pe_evidencias` e `pe_estruturas`: página física, rotação, dimensões, região e estrutura correta, inclusive códigos repetidos.
- `pe_parametros`, `pe_componentes`, `pe_modelos_nativos` e `pe_vistas`: dados tipados com origem/status, modelo como fonte e cena/PDF como derivados versionados.
- `pe_analises`, `pe_sugestoes`, `pe_cenarios` e aprovações/eventos: input imutável, cobertura/limites, decisão humana, delta e baseline preservada.

Separar data original de elaboração, upload, processamento e emissão. Autor declarado na fonte não é usuário que anexou nem profissional que conferiu. Sequência V1/V2 é transacional; não substitui revisão impressa A/00/01. Versão vigente é escolha explícita com evento, não a análise mais recente.

Contratos esperados: criar projeto, iniciar/confirmar upload, adicionar versão, reprocessar, confirmar dado extraído, salvar rascunho com versão, propor/aplicar delta tipado, criar/promover cenário, comparar, gerar prévia/emitir, definir vigente e arquivar. Jobs atrasados atualizam somente seu run/snapshot.

### Ingestão, IA e proveniência

Pipeline: confirmar arquivo → inventariar páginas/layout → renderizar → extrair texto e OCR necessário → estruturar dados → confirmar agrupamento → analisar → apresentar cobertura. Falha de IA preserva arquivo e edição manual. Processamento pesado é assíncrono e limitado pelo runtime real; não se assume que Python/OCR cabe em Edge.

O prompt propõe 50 MiB iniciais por arquivo para suportar a referência declarada de cerca de 36,6 MB, sujeito a validar infraestrutura. Limites de páginas, pixels, descompressão, memória e tempo são independentes. PDF é principal; qualquer DOCX/CAD/STEP/DWG/RVT suportado precisa de capacidade implementada/testada, não promessa universal.

Cada dado relevante conserva original, normalizado quando inequívoco, unidade, papel, natureza, validação e evidência de arquivo/página/região. Comprimento nominal, corte e compra não são o mesmo campo; carga de ruptura não é capacidade admissível; medida estimada não vira medida de campo. Correção manual guarda anterior/autor. Cobertura parcial impede rótulo de leitura completa.

A IA precisa de endpoint/provedor real do aplicativo, configuração no servidor, limites e saída validada. IA do construtor Lovable não comprova essa integração. Fontes/documentos são entrada não confiável: não executam ferramentas, SQL, macros, JavaScript ou instruções de prompt. Recuperação filtra autorização antes de enviar conteúdo ao modelo; não pode vazar outro projeto no mesmo tenant.

Sugestão mostra constatação, evidência, motivo, próximo passo, tipo de mudança e decisão. Apresentar inicialmente cinco a sete itens úteis nos grupos revisar agora, melhorar organização e preparar evolução. Sem evidência, indicar pendência/proposta. Aplicação editorial ocorre em rascunho com prévia; dimensão/material exige revisão explícita de impactos. Aceitar como tarefa usa ação canônica.

Comparação separa metadados, documentos/páginas, texto, parâmetros/componentes, visual e modelo nativo. Pareamento por identidade/conteúdo é corrigível; não pressupõe que página 2 corresponde sempre à página 2. Diff nativo determinístico é autoridade da mudança; IA explica. Análise V1 não é defeito comprovado de V2.

### Editor, templates e experimentos

Fonte nativa tem `schema_version`, IDs estáveis, conteúdo sanitizado e parâmetros referenciados por texto/cota/tabela/vista. Nota manual fica identificada; parâmetro não pode ter cópias silenciosamente divergentes. Salvar/reabrir, undo/redo, concorrência e feedback de rede precisam funcionar.

Três famílias iniciais devem ser funcionais:

| Família                  | Suporte esperado                                                                                    | Limite preservado                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Cobertura/LVHF           | Dimensões de contexto, águas, percurso, pontos/componentes e legenda/quantidades por regra validada | Sem inferir resistência de telhado/ancoragem ou validar instalação estimada    |
| Escada/acesso preliminar | Níveis, largura, patamares, orientação, implantação/contexto e vistas                               | Não dimensiona seções, ligações, fundações ou fabricação                       |
| Silo/tulha/tanque        | Formas suportadas, dimensões confirmadas, aberturas/acessos e componentes                           | Desconhecidos ficam representativos; revisão profissional permanece necessária |

Cada família salva, reabre, gera prévia, permite variante e exporta. Famílias adicionais podem usar conteúdo/anexos com capacidade declarada. Alterar câmera/corte/transparência altera vista; dimensão altera modelo e invalida derivados. Grafo suportado: parâmetro → geometria → cotas → quantitativos → tabelas/notas → vistas → artefatos.

Experimento tem base/nome/delta, comparação, desfazer/refazer, descartar/restaurar e promoção para nova versão. Não modifica baseline, catálogo, proposta, ativo ou documento emitido. O 3D próprio tem seleção por cena/lista, propriedades com unidade/origem, órbita/pan/zoom/enquadramento, vistas salvas, ocultar/isolar e cortes suportados. Sem reusar estado mutável de cenas existentes.

3D carrega sob demanda, libera recursos e oferece fallback por parâmetros/vistas quando WebGL falhar. Lista não baixa GLBs. Meta de aproximadamente 30 fps mobile é proposta de medição em dispositivo identificado, sem promessa universal.

### PDF e exportação

Apresentação preliminar e prancha usam templates diferentes e finalidade visível. Prancha combina vistas suportadas, componentes/quantidades, notas, revisão e referências cruzadas; não é screenshot da UI. Fontes/valores vêm do snapshot, não de texto livre da IA.

Texto/cotas/símbolos preferencialmente vetoriais, imagens com resolução adequada, A3/A4/orientação e quadro útil verificados. Vista ilustrativa/perspectiva permanece sem escala; escala só é declarada quando unidade/geometria/transformação/papel a sustentam. Não conservar escala antiga depois de redimensionar página.

Prévia, validação, emissão pendente e confirmação do arquivo/hash precedem estado emitido. Job guarda snapshot/template/renderer. V1 permanece intacta depois de mudança de fonte/catálogo. Exportação nativa leva manifesto de fontes/assets/versões sem segredos ou URLs permanentes; reimportação preserva relações ou reconcilia explicitamente.

### Aceites específicos PE01–PE35

| ID   | Prova exigida                                                                       |
| ---- | ----------------------------------------------------------------------------------- |
| PE01 | Criar projeto técnico sem proposta/obra                                             |
| PE02 | V1/V2 com empresa/local/data/resumo e originais/hash íntegros                       |
| PE03 | Versão concorrente e retry sem sequência duplicada                                  |
| PE04 | Arquivo repetido detectado sem bloquear reutilização legítima                       |
| PE05 | Upload permanece salvo após falha de IA                                             |
| PE06 | Região rasterizada lida por OCR/visão ou explicitamente pendente                    |
| PE07 | Divergência de material com duas evidências e sem substituição automática           |
| PE08 | Nominal, corte e compra semanticamente separados                                    |
| PE09 | Escada preliminar preserva finalidade e pendências na exportação                    |
| PE10 | Pacote de dez páginas não vira dez versões por suposição                            |
| PE11 | Código repetido não funde estruturas distintas                                      |
| PE12 | Cota/elemento representativo ou a confirmar conserva origem/status                  |
| PE13 | Evidência posicionada corretamente em formatos/rotações diferentes                  |
| PE14 | Precisão, original e unidade preservados em m/mm/polegada                           |
| PE15 | Carga de ruptura e capacidade admissível não confundidas                            |
| PE16 | Reordenação de folhas pareia conteúdo ou pede confirmação                           |
| PE17 | Correção manual conserva anterior, autor e evidência                                |
| PE18 | Saída inválida/sem evidência não aplica patch arbitrário                            |
| PE19 | Prompt malicioso documental não altera ferramentas, SQL, segredo ou escopo          |
| PE20 | Três famílias nativas salvam, reabrem, editam, exibem prévia e exportam             |
| PE21 | Parâmetro atualiza derivados suportados ou os marca pendentes                       |
| PE22 | Câmera/corte não altera dado técnico                                                |
| PE23 | Variante/desfazer/descarte mantém baseline e congelados                             |
| PE24 | Promoção cria versão com pai/delta sem afetar operação/catalogo                     |
| PE25 | Job antigo não substitui prévia/análise atual                                       |
| PE26 | PDF A3/A4 com vistas, escala/finalidade e legibilidade corretas                     |
| PE27 | Emitido permanece idêntico após mudar fonte/catálogo                                |
| PE28 | Importado sem CAD permite leitura/anotação sem promessa de recuperação exata        |
| PE29 | Tenant/perfil sem capacidade não lê rota/API/Storage/thumbnail/busca/análise/export |
| PE30 | Revogação/logout/troca de organização elimina cache privado anterior                |
| PE31 | Celular vertical/horizontal/teclado utilizável                                      |
| PE32 | Desktop com nomes longos/versões extensas navegável                                 |
| PE33 | Falhas WebGL/worker/provedor/PDF recuperáveis e sem falso sucesso                   |
| PE34 | Documentação/Agenda reutilizam identidade, artefato e tarefa                        |
| PE35 | Modelo nativo exportado/reimportado preserva/reconcilia relações                    |

## Disponibilidade das referências PDF

Foi conferida a presença de arquivos em Downloads e dos PDFs no workspace. `Escada_Layout_preliminar_para_aprovacao_LC02.pdf` está disponível em Downloads, também com uma cópia `(1)`. `01 - Telhado Dyno AGCO - Prancha LVHF.pdf` e `out_all.pdf` não foram encontrados nesses locais nesta conferência. Isso não é conclusão de ausência em todo o computador.

O conteúdo técnico e as 16 páginas descritos no prompt 24 não foram certificados por esta leitura de especificações. PE06–PE13 com os originais específicos dependem da disponibilização/localização dessas fontes ou de testes equivalentes explicitamente classificados. Nenhum PDF original foi alterado ou inserido no banco operacional.

## Plano por dependências e gates

| Onda | Entrega vertical                                                                        | Gate para avançar                                                                           |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0    | HEAD, inventário, fontes, baseline e limites protegidos                                 | Lacunas factuais e checks registrados; mudanças não relacionadas preservadas                |
| 1    | Ambiente Lovable/banco, ledger/ordem, autorização, pessoa, ações, anexos e recursos     | Projeto/repo/banco confirmados; instalação/upgrade e primeira jornada com dois tenants      |
| 2    | Shell/componentes reais e cadastros de clientes; integrações mínimas catálogo/comercial | Desktop/mobile e persistência/isolamento; motores de referência sem regressão               |
| 3    | Levantamentos e estudos; acervo/versionamento de Projetos de Engenharia                 | Fontes/revisões/aprovação preservadas; upload privado e recuperação demonstrados            |
| 4    | Projetos, compras/produção, estoque e ferramentas                                       | Recebimento/qualidade/saldo/reserva concorrente conciliáveis; compra operacional compatível |
| 5    | OS, horas/RDO, equipe e logística                                                       | Trabalho de campo/revisão, troca de pessoa, material e viagem fecham com histórico          |
| 6    | Ativos, inspeções, ações/segurança e manutenção                                         | Ciclo físico/técnico e recorrência deduplicada; restrições/qualificações reais              |
| 7    | Documentos/dossiê; IA/leitura/editor/variantes/PDF do novo domínio técnico              | Artefatos imutáveis, evidência de IA real e famílias suportadas ponta a ponta               |
| 8    | Financeiro, relatórios/dashboard e organização da biblioteca 3D                         | Eventos conciliados, payload autorizado e cenas preservadas                                 |
| 9    | Agenda Equipe consolidada                                                               | Origens funcionais; conflitos/recorrência/timezone/notificações backend demonstrados        |
| 10   | Homologação cruzada, documentação e PR                                                  | Matriz requisito/evidência sem falso positivo; draft se impedimento essencial persistir     |

O plano distribui etapas, não reduz o requisito final. Cada onda só muda de situação por evidência registrada. Trabalho independente continua quando um serviço externo estiver pendente; a limitação exata permanece visível.

## Gates de validação e revisão

- Executar scripts reais do `package.json` e CI pertinentes: typecheck, lint, build, orçamento/catálogo, banco e UI. Alteração compartilhada exige conferir gates industriais/escada/silo definidos pelo projeto.
- Manter T01–T35 do plano mestre como matriz transversal: instalação/upgrade, isolamento e revogação, fluxos técnicos, ordens/estoque/horas, imutabilidade, jobs, financeiro, logística, agenda e logout.
- Manter PE01–PE35 como matriz própria do novo menu. Unitário, SQL, E2E real e captura são evidências distintas; teste de interface com fixtures não promove módulo a validado.
- Validar 360/390, 768 e 1366/1440 CSS px, estado com dados/vazio/erro/formulário/detalhe, teclado/foco/zoom/contraste e retorno preservando recorte. Emulação não equivale a aparelho físico.
- Não semear dados fictícios no ambiente operacional. Carga de teste, dois tenants, documentos e screenshots usam ambiente isolado e limpeza controlada.
- Medir paginação e bundles; nenhuma lista operacional carrega Three.js/GLB. Metas de LCP/INP/CLS e p50/p95 têm ambiente, amostra e limites documentados, sem alegação de percentil de produção a partir de uma execução local.
- PR descreve somente escopo implementado, migrações realmente aplicadas e testes executados. Não se declara entrega integral quando leitura/IA/editor/exportação essencial está simulada ou sem validação material.
