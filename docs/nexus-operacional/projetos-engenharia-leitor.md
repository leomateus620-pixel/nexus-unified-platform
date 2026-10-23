# Projetos de Engenharia — leitor privado de originais

## Alcance do checkpoint46

A ação **Ler original**, na versão do acervo PE, abre um leitor independente para
PDF, PNG, JPEG e WebP confirmados. O original e seu hash são preservados. PDF tem
navegação por página, ajuste à largura/página, zoom, rotação e texto extraível da
página como texto simples. Imagens são visualizadas sem convertê-las em modelo
nativo. O texto selecionável não representa o conteúdo dentro das imagens.

Esta fatia não cria tabelas, migrações ou dados operacionais. O ledger continua44,
até0025. Não há OCR, interpretação por IA, extração estruturada de tabelas/imagens,
sugestões com aceite, observações por página persistidas, reconstrução geométrica,
editor3D próprio, emissão de PDF ou dossiê. O modelo documental editável existente
continua distinto do arquivo importado. Cenas3D, motores e catálogo permanecem no
contrato de preservação.

## Autorização, integridade e ciclo de vida

`obterArquivoPe` é um GET autenticado de metadados do ID exato. Filtra organização
e ID sob RLS, aceita somente arquivo vinculado e revalida `pe_ler_projeto` após a
consulta. Resposta é `private, no-store`, sem URL ou bytes. Registro ausente,
42501/PGRST116 ou pai negado têm a mensagem pública estável
“Arquivo indisponível para seu acesso atual.”; rede permanece falha recuperável
distinta. A lista limitada a100 arquivos não serve para autorizar um ID antigo.

`reader-adapter.ts` compara organização, projeto, versão, ID, caminho, MIME,
tamanho e SHA-256 com o original escolhido. Download usa o comando autorizado
existente e só aceita a origem Storage configurada, bucket/caminho exatos e token
assinado, sem URL arbitrária ou credenciais embutidas. Confere acesso antes e
depois de obter a URL; revalidação periódica não emite outra URL a cada30s.

Bytes são recebidos com limite pelo tamanho registrado e SHA-256 conferido antes
de interpretar/renderizar. Uma URL expirada pode ser renovada uma vez, com nova
verificação de metadados. URLs não entram no QueryCache ou armazenamento local.
Nome e conteúdo só aparecem depois da autorização inicial. Negação atual e falha
de revalidação encerram a prévia, removem texto e canvas e oferecem recuperação
adequada; foco, retorno à aba e intervalo30s consultam autorização novamente.

Fechar, mudar versão ou perder o contexto de sessão aborta requests e render,
descarta respostas tardias e encerra documento/worker. A identidade inclui
organização, versão e original; a próxima abertura reinicia página/zoom/texto.
Isso não recolhe bytes já recebidos nem invalida imediatamente uma URL bearer
emitida, e não equivale a apagamento criptográfico de RAM.

## Carregamento e limites

PDF.js6.4.299 é fixado; API e worker são locais e carregados sob demanda. A
fronteira `createClientOnlyFn` impede o módulo renderizador de entrar no caminho
SSR. CMaps, fontes, Wasm, ICC e licenças têm manifesto/checksum por versão;
scripting/quickjs não são publicados. Não se altera CSP global para esconder
falha de worker. Execução na borda Cloudflare implantada ainda requer evidência.

O limite desta fatia é20MiB por original, igual ao upload PE vigente;50MiB/TUS,
streaming de upload e OCR são evoluções distintas. Há uma renderização ativa,
DPR máximo2 e orçamento de canvas4milhões de pixels mobile/8milhões desktop.
Raster tem limite de dimensões antes do decode. Esses controles não garantem
um teto universal de heap de PDFs complexos. SenhaPDF, documento incompatível,
limite de recursos, rede, integridade e worker têm mensagens recuperáveis
distintas; senha não é solicitada/enviada. XFA, PDFJavaScript e abertura automática
de links externos não são ativados.

## Revisão e correções durante o QA

A primeira rodada `ui-46-leitor/` passou seis larguras/oito comportamentos, mas
suas medidas mostravam canvas300px em todas as larguras. A inspeção visual
identificou que a área disponível não era observada depois de montar o leitor.
O callback de referência do contêiner passou a registrar o nó montado e acionar
a medição. O teste agora compara largura renderizada e largura disponível,
além de pixels não brancos e identificadores de texto de ambas as páginas.

`ui-46-leitor-refinado/` é tentativa interrompida por HMR do laboratório; não é
evidência final aprovada. A rodada `ui-46-leitor-final/` terminou EXIT0, com seis
larguras/oito comportamentos e sem HMR no laboratório4193. O canvas acompanha a
largura disponível:328/358/702/958/1300/1374 CSS px nos respectivos viewports.
O resultado inicial não substitui essa prova posterior à correção.

