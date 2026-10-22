# Regeneração oficial dos tipos Supabase

`src/integrations/supabase/types.ts` foi regenerado a partir do catálogo PostgreSQL descartável do manifesto de 40 migrações. A saída oficial passa automaticamente pelo Prettier do repositório, com comparação da AST TypeScript antes/depois, sem edição manual. O processo não consulta dados do banco conectado, não usa credenciais do Lovable/Supabase e não aplica migrações remotas.

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
