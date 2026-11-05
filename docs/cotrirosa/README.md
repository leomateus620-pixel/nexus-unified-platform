# Cotrirosa · fábrica de ração · revisão de implantação e PET

Implementação local na branch `codex/cotrirosa-unidade-3d-pet`, reconciliada com `origin/main` no commit `e408c628b8726b3b626882ce95fc45377f9f030f`. Inspeção e validação em 05/11/2026. A consulta autenticada foi seguida da aplicação autorizada das migrações 0061–0065 pelo conector Lovable. O ledger remoto chegou a 84 entradas, com cinco alvos, RLS e nenhuma referência órfã. Contagens do acervo e snapshots históricos foram preservados. Dados de exercício existem apenas no PostgreSQL descartável local; não foi criada PET de teste em produção.

## Abrir e revisar

- Prévia compilada: http://127.0.0.1:4197/nr-33/mapa-3d?cliente=9d6dfbe8-285a-44e5-9ea1-2574daa7cb28&unidade=6a454dcc-82b2-4506-aca3-410a3cc820f2
- Prévia de desenvolvimento: mesma rota na porta 4196.
- Caminho integrado: **NR-33 ou NR-35 → COTRIROSA → Fábrica de Ração — Santa Rosa → 3D**. No celular: **Área do módulo → Mapa 3D**, também disponível pelo painel.
- Comparações locais: `comparacoes.html`; planta: `implantacao.svg`; coordenadas: `implantacao.geojson` / `implantacao.kml`; transformações: `posicoes.md`.
- O laboratório usa a interface real, rotas TanStack e RPCs SQL reais, com sessão/dados de teste explicitamente identificados. Fotos/documentos privados da produção não foram copiados para a demonstração. Ausência de uma integração continua explícita; não há arquivos, detector ou assinatura simulados.

Os serviços locais precisam continuar ativos. Para reproduzir, use um cluster PostgreSQL dedicado em loopback, com `PGTEST_EPHEMERAL=1`, `PGTEST_HOST=127.0.0.1` e `PGTEST_PORT=55xxx`. `tests/cotrirosa/seed.mjs` cria um banco novo `cotrirosa_lab` (ou `cotrirosa_test_` seguido de timestamp, informado em `NEXUS_COTRIROSA_LAB_DB`) e aplica o manifesto canônico; `seed-closed.mjs` acrescenta a fixture encerrada identificada. Rode `npx vite --config tests/cotrirosa/vite.config.mjs`, depois o build dessa configuração e `node tests/cotrirosa/preview.mjs`. O laboratório recusa configuração remota; não use credenciais de produção.

## Referências geográficas e limites

O ponto informado, **27°49′57,31″ S / 54°25′46,96″ W**, equivale a **−27,8325861111 / −54,4297111111**. A origem da cena foi fixada no centro visual da cobertura do SA 05, **−27,832775 / −54,4300861111**. O plano local usa metros, +X para leste aproximado, +Z para sul e +Y para cima. Implantação, transformação dos ativos e geometria reutilizável são independentes.

O Google Earth foi inspecionado no Chrome Léo. A camada identificou **Airbus, 19/03/2026**. O traçado manual de 14 vértices incluindo o campo ao norte retornou **115.851,58 m² e 1.421,5 m de perímetro**. A apresentação usa **aproximadamente 11,6 ha e 1,42 km**: os decimais preservam a leitura da ferramenta, não precisão cadastral. Cercamento, taludes e vegetação ajudam a interpretar limites físicos; não demonstram propriedade nem divisas legais. O setor construído, em um traçado preliminar separado de seis pontos, resultou em cerca de 6,55 ha; não confundir com o perímetro completo solicitado.

Controles observáveis: centro SA 05, extremidade norte da bateria, quinas norte dos dois grandes galpões, quina sul da fachada Union e bordo das vias. Medidas manuais de controle: **33,3 m** entre os centros extremos da bateria; cobertura do galpão norte **63,37 × 44,27 m**; largura da cobertura do CD **78,51 m**. As duas coberturas usam quinas lidas no Earth, inclusive o giro, em vez de copiar a orientação de um retângulo genérico. Alturas e profundidades sem controle continuam aproximadas. Bordas de telhado não certificam paredes externas.

A foto aérea fornecida foi calibrada a aproximadamente **0,46 m/pixel**, em 900 × 1600 pixels, pela bateria e pelos galpões. Os controles apresentam diferenças de alguns metros: não é uma ortofoto cadastral. Um ajuste global alternativo por similaridade produz cerca de 0,477 m/pixel e resíduos de até 6,3 m. Preservou-se a escala local conferida e priorizaram-se as quinas Earth nas duas grandes coberturas. Não se esticaram silos para compensar diferenças entre imagens.

