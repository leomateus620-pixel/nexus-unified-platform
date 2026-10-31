# Processamento contínuo de imagens NR

Executor do processador `nexus-storage-transform-v1`, dentro do mesmo Supabase da Nexus. A transformação nativa do Storage foi verificada no projeto; não usa provedor externo de imagem, processo de sandbox, Pillow ou WASM nesta função. O lote histórico `nexus-pillow-v1` permanece independente e seus objetos não são sobrescritos.

## Contrato

- O POST não aceita organização, cliente, unidade, caminho, URL ou limite pelo corpo. O consumidor solicita exatamente um trabalho da fila, da versão explícita, e usa somente os caminhos retornados pelo banco. A origem HTTPS permitida é exclusivamente a do projeto Supabase Nexus; configuração divergente falha antes de transmitir a credencial.
- `X-Nexus-Job-Token` deve conter um ticket aleatório de 64 caracteres hexadecimais, com validade de 120 segundos e uso único. A RPC `nr_imagem_worker_validar`, restrita a `service_role`, compara seu hash e o consome atomicamente. Somente o hash fica na tabela privada; nenhum segredo permanente é aceito para invocação ou enviado pela fila HTTP. A Edge recebe apenas a credencial padrão do próprio runtime.
- `verify_jwt=false` aplica-se somente a esta função. Isso permite o disparo privado do `pg_net`; o handler rejeita a chamada antes do claim se a RPC não consumir o ticket. Não há CORS nem rotas de leitura de arquivos neste endpoint.
- Os GETs privados de original e representação usam o endpoint autenticado. Chaves modernas `sb_*` ficam em `apikey`; a forma JWT legada também usa `Authorization`. Nenhum desses valores é registrado em logs.
- O original é lido com tamanho limitado, comparado por tamanho/SHA-256/MIME real e inspecionado por cabeçalho. O motor interno Storage decodifica a imagem e gera WebP com `contain`, qualidade 88 e box quadrado de lado `min(384 ou 768, maior lado do original)`. A inspeção do resultado rejeita ampliação, mudança de proporção ou rotação EXIF incompatível.
- O upload do derivado usa `x-upsert:false`. Um GET integral precisa coincidir em MIME, tamanho e SHA-256 antes da conclusão da RPC. Arquivo existente divergente é uma falha, nunca um overwrite.
- A migração `0058` controla exclusão por lease, disparo imediato, encadeamento após conclusão e cron de recuperação; `0059` substitui a autenticação de invocação por tickets descartáveis. A Edge não se auto-invoca e processa somente uma variante por request. Falhas deixam o original intacto e usam o contrato de tentativas limitadas da fila.

## Limites e verificação

O limite do arquivo original continua em 50 MiB. O processamento automático aceita até **25.000.000 bytes e 24 milhões de pixels**; acima disso registra falha explícita e preserva o original. O resultado tem no máximo 4 MiB. Há deadline de 45 segundos por execução, incluindo I/O; os downloads são limitados também quando não existe `Content-Length`.

Esses limites consideram que [Storage Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) possui limite próprio de imagem e formatos. Os [limites da Edge](https://supabase.com/docs/guides/functions/limits) são diferentes da memória contratada para o banco. A Edge faz I/O e hashes; o codec roda no serviço de transformação existente. O número de bytes e a latência de transformação/execução são registrados apenas como agregados, sem nomes, IDs de cliente, caminhos ou URLs.

O preflight usa `image-size@2.0.4`, com integridade em `deno.lock`, sem decoder nativo instalado. Ler cabeçalhos não é considerado prova de decodificação: a transformação interna precisa ter sucesso e o resultado WebP completo precisa passar pelo GET/SHA. Os testes locais usam imagens artificiais exclusivamente na suíte, sem envio a qualquer serviço.

Execute no diretório da função:

```sh
deno task check
deno task test
```

Os 15 testes cobrem autorização estreita, host e escopo fixos, original imutável, GET obrigatório, colisão idempotente/divergente, pequenas, EXIF, PNG transparente, MIME/HTML inválidos, limites de bytes/pixels/stream, proporção e falha de conclusão. Testes locais não substituem o recibo da invocação real no projeto.

## Aplicação

As migrações são aplicadas pelo conector Lovable após revisão do código e testes. O primeiro deploy desta nova função está pendente de uma via administrativa suportada: o conector recusou criar uma função Edge nova neste projeto TanStack Start. O dispatcher gera cada ticket dentro do banco, guarda somente seu hash e o envia à função pelo `pg_net`; ele nunca deve ser devolvido em consultas, conversas, arquivos ou logs. O dispatcher lê de Vault somente a URL restrita ao endpoint HTTPS do próprio projeto; o segredo fixo anterior não é consultado nem aceito pela validação. Aplicar as migrações não publica o frontend; publicar a função não comprova seu funcionamento até uma execução real e seus GETs serem confirmados.
