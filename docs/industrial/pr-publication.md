# Publicação da revisão CAD em PR — 25/09/2026

O usuário autorizou publicar as alterações desta revisão em uma pull request no GitHub. A autorização de publicação sucede a entrega local descrita em `cad-implementation.md` e `cad-execution.json`; essas evidências preservam o estado e as decisões da execução original. Não houve nova geração dos modelos nem alteração da geometria para abrir a PR.

A branch `codex/3tentos-cad-incremental` foi atualizada por fast-forward para `origin/main` em `87b3817`, que acrescentava apenas a integração da PR anterior e `docs/prompts/mapa-3d-3-tentos.md`. Não houve reescrita de histórico.

## Verificações desta publicação

- Os 68 arquivos de código e ativos inicialmente conferiram com os hashes da implementação. Após a correção de portabilidade da auditoria descrita abaixo, o manifesto foi atualizado apenas para os dois scripts corrigidos; código da aplicação e ativos permanecem iguais.
- TypeScript, 16 testes industriais e ESLint direcionado: aprovados novamente.
- Build de produção: aprovado novamente; avisos de tamanho de chunks e configuração Vite registrados na saída, sem erro de compilação.
- Auditoria CAD/GLB: 36 partições, quatro comparações de LOD, 24 medidas de corpo/cobertura e seis distâncias entre eixos; maior erro de envolvente 0,466407 mm, dentro da tolerância de exportação de 5 mm.
- Auditoria geométrica: aprovada novamente.
- A auditoria desta publicação usa as referências compactas versionadas; não repete a extração do CAD privado. A extração e a comparação direta com o cache estão documentadas na execução original.
- Interface (7 testes), imagens, validação estrutural dos GLBs e desempenho são evidências de 15–16/09/2026, preservadas com suas datas. Não foram apresentados como testes novos desta publicação.

## Escopo publicado

Código, cadastro, metadados de proveniência, fonte Blender, GLBs derivados e documentação da revisão incremental. O arquivo original `3dmodel.model`, o cache de malhas e os intermediários de `assets/industrial/raw/` ficam fora da PR.

Os limites já registrados continuam válidos: convenção local sem georreferenciamento de campo, numeração técnica sem certificação operacional, orçamento histórico de triângulos excedido e ausência de teste em telefone físico/Safari. A publicação da PR não executa merge nem deploy.

## Correção encontrada no CI Linux

A primeira execução do workflow identificou diferença no hash de `cad-generation.json` devido à conversão CRLF/LF no checkout. O produtor Python e o consumidor JavaScript agora calculam esse hash em UTF-8 com quebras LF; hashes de arquivos binários continuam byte a byte. Nenhuma tolerância geométrica foi alterada.

A inspeção somente leitura do Blender foi repetida e aprovou as 36 partições. A auditoria completa passou com o relatório em LF e em CRLF; uma alteração deliberada do conteúdo foi rejeitada, confirmando que a proteção de integridade permanece ativa. O arquivo original foi restaurado e a auditoria final passou novamente. Os modelos não foram regenerados.