O Earth indicou aproximadamente 293–330 m de elevação ao longo do perímetro. Isso não é um DTM validado: a cena usa apenas uma transição visual suave no campo norte e na chegada, mantendo a plataforma fabril. Nenhum nível visual participa de cálculo de segurança, ancoragem, capacidade ou ventilação. A visualização inclinada do Earth mostrou imagem sobre relevo, sem um modelo fotogramétrico detalhado das construções; não foi usada para deduzir alturas certificadas.

**Chegada revisada:** o recorte aéreo posterior e a nova inspeção Earth permitiram corrigir a interpretação inicial da ilha alongada. O retorno é circular e a rodovia atravessa seu centro, separando duas ilhas verdes. Os ramais da fábrica e da via lateral encontram a mesma superfície de asfalto, sem pedaços sobrepostos. Centro visual do retorno: **27°50′05,72″ S / 54°25′45,49″ W**; portão: **27°50′03,23″ S / 54°25′45,56″ W**; distância de controle aproximada **76,5 m**. O recorte local usa cerca de **0,317 m/pixel**, diferente da escala da aérea geral. Raios, cotas e curvas são aproximações visuais, não projeto viário. A recepção indicada pelo usuário, a marquise de cobertura clara, a árvore frontal e as cercas vivas foram incluídas. O Street View de janeiro de 2024 sustenta somente os detalhes visíveis de fachada e cerca, não a condição atual da pavimentação.

Capturas Earth locais: `earth-perimetro.jpg`, `earth-implantacao.jpg`, `earth-obliquo.jpg`, `earth-streetview-cerca.jpg`, `earth-chegada.jpg`; leituras: `earth-vertices.json`, `earth-controles.json`. A atribuição da fonte permanece nas capturas. Não foram baixados tiles nem incorporada imagem do Google no pacote da cena.

## Reconciliação do servidor

Cliente `9d6dfbe8-285a-44e5-9ea1-2574daa7cb28`; unidade `6a454dcc-82b2-4506-aca3-410a3cc820f2`; organização `abab473b-8baa-4781-aed2-c1243338af65`. Nome cadastral preservado: **Fábrica de Ração — Santa Rosa**. Endereço: BR-472, s/n, Cruzeiro, Santa Rosa/RS.

| Recorte consultado em 05/11 | Resultado |
|---|---|
| Locais / levantamentos / pendências abertas | 30 / 30 / 17 |
| Documentos lógicos NR-33 | 344: 220 da origem + 124 cópias editáveis |
| Cópias aguardando comprovação de correspondência | 61 |
| Arquivos físicos vinculados verificados | 641 na consulta direta de vínculos; o painel autenticado ainda exibia 630. Os recortes de contagem diferem e não foram tratados como a mesma métrica |
| Documentos lógicos sem recorte de norma | 379; não somar a 344 |
| Cada um dos cinco silos, recorte NR-33 | 11 registros: 7 da origem + 4 cópias; 2 cópias com comprovação pendente; 9 registros principais |
| Cada silo, recorte NR-35 | 1 documento da origem |
| Histórico operacional de PET | vazio na consulta real |
| Versões de procedimento aprovadas / integração de assinatura habilitada / designações RT vigentes | 0 / 0 / 0 |

Cadastros e procedimentos consultados: Rev. 03; Memorial, PAE, PGSSTA, PPREC e PTA: Rev. 02. O servidor os descrevia como vigentes/emitidos na origem. Isso não transforma disponibilidade de PDF/Word em comprovação de correspondência da cópia, nem em aprovação técnica para uma PET nova. A interface reutiliza os registros e seus estados separados.

## Matriz dos cinco alvos

