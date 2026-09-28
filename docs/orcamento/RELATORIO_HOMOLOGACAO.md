# Relatório de correção e homologação — orçamento NEXUS

Base auditada: commit 70d62ba. Fonte das fórmulas: XLSX enviado (SHA-256 b42b1ae5…dab549).
Status: **homologação parcial**. A liberação geral continua bloqueada até os itens pendentes abaixo.

## Auditoria da migration de salvamento — produção

- Veredito inicial: **NÃO APLICADA**. A versão nominal `20260928010000`, suas quatro tabelas e as RPCs `capturar_revisao` / `concluir_revisao` estavam ausentes no banco usado pelo domínio publicado.
- Efeito observado: o frontend publicado chamava o contrato novo e recebia erro de função ausente antes de consolidar os itens selecionados.
- Correção: o conteúdo original foi aplicado (SHA-256 da fonte `7fd3090276c7261e729e3bf491e6cf3512af24a49b12cd7a5110050b00544557`) sob a versão registrada automaticamente `20260928034547`; a versão nominal `20260928010000` permanece ausente no histórico. Não foi criada marcação falsa. Seguiram-se migrations incrementais para seleção persistente, negação explícita de acesso direto às tabelas internas, wrappers públicos sem `SECURITY DEFINER`, edição em lote atômica e verificação de concorrência.
- As 2 revisões existentes receberam apenas checkpoint inicial; nenhum evento histórico foi fabricado.
- Estado após a correção: **APLICADA, MAS COM DIVERGÊNCIA DE IDENTIFICADOR**. Objetos e contratos estão instalados; o histórico não usa o número original do arquivo.
- O clique autenticado que altera proposta real permanece pendente para não modificar dados comerciais sem autorização específica.

## Evidências executadas (mesmo commit)
| Suíte | Comando | Resultado |
|---|---|---|
| Cálculo + planilha + autorização + fila de salvamento | `vitest` | 28/28 |
| Antes da correção (planilha) | `docs/orcamento/evidencias/antes-planilha.txt` | 6 falhas reproduzidas |
| Banco isolado (migrations reais, RLS, triggers, RPC) | `bash tests/db/run.sh` | 25 cenários + T05/T07 + contrato de salvamento e concorrência: todos passaram |
| Regressão Trevisan / Industrial | `bun run test:trevisan`, `test:industrial` | 8/8, 16/16 |
| Typecheck, lint, build | `tsc`, `eslint`, `bun run build` | OK |

O teste de banco encontrou dois defeitos reais na migration de segurança (nome ambíguo em
`registrar_movimento` e comparação inválida no bloqueio de saldos); ambos foram corrigidos por
migration incremental e repetidos.

## Achados
| Achado | Situação | Evidência |
|---|---|---|
| exigirPapel aceitava admin de outro usuário | Corrigido | `exigirAcao` filtra user+org; `tests/autorizacao.test.ts`; S02 |
| Políticas genéricas permissivas | Corrigido (substituídas por matriz `pode()`) | S02, S03 |
| Custos visíveis a perfil sem acesso | Corrigido no banco | S04 (0 linhas) |
| Relações entre organizações | Corrigido | S03 cliente de B |
| enviada→rascunho / edição de emitida | Corrigido | S05 |
| OC/OP emitida editável, saldo editável | Corrigido | S05 |
| Numeração count+1 | Corrigido | T06 |
| Recebimento sem idempotência/saldo | Corrigido | T05, T07, T08, C06 |
| OVERHEAD com ±1 | Corrigido | C01 (158/219/187; 40/56/48) |
| COMP-08 ausente | Corrigido (81 cj; R$ 10.145,25 custo bruto) | C01 |
| Entradas inválidas / trechos TELHADO | Corrigido | C05 |
| Cache de sessão residual | Corrigido (limpeza na troca de usuário) | revisão de código; sem teste de navegador |
| package-lock divergente | Corrigido (Bun único, CI com banco) | workflow |
| Item marcado não entrava no orçamento | Corrigido | inclusão persistente, alteração em lote atômica, recálculo enfileirado e demanda filtrada |
| Custo do catálogo sobrescrevia revisão | Preservado | preço usa `custo_adotado`; atualizar catálogo exige ação distinta |

## Pendente (liberação bloqueada)
- Navegador autenticado F08/F09 com perfis distintos: não executado nesta sessão.
- T01–T04 (conflito de versão, cálculo obsoleto, rollback injetado) no banco isolado.
- Decimal monetário único e distribuição de centavos (C08) e testes gerativos com seed.
- Aditivo de projeto (F06), reconciliação de demanda (F03) e snapshot completo de impressão (F07).
- Aprovações comercial/aceite vinculadas a hash (só a técnica foi implementada).
- 13 avisos do verificador de segurança sobre funções privilegiadas executáveis por usuários
  logados: são as verificações de permissão usadas pelas regras de acesso; precisam revisão individual.
- Validação técnica/fiscal das regras por profissional competente.
