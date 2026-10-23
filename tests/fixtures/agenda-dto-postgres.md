# Captura de contrato da Agenda

`agenda-dto-postgres.json` foi produzido pelo SQL candidato0027, em PostgreSQL16 descartável atualizado sobre o checkpoint45, com identidades fictícias e transação revertida. São nove projeções de leitura e sete recibos. O arquivo existe somente em testes; nenhuma aplicação recebe esses dados.

O teste valida o transporte PostgreSQL→Zod. Ele não comprova autorização Auth/HTTP, Storage conectado, execução de scheduler do projeto compartilhado ou persistência operacional. Os testes de banco e concorrência validam essas regras separadamente no ambiente descartável.

Execução reprodutível da captura versionada: `npx vitest run --config tests/vitest.agenda.config.ts`. Para confrontar uma nova captura feita pelo runner de banco, defina `AGENDA_DTO_INPUT` com seu caminho absoluto e execute o mesmo teste. Ausência de campos, contagem ou flags não é transformada em zero ou permissão implícita.

Captura inicial: SHA256 `021544f1a68794d4a5ea4fb5ab7707626c93cc2d6abce9ab7b3b9e75182b05e2`. A receita de exportação pertence aos testes SQL da candidata0027. Uma captura posterior deve ser gerada por SQL em ambiente descartável, sem ajustar os resultados manualmente para fazê-los passar.