| Cena | Entidade e UUID NR | Espaço PET real conferido | Fonte e cotas internas | Posição / confirmação / exibição |
|---|---|---|---|---|
| sa01 | EC 24 · SA 01 · `ed835456-14f5-430a-a12b-55a92c86c018` | `2b88a821-7d91-48a6-b421-e29f1299bed6` | B07; PDF p. 3–6; D 6,00 / reta 6,60 / cone 3,60 m | Primeiro elemento da bateria na hipótese visual; UUID confirmado, posição física ainda a conferir; ficha, fotos, acervo, avaliações, PET e histórico autorizados |
| sa02 | EC 25 · SA 02 · `8b0ed1b7-53df-4743-8be1-6b34221e471e` | `594794ae-e393-47ab-800b-dec5e4a348e7` | B07; PDF p. 3–4 e 7; mesmas cotas | Segunda instância independente; apelido S02; não herda documentos dos vizinhos |
| sa03 | EC 26 · SA 03 · `18f64e04-8674-4870-a7cd-8b633e1b2282` | `52ae4e44-9838-4808-9fbe-c5dd77f46c54` | B07; PDF p. 3–4 e 8; mesmas cotas | Terceira instância; apelido S03; ordem espacial aproximada |
| sa04 | EC 27 · SA 04 · `d1977ff8-36ab-4241-a884-bee802df1b94` | `344eace1-4e12-4e48-932d-46db017e9301` | B07; PDF p. 3–4 e 9; mesmas cotas | Quarta instância; apelido S04; posição junto ao conjunto fabril |
| sa05 | EC 28 · SA 05 · `c640b3bd-2731-490d-ab3a-d47a7953bce0` | `52618cf1-7fe2-4b45-be29-8b7ceaa5be7e` | B07; PDF p. 10–13; D 9,60 / reta 16,50 / cone 4,11 m | Centro de referência geográfica; apelido AS 05 preservado; diâmetro por interpretação técnica e medição a laser pendente |

Todas as medidas acima são internas de cadastro. Cobertura, folga da descarga, suportes e acessórios são parâmetros visuais separados. A sequência física SA01–04 permanece marcada como aproximada; a confirmação de criação exige reconhecer a TAG. Seleção por geometria nunca emite ou libera PET. A legenda Nexus do EC28 informa 31 minutos e a transcrição da placa no PDF p.13 informa 34: ambas as fontes continuam na conferência; nenhum valor é preenchido na PET.

## Outras estruturas e fontes

| Elemento | Vínculo / confirmação | Construção e lacuna preservada |
|---|---|---|
| Fábrica · Rações Union | Identidade produtiva pela ficha EC28; marca visual pela foto frontal | Três volumes contíguos, vermelho-alaranjado, base clara, marquises verdes; sem atribuir EC/PET à edificação inteira |
| Centro de Distribuição Cotrirosa | Inscrição comprovada na empena da aérea real | Cobertura sudeste, pátio próprio, quinas norte Earth; não recebe acervo de outro setor por proximidade |
| Galpão cinza ao norte | Massa e cobertura observadas | Quinas e escala Earth; função documental pendente |
| Edificação frontal escalonada | Nova aérea + Street View 2024 | Massas clara/verde, caixilharia e portas observadas; uso específico não presumido |
| Galpão verde / apoios / marquise de chegada | Identificação visual | Volumes separados conforme aérea; não rotulados como balança, escritório ou guarita sem comprovação |
| Moega EC29 | PDF p.14–16, ficha e acervo | Consulta pelo inventário; nenhuma posição externa inventada |
| Elevadores EC23 e EC30 | Comprovação interna pelo PDF | Torre externa representada pela forma; sem equivalência presumida a R-EL03 ou R-EL01/02 |
| Passarela e transportadores | PDF p.3–4 | Alvo de conjunto próprio; nunca escolhe um silo arbitrário. A escada inclinada foi limitada ao trecho superior documentado |
| Campo norte, ruas, cercas, portão e vegetação | Earth, aérea e fotografias | Contexto visual recalibrável; cerca contínua de trabalho nos trechos não comprovados é aproximação; sem cards PET ou documentos vazios |
| EC01–22 internos | Cadastro e PDF p.18–20 | Permanecem nas listas/fichas setoriais; não foram inventados objetos externos para completar 30 marcadores |

As transformações completas estão em `posicoes.md`. Os anexos de IA iniciais foram tratados somente como estudo de enquadramento, nunca como fonte de cor, divisa ou posição.

## PET demonstrativa e nova ficha

A atualização da ficha expandida e do fluxo demonstrativo está documentada em [demonstracao.md](demonstracao.md), incluindo persistência separada, migração 0066 aplicada pelo Lovable e evidências desta etapa. Os resultados abaixo registram a implantação e o fluxo operacional da entrega anterior.

## Implementação e verificações

React 19.2.8, TanStack Router 1.170.41 / Start 1.168.60, Three 0.186.0, R3F 9.7.0, Drei 10.7.8, Vite 8.1.5. Reutilizados OrbitControls e fichas NR/PET existentes; a convenção de reflexão industrial foi adaptada em componente exclusivo para conservar os arquivos protegidos das outras cenas; nenhum terreno de outro cliente foi importado. O manifesto Cotrirosa fica no servidor e as cinco identidades dependem da associação publicada/autorizada. O motor é carregado somente ao entrar na rota 3D.