Também foram corrigidos dois caminhos compartilhados de resposta tardia:

- Anexos canônicos abortam e ignoram uma URL recebida depois de desmontar o pai,
  trocar contexto ou falhar sua revalidação atual. Resposta autorizada no mesmo
  contexto continua abrindo uma vez; abort ignorado pelo transporte não dispensa
  o guard de continuidade. Confirmar/cancelar comprovante invalida qualificações.
- Equipes encerra o editor salvo antes de aguardar a atualização da lista. A
  resposta antiga dessa atualização não pode fechar um editor aberto depois nem
  descartar seu rascunho. A rodada focada estável passou36 layouts/17 cenários,
  incluindo lista retida, segundo formulário e escolha explícita para descartar.

## Evidências e alcance

O [resumo do checkpoint](evidencias/checkpoint-46.json) contém paths e SHA-256 dos
relatórios focados, bundle e duas capturas finais. Seu estado geral permanece
pendente enquanto a suíte completa e a revisão de identidade separada pela raiz
não tiverem resultado; PASS focado não significa conclusão integral de segurança.

| Método | Resultado/limite |
| --- | --- |
| Regras/adaptador/recursos isolados |47 casos:10 domínio/ciclo de vida,34 adaptador e três recursos; aprovação observada pela raiz |
| Handlers de arquivos PE isolados |28 casos, incluindo o GET de ID exato, negação do pai, abort e metadados atuais; não são testes SQL/RLS |
| UI inicial do leitor | Seis larguras360/390/768/1024/1366/1440, oito comportamentos; canvas300 descoberto depois e corrigido; rodada histórica |
| UI final do leitor | PASS: seis larguras/oito comportamentos, ajuste à largura verificado, zero erros JS/overflow; `ui-46-leitor-final/pe-leitor/results.json` |
| UI de anexos | Seis layouts/oito comportamentos em `ui-46-anexos/`; inclui os três cenários novos de continuidade de download |
| UI de equipes tardia | PASS:36 layouts/17 comportamentos em `ui-46-equipes/estavel/equipes/results.json`; tentativas anteriores com timeout de laboratório não são a rodada final |
| Build/bundle local | Build final passou após fronteira cliente; `pe-reader-bundle-46.json` mede541231bytes gzip dos três chunks e199 recursos estáticos/3059136bytes com checksum |
| Regressão de código | Typecheck global, ESLint dos67 arquivos de código da lista staged (documentação não integra essa contagem), operacional49 + nove manifesto + três tipos passaram;134 arquivos protegidos conferidos |
| Metadados conectados | SELECT de conferência manteve ledger44, último0025/checksum igual; não é execução Auth/Storage HTTP |

O PDF de teste é sintético, duas páginas A4/A3 paisagem,9134bytes, SHA-256
`287df01036e2d32f8156ca19648e6898b1c490583fccf14bcfc85b03dfcd2a95`,
em `tests/ui/fixtures/nexus-original-isolado.pdf`. Renderização PDF.js e pixels
distintos comprovam o caminho local; não certificam fidelidade universal,
correção de engenharia, OCR ou documentos operacionais reais.

Capturas CUA finais: [original mobile enquadrado](evidencias/pe-leitor/03-original-mobile-enquadrado.jpg)
e [prancha desktop](evidencias/pe-leitor/04-prancha-desktop.jpg), em390×845 e
1440×900 CSS px, DPR1,14. As capturas01/02 foram rejeitadas como evidência final:
01 recortou a página em vez do diálogo;02 capturou o viewport com redução/baixa
resolução.03 corrige enquadramento/resolução. O canvas300px é observado nos PNGs
de `ui-46-leitor/`, corrigido antes das capturas03/04. Na primeira abertura do
laboratório4182, otimização/reload perdeu o estado; a reabertura estável funcionou.
As imagens são emulação e dados sintéticos, não demonstração de produção ou
aparelho físico.

Comandos: `npm run test:pe:leitor`, `npm run test:pe:arquivos`,
`npm run test:ui:pe-leitor`, `npm run test:pe:bundle` e `npm run build`.
Logs/resultados finais devem ser associados à execução correspondente, sem
transformar contagens de layouts em testes independentes. A primeira suíte UI
completa46 interrompeu em `capture.mjs`, navegação local de dimensionamento com
`net::ERR_NETWORK_IO_SUSPENDED`; não foi PASS completo. A reexecução em
`ui-46-consolidacao/` está em andamento, separada das fatias aprovadas. Auth/Storage HTTP
conectado, CSP no frontend implantado, aparelhos físicos, leitores de tela,
memória real, LCP/INP/CLS e latências de campo permanecem não comprovados.
