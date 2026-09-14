# Unidade 3 Tentos · reconstrução visual referenciada

A aplicação está em **`/mapas-3d`**, integrada ao menu existente do Nexus. Utiliza a mesma cena para navegação orbital, superior ortográfica, passeio e enquadramentos das quatro fotografias. Não utiliza mapas remotos, autenticação, sensores ou dados operacionais fictícios.

**Natureza do modelo:** reconstrução autoral a partir de quatro fotografias, com dimensões estimadas. Não é levantamento cadastral, as built validado, avaliação de segurança, simulação estrutural ou gêmeo digital conectado. O usuário confirmou que ainda não dispõe de uma medida confiável. Medição permanece desativada.

## Instalação e execução

Pré-requisitos verificados: Node.js 24.15.0, npm 11.12.1, Blender 4.5.10 LTS para regenerar os ativos. O Blender não é necessário para executar os GLBs entregues.

```sh
npm ci
npm run dev
# abrir a URL informada pelo Vite, no caminho /mapas-3d
npm run typecheck
npm run test:industrial
npm run build
npm run preview -- --port 4173
```

O projeto mantém TanStack Start, o wrapper Vite do Lovable e as rotas existentes. A prévia usa Wrangler local para executar o build Cloudflare: o comando anterior `vite preview` procurava um servidor Node inexistente. Nenhuma implantação remota é executada pela prévia. React/React DOM 19.2.8, Three.js 0.186.0, Fiber 9.7.0, Drei 10.7.8, tipos Three 0.186.0 e Vite 8.1.5 estão fixados. As versões foram conferidas no registro npm, nos peer dependencies e na documentação do Fiber: a versão 9 acompanha React 19. O lockfile npm permite instalação reprodutível.

No Windows, encerre a prévia antes de executar outro build: o Worker local mantém arquivos de `.output/public` abertos. O lockfile Bun também foi atualizado; `npm ci` é a sequência utilizada nos testes e no CI.

## Preparação dos modelos

1. Edite **`src/industrial/data/site.json`**, fonte central de implantação, parâmetros, câmeras, plantas e calibração. Preserve os identificadores. Mudanças dimensionais exigem revisão de todas as vistas; uma dimensão não valida as demais.
2. Execute `npm run assets:prepare`. O script localiza Blender 4.5 no Windows ou o comando `blender` no PATH. Para outra instalação, defina `BLENDER_BIN` com o executável. Todos os arquivos são resolvidos a partir do repositório.
3. O Blender produz `assets/industrial/source/3tentos-reconstruction.blend`, intermediários em `assets/industrial/raw/` e texturas autorais em `public/textures/3tentos/`. As onze imagens ficam empacotadas no `.blend`, permitindo abrir a fonte em outro computador. Os intermediários são regeneráveis e ignorados pelo Git.
4. glTF Transform aplica weld, deduplicação e meshoptimizer, preserva metadados e grava GLBs em `public/models/3tentos/`. No terreno, a compressão é sem quantização das posições: pequenos afastamentos entre superfícies não podem colapsar numa grade que abrange o entorno rural.
5. O pipeline valida os GLBs compactados e a versão decodificada com Khronos glTF Validator, e escreve `evidence/gltf-validation.json`. O validador não descompacta meshopt por conta própria; a segunda validação verifica a geometria efetivamente decodificada.
6. Execute `node scripts/audit-industrial-geometry.mjs`, os testes e a comparação visual após regenerar.

Os arquivos `.blend` entregues foram realmente gerados e abertos pelo Blender em modo background. Contêm a cena autoral, malhas editáveis, coleções por setor, cópias vinculadas da vegetação e câmeras de referência. O gerador usa coordenadas locais X/Y/Z; converte para `(x, -z, y)` dentro do Blender e exporta glTF com Y vertical. Os dados de rastreabilidade estão em extras e no cadastro central exportável pela interface.

`scripts/create-industrial-data.mjs` é o **bootstrap documentado**, não deve ser executado sobre ajustes manuais sem revisão: reconstrói o cadastro inicial. Pode receber uma pasta de entrada para copiar as quatro fotos; num clone existente utiliza as cópias já preservadas. `scripts/fit-reference-cameras.mjs` refaz o ajuste de A/C, modificando somente as câmeras. A sequência de reconstrução inicial foi bootstrap → ajuste de câmeras → Blender → otimização → auditorias.

