# Ambiente de reflexão próprio, pré-filtrado para a web

O ambiente conserva a resolução e a cena usadas anteriormente pelo gerador PMREM em tempo real: fundo `#cad8dc`, plano de 100 × 100 m em Y = −1 m com cor `#6c7668`, câmera na origem, sigma 0,15 rad, near 0,1 m, far 100 m e resolução de face 256. Não há fotografia, HDR externo, modelo de fabricante ou recurso de terceiros nesse ambiente. O mapa é um recurso gerado para o projeto Nexus; não foi atribuída uma licença independente inexistente.

`bake-environment-map.mjs` usa o Three.js 0.186.0 instalado e um navegador WebGL para gerar o mesmo PMREM uma vez. O script lê o alvo RGBA16F, quantiza seus valores lineares em RGBA8 e grava um PNG de 768 × 1024 px. As cores foram medidas dentro de [0; 0,71533203125], sem amostras recortadas. O erro máximo de quantização é **0,0019607843137254832**, limitado por **1/510**, com RMSE **0,0008461143850420382**. O arquivo possui **75.806 bytes**; seu hash e as condições da geração constam no manifesto.

A textura é um atlas de CubeUV já pré-filtrado, não uma imagem panorâmica que deva passar novamente pelo PMREM. Não contém metadados sRGB, gamma ou ICC. A linha 0 do readback torna-se a linha 0 do PNG e a linha 0 da textura GPU. O carregador mantém `CubeUVReflectionMapping`, `LinearSRGBColorSpace`, `flipY=false`, filtros lineares e `generateMipmaps=false`. Aplicar sRGB, inverter Y ou gerar mipmaps comuns mudaria a iluminação e invalidaria o bake.

A validação fez o percurso completo de PNG local → `createImageBitmap` com conversão de cor desativada → textura GPU. Três sondas com os materiais do zinco, aço do trole e pintura foram renderizadas com a textura PMREM original e o PNG recarregado. A diferença máxima foi **1 nível em RGB8**, com média absoluta **0,00714111328125 nível** e nenhum erro WebGL. São sondas de reflexão, separadas da inspeção visual da cena completa e dos testes de desempenho.

`EnvironmentMap.ts` expõe `loadEnvironmentMap(signal)`, que retorna `{ texture, dispose }`. O fetch aceita cancelamento; uma decodificação tardia fecha seu bitmap antes de rejeitar. Falhas HTTP, dimensões incorretas e imagens inválidas geram erro recuperável. A liberação de recursos GPU pode chamar `texture.dispose()` sem fechar o bitmap CPU, permitindo novo upload com `needsUpdate=true` após restaurar o contexto. O proprietário final chama `dispose()` do recurso, liberando textura e bitmap uma única vez. Dois testes cobrem essas condições.

O runtime carrega o pequeno PNG local e não gera o PMREM novamente. Isso remove da inicialização a compilação e os passes de filtro do ambiente, preservando sua resolução. Os tempos de primeira exploração e prontidão pertencem às medições de produção da entrega geral; a comparação das sondas não comprova desempenho de dispositivo físico ou cache frio de sistema operacional/GPU.

Reprodução, em janela GPU exclusiva:

```text
node scripts/silo-engolfamento/bake-environment-map.mjs
npx tsx --test tests/silo-engolfamento/environment-map.test.ts
```

Saídas:

- [PNG local](../../public/models/silo-engolfamento/environment-pmrem-256.png).
- [Manifesto do recurso](../../public/models/silo-engolfamento/environment-pmrem-256.manifest.json).
- [Medição da geração e comparação](evidence/upgrade/environment-map/bake.json).
- [Sondas com PMREM original](evidence/upgrade/environment-map/source-probes.png) e [com PNG recarregado](evidence/upgrade/environment-map/baked-probes.png).

O manifesto geral também registra os hashes dos geradores, do carregador e da cena consumidora. Os GLBs externos da referência continuam fora do runtime, com autorização de redistribuição não verificada; o bake local não altera essa restrição.
