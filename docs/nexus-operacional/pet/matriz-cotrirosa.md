# Matriz da ficha PET Cotrirosa → Nexus

Referência: ficha em papel "Permissão de Entrada e Trabalho — PET" da Cotrirosa (foto PET - EC (2)).
Catálogo compartilhado: `src/features/pet/cotrirosa-ficha.ts` (versão `cotrirosa-ficha-1`).
Demo: dados em `pet_demo_sessoes.conteudo.ficha`, validado por `pet_demo_validar` (migração drizzle 0015).

Legenda — **Demo**: preenchível, salvo e relido na PET de demonstração. **Op.**: PET operacional.
"Modelo" = depende de nova versão do modelo aprovado da unidade (processo técnico de aprovação).

| Campo da ficha | Etapa Nexus | Componente | Dado | Validação | Conferência | Demo | Op. |
|---|---|---|---|---|---|---|---|
| Perigos: 5 famílias + Outros | Segurança | HazardMeasurePicker + FICHA_PERIGOS | `seguranca[]` (grupo, perigo, origem, medidas) | perigo ≥2 chars, origem avaliação/entrada | Pendências de segurança | Sim | Existente (PetEditor, famílias próprias) — alinhar ao catálogo: pendente |
| Energias, engolfamento (Nexus) | Segurança | grupo "Nexus · …" | idem | idem | idem | Sim | Existente |
| EPC isolamento (4 itens) | Segurança | FichaChecklist fase=controle | `ficha.respostas.epc_*` | S/N/NA/NV; NA exige justificativa (servidor) | Pendências da ficha | Sim | Modelo |
| EPC resgate 4×1 / corda / iluminação fixa / escada / rádio Ex / mov. vertical | Segurança | idem | `epc_resgate_4x1`, `epc_corda`, `epc_iluminacao_fixa`, `epc_escada_movel`, `epc_radio_ex`, `epc_mov_vertical` | idem | idem | Sim | Modelo (hoje agrupado em preparation-domain) |
| EPI básico, cinturão (S/N), talabarte, trava-quedas | Segurança | idem | `epi_basico`, `epi_cinturao`, `epi_talabarte`, `epi_trava_quedas` | cinturão só S/N | idem | Sim | Modelo |
| Respirador PFF1/PFF2/semifacial, auricular, creme, roupa | Segurança | idem (+detalhe) | `epi_respirador.detalhe`, `epi_auricular`, `epi_creme`, `epi_roupa` | idem | idem | Sim | Modelo |
| Proteção respiratória trabalho / resgate; elétricos Ex | Segurança | idem | `epi_resp_trabalho`, `epi_resp_resgate`, `epi_eletrico_ex` | idem | idem | Sim | Modelo |
| Outros EPC/EPI | Segurança | "Adicionar outro" | `ficha.outros[]` | descrição obrigatória, resposta própria | idem | Sim | Ausente |
| Teste inicial: horário, H₂S, CO, LIE, O₂ | Atmosfera | ReadingRows momento=inicial | `leituras[momento=inicial]` | número; O₂ fora 19,5–23 % = impeditiva | Testes atmosféricos | Sim | Existente (avaliação Inicial, PetOperations) |
| Supervisor dos testes / assinatura | Atmosfera | TesteMetaFields | `ficha.testes.inicial.responsavel/confirmado` | responsável exigido se houver leitura | Pendências | Sim (confirmação, sem assinatura ICP) | Existente (responsável); assinatura por teste: pendente |
| Aparelho da filial S/NA + nº de série | Atmosfera | TesteMetaFields | `aparelho_filial`, `instrumento`, `serie` | — | Testes | Sim | Existente (instrumento/série) |
| Bloqueios, purga | Atmosfera | FichaChecklist fase=antes | `pre_bloqueio`, `pre_purga` | S/N/NA | Pendências | Sim | Existente parcial (texto/confirmação) |
| Ventilação S/NA, tipo, equipamento, tempo | Atmosfera | FichaChecklist + VentilacaoFields | `pre_ventilacao`, `ficha.ventilacao` | tipo e tempo exigidos quando Sim | Pendências | Sim | Existente parcial |
| Teste após ventilação/isolamento | Atmosfera | ReadingRows momento=pos_ventilacao | `leituras[momento=pos_ventilacao]`, `ficha.testes.pos_ventilacao` | exigido quando ventilação = Sim | Lado a lado; marca "fundamenta a entrada" | Sim | Existente (avaliação Após ventilação) |
| Comunicação, resgate, movimentação vertical | Atmosfera | FichaChecklist | `pre_comunicacao`, `pre_resgate`, `pre_mov_vertical` | S/N/NA | Pendências | Sim | Existente parcial |
| Treinamento conferido? / válidos? | Atmosfera | FichaChecklist | `pre_treinamento`, `pre_treinamento_valido` | S/N | Pendências; comprovante na etapa Equipe | Sim | Equipe/certificados existente |
| Monitor contínuo adequado | Atmosfera | FichaChecklist | `pre_monitor_continuo` | S/N | Pendências | Sim | Existente (config. monitoramento) |
| Permissão de trabalho a quente | Atmosfera (previsto) | FichaChecklist fase=durante + QuenteFields | `dur_trabalho_quente`, `ficha.quente.referencia` | Sim sem referência = pendência | Pendências | Sim (identificação textual) | Ausente — vínculo a permissão autorizada pendente |
| SAMU 192, Bombeiros 193, Ambulância, Segurança | Acompanhamento | ContatosEmergencia | fixos + contatos da unidade | sinaliza "não cadastrado" | — | Sim (unidade sem cadastro) | Existente como texto agrupado |
| Interrupção, saída, ocorrência, prorrogação | Acompanhamento/Encerramento | fluxos existentes | eventos | regras do servidor | Histórico | Existente | Existente |

Regras:
- Todo item começa "Não verificado". "Não" em qualquer item gera pendência impeditiva (ficha: "a entrada deve ser proibida…").
- IDs novos nunca herdam resposta de IDs agrupados antigos.
- O₂: 20,9 % ok; 19,5–23 % "atenção" (causa conhecida e controlada, NR-33 33.5.15.2); fora = bloqueio. Limites de H₂S/CO/LIE vêm do modelo aprovado — não definidos no catálogo.
- Catálogo da demo segue rotulado "não validado tecnicamente".

Testes: `tests/pet-ficha-cotrirosa.test.ts` (9 casos).
