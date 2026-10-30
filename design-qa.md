# Agenda Equipe — revisão visual de 30/10/2026

**final result: passed**

Alvo: a Agenda existente, o briefing e as imagens fornecidas; a Dashboard Fenasoja orienta hierarquia, gráficos e rankings. A revisão final incorpora as duas correções de direção do usuário: preservar o verde com qualidade e usar fundo grafite neutro ou branco suave esverdeado. Não se trata de uma cópia de pixels da Fenasoja.

## Fontes e comparação

- Fonte móvel: `/Users/leonardo/Downloads/Imagem do ChatGPT 30 de out. de 2026, 00_55_19.png` (1179 × 2556, inclui navegador).
- Fonte Dashboard: `/Users/leonardo/Downloads/Imagem do ChatGPT 30 de out. de 2026, 00_55_26.png` (2474 × 1362).
- Implementação: `docs/nexus-operacional/evidencias/agenda-experiencia-2026-10-30/` — lista, editor, filtros, detalhe e Dashboard.
- Comparação conjunta móvel: `/Users/leonardo/.codex/visualizations/2026/10/30/01a18af5-56a1-7c32-a267-7a5862839204/agenda-qa/comparacao-mobile.png`.
- Comparação conjunta Dashboard: `/Users/leonardo/.codex/visualizations/2026/10/30/01a18af5-56a1-7c32-a267-7a5862839204/agenda-qa/comparacao-dashboard.png`.

As comparações foram abertas e inspecionadas no mesmo input visual. O navegador da fonte móvel foi recortado e a região foi normalizada para 390 px; a fonte não define a escala CSS. Capturas implementadas usam deviceScaleFactor 1, viewports CSS 390 × 844 e 1366 × 900. Capturas de página inteira são mais altas que o viewport; filtros/detalhe usam apenas o viewport. Os estados e dados das fontes são diferentes dos dados sintéticos isolados usados nos testes. Não se infere correspondência de conteúdo ou estatística entre eles.

## Superfícies verificadas

- **Tipografia:** Saira e Barlow existentes, números tabulares, títulos compactos e descrições legíveis. Títulos extensos quebram linha sem cortar controles. Campos móveis usam 16 px.
- **Ritmo e composição:** primeira dobra dedicada aos eventos, comandos em duas linhas no celular, três zonas nos cards desktop. Editor e detalhe têm uma região de rolagem e ações acessíveis. Nenhuma coluna lateral vazia foi adicionada.
- **Cores:** fundo grafite neutro; esmeralda nas ações e gráficos; verdes claros legíveis nos apoios. Versão clara usa branco esverdeado e verde profundo. A navegação global conserva sua identidade. Status possui texto além da cor.
- **Imagens/ícones:** Lucide existente, iniciais derivadas dos nomes reais. Não foram criadas fotografias, logos ou avatares fictícios. Não há imagem decorativa que exija comparação de recorte.
- **Conteúdo:** uma entrada de criação, sem título interno repetido, sem IANA/visibilidade/preferências no editor cotidiano, sem paginação de lista vazia. Categoria e natureza permanecem distintas.

O recorte focado do editor móvel e do painel de filtros foi inspecionado separadamente, além da composição inteira: data/hora, responsabilidade, seleção relacional, foco e footer. A Dashboard foi verificada também em versão clara.

## Iterações e correções

1. **P2 — overflow de 4 px:** margens da Agenda não correspondiam ao padding operacional. Corrigidas conforme `nx-main`; verificações nas seis larguras passaram.
2. **P2 — mês cortado:** input mensal estreito cortava o ano. Substituído visualmente por mês/ano compactos, mantendo o input nativo acessível; captura final mostra o ano completo.
3. **P1 — direção de cor:** primeiro acento índigo foi rejeitado pelo usuário. Substituído por esmeralda, fundo grafite e textos em verdes graduados; comparações finais e capturas registram a direção corrigida.
4. **P2 — foco/retorno:** filtros não retornavam ao acionador e detalhe substituía a lista. Foco restaurado; detalhe agora modal preserva lista e posição. Teste confirma Escape, foco e scroll exatos.
5. **P2 — redução de movimento:** incluído o próprio painel no seletor de `prefers-reduced-motion`, além dos descendentes. Menus e ícones mantêm alvos mínimos de 44 px.

6. **P2 — contraste de campos claros:** bordas de input passaram de 2,14:1 para 3,81:1 contra o fundo claro; texto de botão claro tem 5:1 e ação esmeralda escura 8,02:1. Medição sRGB dos tokens, sem alegar auditoria integral de WCAG.
7. **Preferência solicitada — dois modos:** controle acessível, cores correspondentes nos campos/gráficos/portais e persistência após recarga foram adicionados e validados.

Após as correções, não foram encontrados problemas visuais P0/P1/P2 nas capturas finais. Não há pendência estética relevante identificada.

## Evidência funcional e limites

Relatórios `agenda-ui-results.json` e `dashboard-ui-results.json`: 34 + 36 verificações de layout; 19 + 12 grupos de comportamento; nenhum erro de página ou console. Larguras: 360, 390, 430, 768, 1366 e 1920. Incluem temas, filtros cancelar/aplicar, foco, retorno de recorte, erro recuperável, concorrência de versão, idempotência, legado temporal e fuso do dispositivo Asia/Tokyo. Capturas usam dados sintéticos somente no laboratório de testes.

SQL e DTOs têm testes separados em PostgreSQL descartável. A revisão visual não comprova teclado físico/virtual de iPhone, VoiceOver ou Auth/Storage HTTP conectado. Um smoke SQL separado no servidor real confirmou leitura autorizada dos contratos, sem substituir esses testes. Esses cenários não foram executados em dispositivo físico. Há alternância explícita Modo claro/Modo noite apenas na Agenda. A preferência é persistida por organização/usuário; os portais recebem o mesmo tema por contexto. Os testes confirmam que o html/body e a navegação global não mudam. Anexos e séries acrescentam 12 medições de layout e 10 verificações funcionais, totalizando 82/41 no runner completo.
