# Tempo de abertura do acervo de Cruz Alta

## Diagnóstico de 19/11/2026

A base da unidade continha 15 imagens vinculadas, com mediana de 18,65 MiB e p95 de 21,05 MiB. As 30 representações previstas para essas imagens estavam na fila com zero tentativas. O agendador global estava ativo, mas sua URL privada de callback estava ausente. Oito imagens excediam o limite de 10 MiB do processador nativo anterior. Abrir a imagem nessas condições exigia transferir e decodificar o original.

As 92 pranchas em PDF tinham mediana de 7,71 MiB e p95 de 23,81 MiB. Nos 84 PDFs de inspeção, os valores eram 4,76 e 13,82 MiB. O leitor esperava terminar o download e a conferência do SHA-256 de todo o PDF antes de desenhar a página, mesmo quando o usuário precisava apenas da folha citada no laudo. As médias históricas das consultas de ficha, autorização da prévia e resumo de inspeção eram 36,4 ms, 25,1 ms e 108,8 ms, respectivamente.

No RDO, abrir uma ficha disparava a listagem das pastas no Drive. Ver a foto ampliada também exigia o original. O catálogo paginado antecipa a listagem e as representações privadas antecipam a redução da imagem. Cada abertura continua validando o vínculo atual ao Drive. No ensaio do acervo, a mediana até a primeira miniatura caiu de 17 chamadas ao Drive para 12, incluindo as operações concorrentes da ficha.

## Ensaio de navegador

O ensaio usa o aplicativo compilado pelo Vite, servidor Nitro local e Chrome com sessões novas, alternando janelas de 1440 × 900 e 390 × 844. A rede do navegador foi limitada a 20 Mbit/s e 80 ms de latência. O substituto local do Drive e das RPCs também acrescenta 80 ms por requisição. O acervo usa o mesmo componente presente na aba Documentos da NR-35. A medição do mapa começa no clique em um resultado da busca de estruturas, com a cena já interativa.

O PNG sintético tem 19.553.215 bytes. As versões WebP de 384 e 1280 px são geradas a partir do mesmo arquivo. A prancha sintética contém 24 páginas e 25.082.650 bytes. A foto conta como aberta depois da decodificação no navegador. O PDF conta quando há pixels de desenho na página solicitada. A abertura direta do mesmo PNG, também com decodificação e sem cache, mede o custo de transferir o original integral.

| Do comando ao conteúdo visível, p95 observado | Acervo anterior · 6 aberturas | Acervo atual · 8 aberturas | Mapa atual · 4 aberturas |
| --- | ---: | ---: | ---: |
| Primeira miniatura RDO | 2,340 s | 0,840 s | 1,017 s |
| Abrir foto RDO | 8,949 s | 0,884 s | 0,881 s |
| Primeira página de PDF | 12,267 s | 1,953 s | 1,957 s |
| Foto original em resolução integral | 8,949 s | 8,416 s | 8,445 s |
| Tempo adicional do original sobre a transferência direta, pareada por rodada | 1,019 s | 0,496 s | 0,514 s |

O p95 empírico corresponde ao máximo em cada uma dessas amostras pequenas. Para a miniatura no mapa, o cronômetro parte do evento de clique no navegador. Incluindo a espera externa da automação pelo controle, o p95 foi 1,349 s. As rodadas do acervo anterior e atual usaram o mesmo caminho pelo seletor de componente. [Medições por rodada](medicoes-acervo.json)

A prévia ampliada do RDO transferiu 294 kB de imagem, e a primeira página do PDF transferiu 1,05 MB, incluindo cabeçalhos. Em seis aberturas de uma imagem vinculada diretamente à revisão NR, o WebP de 768 × 550 px e 201 kB ficou visível em 0,84 s de mediana e 0,86 s de p95. O original integral de 19,55 MB abriu em 8,39 s no desktop e 8,37 s no celular. Os downloads autorizados de DOCX e XLSX preservaram nome e conteúdo. Os dois anexos Office do ensaio tinham menos de 1 kB e serviram para verificar o fluxo de download.

Em verificação adicional com o leitor carregado pela primeira vez, a página ficou visível em 2,42 s e levou 1,05 s na reabertura. Ao simular uma resposta HTTP incompatível com o intervalo solicitado, o leitor conferiu o PDF inteiro e exibiu a página 2 em 10,46 s. Esses três valores são de uma passagem local em modo de desenvolvimento. Os tempos de produção do clique aos pixels dependem da sessão, da rede e da cobertura das filas.

## Reprodução com dados sintéticos

Executar na raiz com dependências do projeto, Node 24 e Chromium do Playwright ou Chrome local. A compilação abaixo usa o endereço e a chave fictícios esperados pelo ensaio.

```sh
node src/features/projetos-engenharia/leitor/prepare-assets.mjs --output public/pdfjs/6.4.299
NITRO_PRESET=node-server VITE_SUPABASE_URL=http://127.0.0.1:4451 \
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_fixture \
  node node_modules/vite/bin/vite.js build
CA_MEDIA_RELEASE=1 CA_MEDIA_BENCHMARK=1 CA_MEDIA_SAMPLES=10 \
  CA_MEDIA_ENFORCE_BUDGETS=1 CA_INSPECTION_ARTIFACTS=/tmp/ca-medicao-acervo \
  node tests/cruz-alta/inspection-ui.mjs
CA_MEDIA_RELEASE=1 CA_MEDIA_BENCHMARK=1 CA_MEDIA_SAMPLES=10 CA_MEDIA_SURFACE=map \
  CA_MEDIA_ENFORCE_BUDGETS=1 CA_INSPECTION_ARTIFACTS=/tmp/ca-medicao-mapa \
  node tests/cruz-alta/inspection-ui.mjs
```

O arquivo `trace.json` de cada execução contém as durações, tamanhos e resultados de cada abertura. O modo de verificação compara o p95 observado às metas de 1,5 s para miniatura, 2,5 s para prévia e página de PDF, e 1 s adicional sobre o download direto do original. A ativação das filas e a verificação no ambiente publicado estão descritas no [procedimento de operação](../laudos-e-inspecoes.md).
