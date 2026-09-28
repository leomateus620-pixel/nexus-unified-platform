# Liberar a geração de OC/OP nas etapas 4 e 5

## O que muda
- O botão "Gerar ordens (OC por fornecedor / OP)" fica ativo em Planejamento de compras e de produção, sem esperar a revisão ser aceita.
- Some o aviso amarelo "Geração de OC/OP disponível após a aceitação da revisão".
- O texto do topo passa a dizer que as ordens podem ser geradas a partir da demanda planejada.
- As ordens nascem como **rascunho**. Emitir a OC e liberar a OP para fabricação continuam exigindo os dados obrigatórios e a aprovação técnica, como hoje.
- Quando a revisão for aceita depois, as ordens já geradas são vinculadas ao projeto automaticamente (isso já acontece hoje).

## O que continua exigido
- A demanda precisa estar planejada ("Atualizar demanda a partir da composição").
- Os itens comprados precisam ter fornecedor escolhido.
- O usuário precisa ter permissão de emitir ordens.

## Detalhes técnicos
- `src/features/propostas/Etapas.tsx` (Planejamento): remover `disabled={!aceita}`, o `title` e o bloco de aviso `{!aceita && ...}`, e ajustar a `description`.
- `src/features/propostas/propostas.functions.ts` (`gerarOrdens`): remover a checagem `rev.status !== "aceita"` e a exigência do projeto. Buscar o projeto com `maybeSingle()` e gravar `projeto_id: proj?.id ?? null` nas OC/OP. Bloquear só revisões `recusada`/`substituida`.
- Banco: `projeto_id` já aceita vazio em `ordens_compra` e `ordens_producao`, e o aceite já preenche esse campo depois. Nenhuma migration é necessária.
