# Regeneração oficial dos tipos Supabase

## Geração47 — Agenda integrada

Geração48 repetida oficialmente após0029: mesmos117 tabelas/208 funções/4 enums
e mesmo hash público abaixo, pois somente corpo SQL de leitura foi alterado.
Manifesto e warning capturados em `evidencias/geracao-tipos-48.json`.

`scripts/supabase-types/run.ps1 -Write` executado sobre PostgreSQL16.15 local
descartável com as47 migrações, pelo gerador oficial postgres-meta0.100.0.
Saída117 tabelas/208 funções não trigger/4 enums,266868bytes; SHA-256
`17b0786861370e4022a9e2e86693e2a8d171009b6e72bab7939af3a3a940c26a`.
Diagnóstico TypeScript isolado zero; formatação com AST preservada. O warning
upstream de11listeners ficou registrado, sem ocultação. Nenhum tipo gerado foi
editado manualmente. Catálogo local e conectado conciliados em `schema-diff-47.json`.
Esta geração não usa credenciais nem dados operacionais e não é E2E do runtime.

## Atualização45

Geração oficial repetida sobre45 migrações:109 tabelas/163 funções não trigger/
quatro enums. Arquivo241.098bytes, SHA-256
`03612663994451fb03bb720f0c6c0925629cb928df60ef7782de2f4add4de3c9`.
AST preservada, sem diagnóstico isolado; aviso upstream de11 listeners mantido.
`pessoa_usuario_identidades` aparece no contrato estrutural, sem grant de leitura
de registros. Proveniência em `evidencias/geracao-tipos-45.json`.

## Atualização44

Processo oficial repetido sobre44 migrações em PostgreSQL16.15 descartável:
108 tabelas/161 funções não trigger/quatro enums, somente `public`. O hash público
permanece `60ace1c4b951e3dcfb052bd35c31613937cf9605b1359c9a3a5001f27bd9617d`,
239.637bytes; a0025 corrige corpos sem mudar assinaturas. Sem diagnóstico isolado,
AST preservada, typecheck global aprovado antes da fatia PE seguinte. Proveniência
em `evidencias/geracao-tipos-44.json`. O aviso upstream de listeners foi preservado.
Os registros abaixo documentam execuções anteriores.

`src/integrations/supabase/types.ts` foi regenerado a partir do catálogo PostgreSQL descartável do manifesto de 41 migrações. A saída oficial passa automaticamente pelo Prettier do repositório, com comparação da AST TypeScript antes/depois, sem edição manual. O processo não consulta dados do banco conectado, não usa credenciais do Lovable/Supabase e não aplica migrações remotas.

## Checkpoint 41

Nova execução pelo mesmo runner oficial: 95 tabelas, 131 funções não trigger e quatro enums; somente `public`. Saída formatada SHA-256 `3dfe812b6d0e464277e2b361869a3b0df8467f9f6b24cc19b91b6ca5a9778d82` (204.506 bytes), bruta `dab821316943394e49c7342dd0781fb839a4e1b780f7c1b95452a1dff6ac9ae6`. Compilação isolada sem diagnósticos e AST preservada. Registro em `evidencias/geracao-tipos-41.json`; o histórico abaixo preserva a prova anterior do checkpoint 40. A versão PostgREST 14.5 continua sendo o contrato do cliente, sem alegação de detecção remota.

