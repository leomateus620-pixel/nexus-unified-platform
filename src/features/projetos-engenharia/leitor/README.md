# Leitor de originais PE

Fatia de visualização: não altera PDF, arquivo confirmado, modelo nativo ou cena3D. Nenhuma observação é persistida. O componente recebe metadados permanentes e dois adaptadores obrigatórios:

```tsx
<LeitorOriginalPe
  organizationId={org}
  versaoId={versaoId}
  arquivo={{ id, nome, sha256, tamanho, mime }}
  fetchAuthorized={async (signal) => ({ url: /* autorização atual de download */ })}
  checkAccess={async (signal) => { /* arquivo exato vinculado + hash/versão/org + pai atual */ }}
  onClose={fechar}
  sessionSignal={sinalCanceladoNoLogoutOuTrocaDeContexto}
/>
```

O adaptador verifica IDs e origemStorage; nenhuma URL é editável no leitor. Negação atual deve lançar `LeituraPeAccessError` exportada de `domain.ts`; falha transitória também encerra a prévia e permite repetir. `checkAccess` precisa consultar o original porID, não inferir acesso pela presença numa lista de100 arquivos. `sessionSignal` fornece fechamento imediato por mudança de sessão; há revalidação30s/foco/retorno à aba e após conferir bytes. URL assinada não entra no QueryCache ou armazenamento local. Revogação não recolhe bytes já recebidos nem invalida imediatamente um bearer emitido.

PDF.js6.4.299 exata; API/worker legacy são lazy e locais. O módulo cliente só é importado após solicitar/confirar o original. Sua importação não deve ocorrer nas listagens ou durante SSR. Antes do build/laboratório, o responsável pela integração executa:

```sh
node src/features/projetos-engenharia/leitor/prepare-assets.mjs --output public/pdfjs/6.4.299
```

O helper valida a versão, copia CMaps/fontes/Wasm/ICC/licenças e não remove pastas existentes. Arquivo versionado diferente é recusado. Recursos são requisitados sob demanda, não todos na abertura; scripting/quickjs não são copiados. Worker minificado é emitido pelo Vite viaURL local, com a mesma versão. `assetBaseUrl` permite um prefixo local diferente, sempre na mesma origem e terminado na versão.

Canvas: máximo4milhões de pixels mobile/8milhões desktop, DPR até2, uma renderização ativa. Isso limita alocação do canvas, não garante um teto de heap para PDFs complexos. Imagens raster têm pré-validação das dimensões e limites de8/24milhões de pixels naturais antes de decode; páginas grandes demais apresentam erro recuperável. SenhaPDF é distinguida e não solicitada/enviada nesta fatia. XFA, PDFJavaScript, links externos automáticos, HTML e edição não são ativados. O texto extraível é plain text por página, limitado e sem OCR.

Fechamento/negação cancela requests e render, oculta/zera canvas, solta texto/bytes e encerra documento/worker. Aquisição que termina depois do fechamento descarta o recurso. API de biblioteca não garante apagamento criptográfico de RAM; testes físicos e memória real continuam necessários. CSP/worker/recursos devem ser testados no buildCloudflare; não alterar uma CSP global sem conferir demais recursos.

Testes puros isolados:

```sh
node node_modules/vitest/vitest.mjs run --config src/features/projetos-engenharia/leitor/vitest.config.ts
```

Cobrem orçamento, formato/tamanho/hash, download interrompido, mensagem pública sem token e descarte tardio. Não comprovam Auth/Storage conectado, render real, navegador físico, bundle ou desempenho. A integração deve exercitar PDF sintético com renderização real e matriz móvel/desktop; originais reais só quando autorizados e sem envio externo.
