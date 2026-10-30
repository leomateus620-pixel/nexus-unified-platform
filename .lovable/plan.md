Inspeção somente leitura (nada alterado)

- Projeto: Lovable Cloud ref yhtgijtllvgzoqtfcgal (o .env do cliente e as ferramentas usam o mesmo). Instância Small, ativa.
- Bucket nexus-nr-acervo: existe, privado, limite de 50 MB (52428800 bytes) por arquivo. Hoje tem 0 objetos (0 bytes).
- Configuração do servidor: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão presentes. Os valores não foram exibidos. Não falta nenhuma configuração para enviar arquivos pela API de Storage.
- Banco PostgreSQL: cerca de 36,5 MB (36457619 bytes, valor de pg_database_size).
- Franquia de 10 GB: não consegui confirmar daqui a qual recurso ela se aplica, nem se é GB ou GiB. Também não consegui ver a quota efetiva. Nenhuma ferramenta disponível mostra uma quota de storage ou de disco. Não fiz deduções a partir da RAM nem do limite por arquivo.
- Transferência: dá para fazer aqui com um script de manutenção no servidor, usando a chave de serviço e a API de Storage. O script pode manter os paths já preparados no banco. Limites: cada arquivo precisa ter no máximo 50 MB, a não ser que o limite do bucket seja aumentado (o limite geral do projeto pode ir até 5 GB). Os arquivos de origem precisam estar acessíveis nesta sandbox. Os IDs de storage.objects são gerados pelo Storage e não podem ser fixados. Se o banco referencia o ID do objeto, e não o path, essa referência precisa ser revista.
- Nada foi enviado.
