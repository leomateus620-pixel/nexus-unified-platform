# Representações privadas no runtime Nexus

O callback técnico `POST /api/public/nr/image-worker` reutiliza o servidor TanStack Start da aplicação. Não cria página, menu ou uma função Edge separada. A rota carrega `handler.server.ts` dinamicamente; core e decoder têm marcador `server-only`. As credenciais existentes `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são lidas por requisição e nunca retornadas ao navegador.

O ingresso público exige um ticket aleatório de 32 bytes, válido por 120 segundos e consumido uma única vez pela RPC de serviço. Apenas o SHA-256 é persistido na tabela NR privada. Corpo, organização, caminho e limite enviados pelo chamador não controlam o trabalho. Não há CORS. O segredo fixo criado na investigação inicial não é aceito nem enviado.

O claim atende uma representação `nexus-storage-transform-v1` por chamada e mantém um único lease nativo ativo global. O Storage transforma a imagem em WebP com proporção preservada, lados máximos de 384/768 px e qualidade 88, sem ampliar. Upload imutável e GET integral com hash, MIME, tamanho e dimensões precedem a conclusão. Os bytes originais, os caminhos Pillow e os estados técnicos permanecem independentes.

O processamento automático limita o original a **10 MiB** antes do download e a **24 milhões de pixels**, com stream limitado e orçamento de 45 segundos. O limite conservador considera o isolate compartilhado de 128 MiB do Cloudflare Workers e as cópias de buffers/hash; não é uma medição de pico no Worker publicado. Upload e preservação do original continuam aceitando **50 MiB**. Acima do limite automático, o original permanece disponível e o trabalho registra falha explícita, sem fingir uma prévia concluída.

O dispatcher PostgreSQL encadeia conclusões e o cron tenta recuperar a fila a cada minuto, respeitando leases e até três tentativas. A migração 0060 aceita somente `https://nexusgestao.app/api/public/nr/image-worker`. A ACL de pg_net é gerenciada pelo provedor; sua fila transporta somente tickets descartáveis, sem credencial permanente ou dados de fotos/clientes. A configuração operacional é feita pelo conector do projeto.

**Estado da entrega:** URL do Vault em HOLD. A rota ainda não foi publicada no app e o processamento contínuo não está ativo. A publicação do bundle TanStack inclui o frontend e exige uma decisão de entrega separada da PR. Presença de bindings no terminal de manutenção e um piloto desse handler não comprovam bindings ou execução no Worker publicado, cron/callback remoto ou latência da galeria.

Os 15 testes do core foram preservados em `tests/nr-image-worker.test.ts`, com três testes adicionais do wrapper. A dependência `image-size` está fixada em 2.0.4 no app; fixtures sintéticas ficam exclusivamente em `tests/fixtures`.

Referências oficiais: [runtime e publicação TanStack no Lovable](https://lovable.dev/blog/building-apps-using-tanstack-start), [Jobs](https://docs.lovable.dev/features/jobs) e [limites do Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/).
