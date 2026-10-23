# PET Digital Nexus — reproduzir o laboratório local

O laboratório executa a interface da PET e as funções PostgreSQL reais em um banco controlado chamado `pet_demo`, acessado exclusivamente por `127.0.0.1:55439`. A sessão autenticada é substituída pelo transporte de laboratório, com usuário e organização de demonstração fixos. Os módulos da aplicação não importam esses registros de exemplo.

A reprodução abaixo foi conferida em **23/10/2026**, com PostgreSQL **18.4** e Node.js **24.19.0**, em cluster criado por `initdb` sem bancos/roles anteriores. A [evidência do seed](evidencias/lab-seed-validation.json) registra criação, roles, dados, recusa da segunda execução e parada preservando o diretório.

## Preparar um cluster novo e isolado

Pré-requisitos: dependências do repositório instaladas, Node.js com suporte aos módulos usados pelo projeto, Bun e executáveis PostgreSQL `initdb`/`pg_ctl` disponíveis no `PATH`. Execute como usuário sem privilégios de root. A porta **55439** precisa estar livre; o laboratório Vite usa **4193**. Um serviço existente deve ser parado pelo seu responsável antes de reutilizar essas portas.

No terminal, na raiz do repositório:

```bash
bun install --frozen-lockfile
PET_LAB_DIR="$(mktemp -d /tmp/nexus-pet-lab.XXXXXX)"
printf '%s\n' "$PET_LAB_DIR"
initdb -D "$PET_LAB_DIR/data" -U postgres --encoding=UTF8 --no-locale --auth=trust
pg_ctl -D "$PET_LAB_DIR/data" -l "$PET_LAB_DIR/postgres.log" -o "-h 127.0.0.1 -p 55439 -k \"$PET_LAB_DIR\"" start -w
PGTEST_EPHEMERAL=1 node tests/pet-ui/seed.mjs
bun run dev:pet-lab
```

Guarde o caminho impresso em `PET_LAB_DIR` para parar ou retomar o mesmo cluster. A autenticação `trust` é exclusiva deste cluster local descartável; o servidor escuta somente em loopback. Não use esse procedimento no projeto Lovable/Supabase conectado ou em banco operacional.

O seed exige explicitamente `PGTEST_EPHEMERAL=1`, tem host/porta/banco locais fixos e cria `pet_demo`. Em cluster novo, ele cria apenas as roles globais ausentes `anon`, `authenticated` e `service_role`, antes do bootstrap de Auth/Storage. Roles existentes não têm seus atributos alterados. Aplica primeiro `supabase/migrations`, depois `drizzle/migrations`, na ordem de arquivos vigente, e cadastra o contexto de demonstração por comandos reais do domínio.

A saída JSON informa IDs de organização, usuário, OS, espaço e PET. Abra [o workspace local de Execução](http://localhost:4193/execucao) ou use o ID retornado na rota `/execucao/pets/ID_DA_PET`. Os IDs da OS/PET variam entre clusters; os IDs fixos do usuário/organização pertencem apenas ao laboratório. A jornada mostra aviso persistente de demonstração.

## O que a demonstração comprova

A interface usa `src/features/pet/`, enquanto `tests/pet-ui/vite.config.mjs` troca os transportes Auth e funções de servidor por um endpoint local restrito à organização de demonstração. As consultas e escritas chegam ao PostgreSQL com role `authenticated` e identidade de laboratório explícita. Isso permite conferir preparação, respostas, pendências, bloqueios, presença conforme os registros disponíveis e relatórios derivados.

O laboratório **não valida o login real do Supabase, o serviço Storage HTTP privado nem um provedor ICP-Brasil**. Arquivos usam os metadados SQL disponíveis; o transporte de upload não está configurado. O PDF local é relatório de consulta com `persistido:false`, sem arquivamento privado afirmado. A preparação de pacote de contingência permanece bloqueada sem PET emitida e original assinado. Conferência técnica, emissão/encerramento certificados e identificação individual externa não são simulados como concluídos. Consulte [as dependências de ativação](operacao.md#dependências-para-ativação-operacional).

## Parar e retomar preservando os registros

Encerre o Vite com `Ctrl+C`. No terminal que conserva `PET_LAB_DIR`, pare somente o cluster criado acima:

```bash
pg_ctl -D "$PET_LAB_DIR/data" stop -m fast -w
```

O comando preserva `data/` e `postgres.log`. Diretórios em `/tmp` ficam sujeitos à limpeza do sistema; copie o acervo para uma localização adequada se precisar de retenção além deste ensaio.

Para retomar esses mesmos registros, informe o caminho guardado e inicie o cluster e o Vite:

```bash
PET_LAB_DIR="/tmp/nexus-pet-lab.SUBSTITUA_PELO_DIRETORIO_GUARDADO"
pg_ctl -D "$PET_LAB_DIR/data" -l "$PET_LAB_DIR/postgres.log" -o "-h 127.0.0.1 -p 55439 -k \"$PET_LAB_DIR\"" start -w
bun run dev:pet-lab
```

**Não execute o seed novamente para retomar.** Se `pet_demo` já existe, o seed recusa a operação com `42P04` antes de aplicar bootstrap/migrações ou inserir registros; os dados existentes permanecem preservados. Não há reset automático. Para uma demonstração nova, pare o cluster atual e inicialize outro diretório vazio com o procedimento da primeira seção.
