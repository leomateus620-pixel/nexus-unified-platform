# PET — revisão Product Design

**final result: passed**

## Fontes e normalização

A referência visual é a identidade aprovada da Agenda, adaptada à jornada da PET, sem pretender copiar os mesmos campos ou a densidade de um editor de evento.

- Fonte: `docs/nexus-operacional/evidencias/agenda-experiencia-2026-10-30/editor-390.png` e `editor-claro-390.png` (390px de largura, fonte de direção visual).
- Baseline PET: capturado antes de editar, no laboratório SQL em `http://127.0.0.1:4193/execucao/pets/...`; originais em `/tmp/nexus-pet-before/` e recorte incorporado à comparação.
- Implementação: `docs/nexus-operacional/evidencias/pet-experiencia-2026-10-30/`, estados emitida/encerrada em `docs/nexus-operacional/pet/evidencias/experiencia-2026-10-30/estados/`.
- Comparação conjunta: `docs/nexus-operacional/evidencias/pet-experiencia-2026-10-30/comparacao-preparacao.jpg` (1200×1950). Agenda dia/noite, PET anterior e implementação estão no mesmo input visual e foram inspecionadas juntas.
- Recorte focado: `campos-foco-390.png` (390×800), além dos portais atmosféricos e do cancelamento e dos quatro contact sheets dos estados.

Capturas PET usam CSS 360/390/430/768/1366/1920px, altura950 na preparação e altura900 na matriz de estados, deviceScaleFactor1. As imagens de página inteira têm a altura do conteúdo. A comparação móvel recorta os primeiros950px e mantém largura390, sem navegador ou moldura. A Agenda é outro fluxo e outra composição; não se infere igualdade de conteúdo. A faixa de laboratório é identificada como teste e não faz parte da interface de produção.

## Findings e iterações

1. **P2 — excesso de superfície auxiliar e lateral inconsistente.** O baseline mostrava fatos herdados como inputs, textos repetidos e contexto com inversão de abertura por breakpoint. Substituídos por fatos legíveis e acesso secundário explícito; fases e etapas agora têm funções distintas. Comparação final: `comparacao-preparacao.jpg` e capturas contexto390/1366 nos dois modos.
2. **P2 — campos e seleções pouco legíveis.** Campos agora usam16px, bordas verdes distinguíveis, rótulos associados, busca única e estados de foco. Portais recebem os mesmos tokens. Evidências: `campos-foco-390.png`, capturas de equipe e `atmosphere-*-390.png` nos estados.
3. **P2 — segurança extensa sem orientação de progresso.** EPC/EPI agora mostram respostas reais/total; EPI começa recolhido, pendência abre seus ancestrais antes de focar o campo. Não se omitem verificações ou instruções de segurança. Evidência: captura segurança390 e teste de destino de pendências.
4. **P2 — controles secundários ocupavam outra linha no cabeçalho móvel.** Contexto/opções passou a um ícone com nome acessível; cancelamento fica dentro desse acesso, preservando sua disponibilidade e confirmação. Capturas finais substituem a versão anterior. O teste de cancelamento foi reexecutado após a mudança.
5. **P1 — encerramento perdia texto ao trocar de fase ou finalizar em outra sessão.** Etapa permanece montada enquanto necessário; transição terminal prioriza a situação confirmada e oferece comparação local somente leitura. Evidência: `concurrent-closing-comparison-light-390.png` e teste sem escrita durante a comparação.
6. **P2 — ações de conferência e retorno de lista.** Guardas por estado removem ações inválidas em consulta final. OS, busca, página e scroll são restaurados no retorno; outra OS tem escopo próprio. Testes de navegador confirmaram203→203px e retorno em lista longa.

7. **P2 — tempos individuais exigiam rolagem lateral no celular.** Na revisão da PET encerrada, a tabela escondia saída/permanência fora da primeira coluna visível. As linhas agora se recompõem em duas colunas com rótulos, mantendo a tabela no desktop. A matriz e a captura `closed-light-390.png` foram refeitas.

Após os ajustes, a matriz e as comparações foram repetidas. Não restam achados visuais P0/P1/P2 identificados.

## Superfícies de fidelidade

- **Tipografia:** Saira em títulos e Barlow em texto/controles, locais e verificadas com document.fonts. Pesos e tamanhos diferenciam etapa, assunto e apoio; nomes extensos quebram sem cortar ações. PDF incorpora as mesmas famílias.
- **Ritmo:** conteúdo amplo no desktop, duas colunas quando cabem, empilhamento móvel. A operação começa pela presença; encerramento e consulta têm composição própria. Footer permanece acessível e não cria uma área principal com scroll aninhado.
- **Cores:** grafite e branco esverdeado, esmeralda para ações e hierarquia; estados de atenção/cancelamento têm rótulo e cor. Inputs têm bordas mais fortes que os cards. A navegação e a Agenda mantêm tokens próprios; teste confirma html/rail inalterados ao alternar tema.
- **Imagens:** logo e ícones Lucide existentes preservados. Iniciais vêm dos nomes de teste/reais disponíveis, sem retratos inventados. Fotos no PDF são pipeline de demonstração explicitamente identificado; não são evidências de campo em produção.
- **Conteúdo:** contexto herdado compacto; medições e confirmações explícitas; ausência de provedor visível junto da ação impedida. UUIDs/hashes ficam em integridade/documentos. Cancelada tem linguagem própria, sem aparência de conclusão bem-sucedida.

## Evidência e limites

60 layouts de preparação/conferência, 100 de estados/portais, ambos os modos e seis larguras; nenhum overflow, campo visível abaixo de16px ou erro de página. A preparação também mede alvos de toque >=44px e persistência do tema. Foco/teclado do picker, Escape/retorno do diálogo e movimento reduzido foram exercitados. A auditoria de console abriu18 páginas de estados/temas, sem erros de console ou de página (`console-audit.json`). Os testes SQL e navegador de persistência são separados da matriz de apresentação.

PDF: 11 páginas V2 renderizadas, inspecionadas e testadas quanto a margens; capa, fotografia e quebras de tabela preservadas no diretório pdf. V1 tem golden e replays próprios.

Não foram exercitados VoiceOver, iPhone físico, teclado virtual real, certificação externa ou Storage privado HTTP. O laboratório tem roteador controlado; seu bloqueio de navegação é stub. Não se afirma conclusão de emissão certificada real. Esses limites estão no relatório técnico e não constituem comparação visual pendente.

## Implementation checklist

- [x] Dois temas isolados, fontes, contraste e campos.
- [x] Preparação/conferência, operação, encerramento e consulta.
- [x] Preservação de preenchimento, pendências, retry e retorno.
- [x] Capturas revisadas em conjunto e recortes legíveis.
- [x] Estados vazios, bloqueados, somente leitura e cancelados.
- [x] PDF derivado V2 e compatibilidade histórica.

**Follow-up polish:** sem refinamento P3 obrigatório identificado. Validação em dispositivo físico continua fora da evidência executada.