O gerador é o pacote oficial [`@supabase/postgres-meta`](https://github.com/supabase/postgres-meta), versão **0.100.0**, obtido exclusivamente de `registry.npmjs.org`, com dependências transitivas fixadas em um lockfile próprio em `scripts/supabase-types/`. O modo `PG_META_GENERATE_TYPES=typescript` executa a introspecção e termina, sem abrir o servidor HTTP. A documentação oficial também descreve [geração por introspecção do banco com a CLI](https://supabase.com/docs/guides/api/rest/generating-types).

## Reprodução no Windows

Pré-requisitos: dependências do repositório instaladas, Node >=22.12, npm e binários PostgreSQL compatíveis. Na execução documentada foram usados Node24.15.0, npm11.12.1 e PostgreSQL16.15. Supabase CLI e Docker não estavam instalados no PATH nem nos locais usuais inspecionados; este fluxo usa diretamente o pacote oficial e não depende deles.

```powershell
$env:PGTEST_EPHEMERAL = '1'
& scripts/supabase-types/run.ps1 -PostgresBin 'CAMINHO\pgsql\bin' -Check
```

O parâmetro `-Check` confere a saída contra o arquivo versionado; `-Write` substitui o arquivo somente depois de validar o catálogo e compilar os tipos gerados. Sem esses parâmetros, mantém apenas o resultado em TEMP. Depois de `-Write`, executar `npm run typecheck`, ESLint dos arquivos tocados e `npm run test:orcamento`.

O runner cria um diretório e cluster novos em TEMP, escolhe uma porta livre em `127.0.0.1`, instala o pacote com `npm ci --ignore-scripts` e aplica as migrações reais na ordem do manifesto validado. Não executa os cenários SQL que inserem fixtures. O bootstrap fornece somente os metadados mínimos de Auth/Storage necessários à instalação local; **auth, storage e o ledger privado não são exportados**. Após a instalação, as conexões de introspecção usam `default_transaction_read_only=on`.

O processo rejeita ausência da flag de ambiente, host diferente de loopback, porta inválida e saída intermediária fora de TEMP. O subprocesso do gerador recebe uma lista restrita de variáveis; URLs de produção, chaves de serviço e outras credenciais globais não são repassadas. Ao terminar, o runner encerra o cluster, mantém os artefatos locais para inspeção e informa seu caminho. Nenhum comando de remoção recursiva é executado.

## Checkpoint43

Geração oficial concluída sobre43 migrações:108 tabelas,161 funções não trigger, quatro enums,239.637bytes formatados. SHA-256 final `60ace1c4b951e3dcfb052bd35c31613937cf9605b1359c9a3a5001f27bd9617d`, sem diagnóstico TypeScript isolado e com AST preservada. Proveniência em `evidencias/geracao-tipos-43.json`.

A geração42 expôs29 erros nas consultas existentes por nove FKs de suprimentos duplicadas. A migração append-only0024 substitui representações redundantes por uma FK composta por relação, preservando nomes históricos e ações NO ACTION/CASCADE. A análise global de tipos voltou a passar com as consultas anteriores intactas. Os pares também têm testes de catálogo e DML entre tenants; isso não substitui HTTP PostgREST no ambiente conectado.

## Contrato e conferência

- Schema incluído: somente `public`.
- `PG_META_POSTGREST_VERSION=14.5` preserva o contrato já declarado no cliente; essa versão **não foi detectada no serviço remoto**.
- Detecção de relações um para um habilitada, como no arquivo anterior.
- Gerador oficial0.100.0 utiliza `@supabase/typegen`0.2.2 e `@supabase/postgrest-typegen`0.4.0, fixados no lockfile.
- O runner confronta nomes de tabelas, colunas, funções não trigger e enums do arquivo com o catálogo e executa compilação TypeScript isolada. Mudança de manifesto durante o processo exige repetir em um cluster novo.
- Os contratos Zod e DTOs de domínio continuam responsáveis por validação, serialização decimal, estados e permissões. Tipos gerados não certificam RLS, execução de RPC, autorização ou transporte HTTP do Storage.

No checkpoint40 foram geradas **82 tabelas, 103 funções e quatro enums**, sem views. Nenhuma tabela ou coluna existente no arquivo anterior foi removida. Os helpers `Json`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums` e `CompositeTypes` permaneceram idênticos na saída bruta após normalizar CRLF. Três execuções brutas produziram o mesmo SHA-256 `b0010543f86309cc6a68e4d795c371da4e22a116549c65f581c233649618b720`, com165.333bytes. A saída formatada possui SHA-256 `a8a1e42873895234b693b54bb8c8f52696fa572530eabe95a26913c845d053eb`, com168.996bytes, e AST equivalente. Essa etapa resolve a diferença entre a formatação oficial e a regra Prettier do projeto sem desabilitar o lint. O gerador emitiu aviso upstream `MaxListenersExceededWarning` para11 listeners durante a introspecção; terminou com exit0 e saída válida, sem supressão do aviso.

## Correções mínimas reveladas pelos tipos

A migração0013 acrescentou FKs compostas por organização e manteve as FKs históricas. Assim, `clientes→unidades` possui `unidades_cliente_id_fkey` e `unidades_cliente_tenant_operacional`; `clientes→contatos` possui `contatos_cliente_id_fkey` e `contatos_cliente_tenant_operacional`. O seletor de nova proposta passou a selecionar explicitamente as FKs compostas, preservando os aliases e campos anteriores. Isso evita a ambiguidade real do embed PostgREST.

O patch de textos/parâmetros da revisão passou a declarar `NonNullable<Json>`, compatível com os objetos já produzidos e os campos PostgreSQL NOT NULL. Não foram alteradas fórmulas, dados, motor de orçamento, transições ou comandos transacionais. Outros embeds existentes de proposta para cliente/unidade/contato têm uma relação por destino; nenhuma alteração adicional foi necessária. As relações históricas múltiplas de `produto_estrutura→produtos` e `produtos→familias_codigo` não recebem novos embeds sem desambiguação neste recorte.

A regeneração modifica um arquivo que o comparador histórico inclui nos hashes. A diferença permanece visível; nenhuma lista protegida, snapshot ou hash de referência foi ajustado para escondê-la. A preservação dos motores e ambientes3D continua sendo verificada pelo perfil operacional próprio.
