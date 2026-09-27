# Redesign elegante da tela de login (/auth)

Direção escolhida: **Split-screen glassmorphism** (protótipo v3) — cartão de vidro em duas colunas: lado da marca com a arte anexada, lado do formulário com tipografia refinada, ícones e botões bem desenhados.

## 1. Ativos

- **Imagem de fundo**: usar a arte anexada pelo usuário (`user-uploads://Imagem_do_ChatGPT_27_de_set._de_2026_17_12_21.png`) — publicá-la com o CLI `lovable-assets` (ponteiro `.asset.json` em `src/assets/auth-art.png.asset.json`) e importar a URL no lado da marca do cartão. A arte já traz o logo NEXUS e a headline "Segurança de verdade não aparece só na norma."; no lado da marca ela entra **sem** sobreposição de texto duplicado — apenas um leve véu escuro/gradiente para integrar ao tema.
- **Logo refinada**: gerar um wordmark NEXUS limpo (Saira extrabold itálico, "X" em verde-neon, fundo transparente) com o gerador de imagens para usar no lado do formulário e no mobile, quando a arte fica oculta.

## 2. Reescrita visual de `src/routes/auth.tsx` (somente apresentação)

Seguir o protótipo v3:

- Página: fundo verde-escuro da marca (`--background`), brilho verde-neon suave atrás do cartão.
- Cartão: `max-w-5xl`, cantos arredondados grandes, borda sutil, `backdrop-blur`, dividido em duas metades no desktop (md+); no mobile vira coluna única com apenas o formulário.
- Lado da marca (desktop): arte de fundo com `object-cover`, borda divisória à direita.
- Lado do formulário:
  - Logo NEXUS refinada no topo (mobile) e título "Acesso ao sistema" com subtítulo.
  - Rótulos em caixa alta, letter-spacing largo, cor esmaecida.
  - Campos com ícone à esquerda (e-mail, cadeado), foco com anel verde-neon; alternador de visibilidade da senha (olho).
  - Botão primário "Entrar" com ícone de seta, hover elevando levemente, brilho neon sutil.
  - Divisor "ou" e botão "Continuar com Google" com o G multicolor oficial em SVG inline.
  - Alternância Entrar / Criar conta preservada no rodapé.
- Tipografia: Saira para títulos/logo, Barlow para texto (tokens já existentes: `font-display` / `font-sans`), `tabular-nums` onde couber.
- Cores: usar os tokens do tema (`--primary`, `--background`, `--card`, `--foreground` etc.) — nenhum hex fixo novo no código de componentes; transparências (white/10, blur) ficam como utilitários neutros.

## 3. Lógica preservada (sem mudanças de comportamento)

- React Hook Form + Zod, `signInWithPassword`, `signUp` com confirmação por e-mail, Google via `lovable.auth.signInWithOAuth("google")` com `redirect_uri = window.location.origin`, redirecionamento automático se já houver sessão, estados de erro/aviso em pt-BR.
- `head()` da rota mantido (título/descrição/OG sem imagem — o arte é import empacotado, URL relativa).

## 4. Verificação

- `npx tsc --noEmit -p .` sem erros; checar `/tmp/observability/build-errors.log`.
- Playwright: capturar `/auth` em desktop (1440×900) e mobile (390×844) e conferir cartão, ícones, botões e legibilidade sobre a arte.
- Confirmar que entrar/criar conta/Google continuam acionando os mesmos fluxos (a lógica não muda).