O modelo compartilha materiais e geometrias dos quatro silos, agrupa partes por material/instância, instancia vegetação, usa detalhe próximo com LOD, texturas pequenas com mipmaps e perfil econômico para toque/software. Renderização sob demanda; descarte de geometria/material/texturas ao desmontar. Normal permite olhar de baixo para cima sem cruzar o solo; Superior usa ortográfica; Angular mantém órbita oblíqua. Arraste/pinça não selecionam. Ficha resumida conserva o terreno, expansão é voluntária, fechamento preserva a câmera. Lista e PET sobrevivem à falta/perda de WebGL.

`0061_nr_mapa_pet_unidade.sql` é aditiva: OS opcional na criação unitária, FKs compostas, vínculo NR imutável, origem, backfill único por espaço, autorização atual, recibos idempotentes e filtro unidade+espaço anterior à paginação. A OS antiga mantém suas restrições de encerramento. Modelos seguem a elegibilidade real do domínio (versão aprovada da organização), sem inventar aprovação específica de um equipamento. O responsável técnico deve validar o procedimento aplicável antes da habilitação operacional.

Evidências executáveis: `tests/cotrirosa/validate-ui.mjs`, `tests/cotrirosa/benchmark.mjs`, `tests/db/nr-mapa-pet.mjs`, `tests/nr-map.test.ts`, suites NR/PET existentes e manifesto canônico de migrações. Resultados detalhados em `ui-results.json`, `performance.json` e logs locais. A fixture encerrada é explicitamente administrativa, sem emissão, assinatura ou presença: verifica consulta/isolamento, não certificação operacional.

## Atualização NR v2 e resultados

A comparação completa está em [atualizacao-v2.md](atualizacao-v2.md). Novas áreas: Documentos contratados, Equipe e certificados, PET da unidade com Ao vivo/CSV/consulta autenticada, QR e formulário em branco condicionado ao modelo aprovado. O mapa usa o mesmo backend e preserva as relações de NR-33/NR-35.

Medição de 05/11/2026, Chromium 153, Intel UHD/D3D11 no notebook Windows, cache frio, rede emulada 20 Mb/s e 40 ms, 30 s de órbita:

| Perfil | Interação | Mediana / pior segundo | Draw calls máx. | Triângulos máx. |
|---|---|---|---|---|
| Desktop 1440 × 1000 | 3,679 s | 58 / 51 FPS | 205 | 520.806 |
| Toque emulado 390 × 844, mesma GPU | 2,199 s | 60 / 59 FPS | 204 | 272.406 |

648.265 bytes transferidos até a interação; renderização em repouso pausada. O backend estava em loopback. A medição anterior tinha desktop com buffer de 1488 pixels; não é um par rigoroso para afirmar ganho percentual. SwiftShader foi registrado separadamente, com desempenho insuficiente. Não houve medição em telefone físico, Safari/iOS ou conexão móvel real.

Tipos, build principal/laboratório, testes unitários NR/PET/pessoas e regressão PostgreSQL foram executados; `validacao.json` distingue os conjuntos e suas limitações. UI: 32 verificações da jornada de mapa/PET e 13 da atualização v2, com desktop/celular emulado e sem erros JavaScript. Lint dos arquivos alterados: zero erros, dois avisos de Fast Refresh.

## Estado da entrega e pendências reais

Implementação e prévia local integradas, publicadas para revisão na [PR #22](https://github.com/leomateus620-pixel/nexus-unified-platform/pull/22). Migrações **0061–0065 aplicadas pelo conector Lovable em 05/11/2026**, ledger 84. O conector aponta ao projeto real; não foi encontrado um banco de homologação remoto separado. O deploy da interface é uma etapa separada e será registrado após sua verificação.

Permanecem necessários para ativação real: deploy verificado desta versão, procedimento vigente aprovado pelo responsável técnico, designação técnica e integração de assinatura/originais verificáveis. Sem essas condições, os bloqueios são preservados. A referência normativa é a página oficial de [NRs vigentes do Ministério do Trabalho](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes); o mapa não substitui procedimento validado.

Ainda não comprovados: divisa e medidas externas por levantamento, ordem física final das placas, fachada externa da moega, correspondência da torre/elevadores, função do segundo galpão, detalhes ocultos e desempenho em telefone físico. A aparência foi refinada por referência, mas não deve ser chamada de reconstrução fotogramétrica ou fotorrealismo certificado. O repositório remoto é público: as fotografias reais, capturas autenticadas e vídeos locais estão excluídos do Git e não foram publicados.
