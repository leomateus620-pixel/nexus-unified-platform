# Integração com PostgreSQL

O runner exige **PostgreSQL 17 ou superior**, com `initdb`, `pg_ctl` e `psql` no `PATH`. A migração0058 substitui a expressão de uma coluna gerada usando `ALTER COLUMN SET EXPRESSION`, disponível a partir do17. Use binários da mesma instalação; não selecione versões ordenando nomes de diretórios.

```sh
PGTEST_PORT=55432 bash tests/db/run.sh
```

Escolha uma porta local livre. O runner cria um cluster temporário com autenticação de teste, instala as migrações reais na ordem do manifesto e executa os cenários de transação, RLS e concorrência. O `trap` encerra esse cluster e remove seu diretório ao sair. Os cenários recebem `PGTEST_EPHEMERAL=1`; não aponte os testes para bancos operacionais. O runner PowerShell tem o mesmo requisito e recebe a instalação pelo parâmetro `PostgresBin`.

O CI instala `postgresql-17` e `postgresql-client-17` pelo [repositório oficial PGDG para Ubuntu](https://www.postgresql.org/download/linux/ubuntu/) e seleciona `/usr/lib/postgresql/17/bin` explicitamente. Não depende da versão incluída em `ubuntu-latest`. A necessidade de17 está descrita no [contrato oficial de ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html).