## Organização

| Diretório | Conteúdo |
|---|---|
| `src/industrial/app`, `ui` | Interface em português, busca, cadastro, minimapa, comparação e exportações |
| `src/industrial/data`, `types` | Inventário, calibração, câmeras, vegetação ancorada e contratos |
| `src/industrial/scene` | Carregamento cancelável por setor, seleção, blockout, LODs e descarte |
| `src/industrial/navigation` | OrbitControls, transições, passeio, teclado/toque e colisões |
| `src/industrial/lighting`, `vegetation` | PBR, ambiente PMREM local, instanciamento e vento nas folhas |
| `src/industrial/performance` | Contadores e amostras limitadas, estimativas separadas de recursos |
| `scripts/blender` | Gerador paramétrico autoral de silos, perfis, tubos, escadas, plataformas, galpões e vegetação |
| `assets/industrial/source` | Fonte `.blend` efetivamente produzida |
| `public/models/3tentos` | Dez GLBs por setor e nível de detalhe |
| `public/references/3tentos` | Quatro PNGs originais, sem alteração dos bytes |
| `public/textures/3tentos` | Texturas procedurais PNG utilizadas nos GLBs |
| `tests/industrial`, `docs/industrial/evidence` | Testes, capturas e relatórios reproduzíveis |

## Controles

- **Orbital:** botão esquerdo/um dedo gira; botão direito/dois dedos desloca; roda/pinça aproxima. As vistas A/C ajustam câmera, sem espelhar a implantação. A vista B fixa a rotação e permite deslocamento/zoom ortográfico.
- **Passeio:** WASD/setas, arrastar para olhar e botões de toque. Captura de ponteiro é opcional e explicitamente acionada. Esc sai. Colisões conservadoras impedem entrar em silos, edifícios, estrutura central e cercamentos modelados; não há simulação física industrial.
- **Elementos:** clique/toque nas malhas ou escolha na lista/minimapa. Seleção mostra ID provisório, fotos, grau de confirmação e pendências. Apenas o elemento selecionado recebe etiqueta com oclusão.
- **Camadas/Ajustes:** equipamento, edifícios, silos, vegetação, piso, cercas e informações. Modo neutro, blockout separado, qualidade, vento e exportação de cadastro/diagnóstico.
- **Fotos:** A/B/C/D e sobreposição com opacidade. As fotos só são transferidas ao abrir esse painel/uma comparação; não são texturas do terreno.
- **Acessibilidade:** controles HTML fora do canvas, foco visível, alternativas de teclado à seleção, nomes acessíveis nos botões compactos, ajuda com foco contido e preferência de movimento reduzido.

## Validação reproduzível

Com a aplicação executando, configure `MAP_URL` para o **endereço base** ao rodar Playwright e para o **endereço completo com `/mapas-3d`** nos scripts de captura/desempenho. O padrão Playwright é `http://127.0.0.1:5173`; o benchmark usa `http://127.0.0.1:4173/mapas-3d`.

```sh
npm run test:industrial
node scripts/audit-industrial-geometry.mjs
npm run test:industrial:ui
npm run test:industrial:views
npm run test:industrial:performance
node scripts/report-industrial-validation.mjs
```

Os testes de navegador usam o Chrome instalado (`channel: chrome`). Para outro ambiente, instale Chrome ou ajuste o canal explicitamente. O benchmark demora pelo menos dois minutos **por perfil**, desabilita o cache HTTP no contexto novo e registra seu navegador, renderizador e host. Emulação móvel não é teste em Android/iPhone físicos.

O gerador do relatório consolida as evidências já gravadas. Execute-o somente depois de refazer os testes, capturas, auditorias e percursos correspondentes; ele não executa TypeScript/build nem comprova por si só a atualidade dessas verificações.

Veja [inventário e hipóteses](reconstruction.md), [auditoria e desempenho](validation.md) e [licenças](licenses.md). Os dados JSON em `evidence/` são a evidência primária; capturas não certificam desempenho contínuo.
