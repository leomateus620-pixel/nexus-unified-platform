# Integração à main — 28.09.2026

Branch `codex/escada-lc02-atualizada`, criada da `main` `507daeb` (inclui a PR #7 e as integrações anteriores). Reapresenta o escopo da PR #4 em novos commits, sem reescrever o histórico publicado.

## Compatibilidade

- Árvore de rotas regenerada a partir das rotas atuais. `/escada-lc02` continua pública, carregada sob demanda e independente de Trevisan/3Tentos.
- Autenticação, invalidação de cache por troca de identidade e rotas comerciais sob `_authenticated` foram preservadas.
- O retorno da escada à Engenharia respeita o login. O teste anônimo verifica o redirecionamento a `/auth` e retorna pelo menu da biblioteca pública de mapas.
- A navegação recebe apenas o item Escada LC-02; a identidade visual do rail não foi alterada.
- O workflow LC-02 usa Bun e `bun.lock` com instalação congelada, conforme a main atual.
- Nenhuma mudança em regras de cálculo, funções comerciais, banco de dados, modelos humanos, animação ou geometria da escada. Os arquivos de `src/escada` e `public/models/escada-lc02` são os mesmos da entrega anterior.

## Verificações desta integração

- TypeScript: passou.
- 10 testes LC-02, 28 testes comerciais/autorização/fila de salvamento, 8 testes Trevisan e 16 testes industriais: **62 passaram**.
- Lint do escopo: passou com finais de linha normalizados para a convenção do repositório.
- Build client/SSR/Nitro: passou. Log em `evidence/reintegration-2026-09-28/build.txt`.
- Circulação e integração no navegador: passou, sem erros JavaScript, incluindo duas recuperações WebGL, saída para o login e retorno pelo menu público. Relatório da nova execução em `evidence/reintegration-2026-09-28/ui.json`.

As medições anteriores de desempenho, vídeos e origem CC0 permanecem disponíveis. A nova rodada serve para verificar integração funcional; não representa validação em aparelhos físicos ou produção. O status remoto deve ser conferido nos checks da nova PR, pois os checks antigos pertencem a outra base.
