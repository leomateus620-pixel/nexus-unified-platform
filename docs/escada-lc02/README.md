# Escada LC-02 — estudo interativo de implantação

Acesso independente em `/escada-lc02`, também disponível em **Técnico → Escada LC-02** no Nexus. Geometria própria, sem imports, dados ou ativos de Trevisan ou 3Tentos.

## Fonte e critérios

Referência exclusiva da implantação e da estrutura: `Escada_Layout_preliminar_para_aprovacao_LC02 (1).pdf`, quatro páginas, estudo comercial EPC de 25.09.2026. Cópia local em `public/models/escada-lc02/referencia.pdf`, SHA-256 `e6d19a618866d15912d905e71ba0cfb33ab4c6c203e144f817aa409ceceb6973`.

- Página 1: fotomontagem contextual; cotas gerais. Não usada para contar degraus ou extrair medidas por pixels.
- Páginas 2 e 3: isométricas de implantação e lado oposto; linguagem de materiais e apoios visíveis.
- Página 4: disposição em L, saída lateral, novo patamar, dois lances iguais, patamar superior contínuo e relações P1/P2.

| Referência documental | Implementação, em metros |
| --- | --- |
| Saída | Y = 0 |
| Patamar intermediário | Y = 3 |
| Soleira / patamar superior | Y = 6 |
| Largura útil proposta | 1,20 |
| Lateral de saída → centro P1 | X = 0 → X = 3 |
| Centro P1 → centro P2 | X = 3 → X = 8 |
| Novo patamar no trecho de 3 m | X = 0 a 1,20, no mesmo nível do existente |
| Dois lances iguais | Mesma subida de 3 m e mesmo desenvolvimento visual |
| Percurso externo | Lance 1 ao lado do volume; lance 2 e patamares adiante da fachada |

Sistema local: Y vertical, primeiro lance no sentido +Z e segundo lance no sentido +X. A fachada de referência está em Z = 0. O zero é o **piso de saída**, conforme a página 4; não é uma altitude absoluta. O terreno abaixo da saída segue a leitura das isométricas e tem altura apenas ilustrativa.

Os desenvolvimentos horizontais de 4,60 m por lance, as dimensões não cotadas dos patamares e da edificação, o terreno, as seções, a repetição dos degraus, as alturas de proteção e as ligações são **hipóteses de representação**. A subdivisão dos lances existe para gerar a malha; não constitui contagem definitiva de degraus. Não há perfis normatizados, soldas, chumbadores, cargas ou dimensionamento estrutural especificados.

O modelo representa a intenção de preservar a cobertura e mostra um percurso externo sem interseção com a envoltória representada. Não comprova folgas reais nem interferências de campo. Não equivale a projeto executivo, fabricação, orçamento ou aprovação formal.

## Uso

- Órbita: arrastar com o botão esquerdo ou um dedo. Pan: botão direito ou dois dedos. Zoom: rolagem, pinça ou botões +/−.
- Cinco vistas com transições suaves: isométrica, lado oposto, frontal, lateral e superior. O botão de foco geral recompõe o enquadramento.
- **Escada em destaque**: edificação semitransparente; patamar existente, porta e referências continuam legíveis.
- Percurso, cotas documentadas, legendas de níveis / identificação / ocultas e seis grupos de visibilidade.
- Seleção das etapas aproxima a câmera e apresenta a descrição da interpretação. As legendas evitam sobreposição e dão prioridade ao elemento selecionado; identificações sem espaço permanecem acessíveis no painel.
- GLB para download no painel **Fonte & limites**, gerado pela mesma função geométrica usada na cena. Unidade: metro; seis grupos; materiais compartilhados e sem texturas externas.

### Circulação com pessoas

- Os botões **1, 5 e 10** iniciam ou substituem o cenário. Cada trabalhador entra quando existe espaço no acesso. O contador de espera representa os demais, sem criar patamares adicionais.
- **Pausar/Continuar**, **Reiniciar** e **Encerrar** controlam o ensaio. A porta abre antes da passagem, e a chegada é registrada depois que a pessoa atravessa completamente a soleira.
- **Visão geral** enquadra o acesso; **Acompanhar** segue a pessoa selecionada; **Controlar** assume a condução guiada. Clique em uma pessoa ou use o seletor. No celular, o botão **···** abre as opções adicionais.
- No controle manual, **W/↑** avança e **S/↓** recua; soltar para. Os botões de toque têm a mesma função. Curvas e degraus são acompanhados automaticamente, e a fila limita movimentos que causariam sobreposição. **Acompanhar** devolve a condução automática.
- A entrada da pessoa selecionada retorna à vista geral. Ocultar a aba ou perder WebGL pausa o ensaio; **Continuar** é necessário para retomá-lo.
- Pessoas, passos, velocidades, espaçamentos, abertura interna da porta e pequeno piso de chegada são ilustrativos. O teste mostra circulação; não calcula cargas, deformações ou capacidade. Origem dos personagens e geração: [people-assets.md](people-assets.md).

## Implementação

| Arquivo | Responsabilidade |
| --- | --- |
| `src/escada/lc02-layout.ts` | Cotas, percurso, vistas, referências e descrições |
| `src/escada/lc02-model.ts` | Geometria determinística; lotes por grupo/material; descarte de recursos |
| `src/escada/EscadaScene.tsx` | Um Canvas, controles, transições, legendas e recuperação gráfica |
| `src/escada/EscadaViewer.tsx` | Interface responsiva e leitura técnica |
| `src/escada/lc02-walkway.ts` | Estações de contato derivadas dos degraus renderizados |
| `src/escada/lc02-simulation.ts` | Fila, controle manual, porta e estados do ensaio |
| `src/escada/lc02-people.ts` | GLBs, compartilhamento de recursos, LOD e cinemática inversa |
| `src/routes/escada-lc02.tsx` | Rota carregada sob demanda |
| `public/models/escada-lc02/escada-lc02.glb` | Modelo portátil, independente do visualizador |

Renderização sob demanda, DPR limitado a 1,65, geometria agrupada, oito materiais e sem recursos externos para construir a escada. A circulação solicita quadros enquanto está ativa; pausada ou encerrada, volta à renderização sob demanda. O mapa de sombras da estrutura é reutilizado, com atualização ao alterar camadas/contexto, recuperar WebGL ou mover a porta (limitada a 10 Hz). Pessoas usam sombra leve de contato. Os dois GLBs humanos são carregados na primeira simulação e reutilizados por até dez personagens. A cena é carregada apenas ao entrar na rota; não aumenta o carregamento 3D dos outros módulos.

Os objetos Three.js são construídos sem atributos de instrumentação DOM. Isso evita que o marcador de origem do ambiente Lovable injete `data-tsd-source` em linhas ou malhas. Transições de câmera usam duração real de 900 ms, sem depender da cadência de quadros para terminar no enquadramento solicitado.

## Reprodução das verificações

Na raiz do repositório, com Node 24 e Chrome instalado:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5183
```

Em outro terminal, na raiz:

```powershell
$env:LC02_URL='http://127.0.0.1:5183'
npm run assets:escada
npm run test:escada
npm run test:escada:assets
npm run test:escada:ui
npm run typecheck
npx eslint src/escada src/routes/escada-lc02.tsx src/routes/__root.tsx src/lib/nexus-nav.ts
npm run build
```

Os testes geométricos verificam as relações documentadas, igualdade e perpendicularidade dos lances, continuidade amostrada de pisos, passagens sem travessas de guarda-corpo, percurso externo e orçamento geométrico. A amostragem não é certificação de circulação ou cálculo estrutural.

O teste de circulação registra os três cenários, contato dos pés, teclas, toque, conclusão pela porta, duas recuperações WebGL e desmontagem ao sair da rota. A comparação de recursos usa os dois níveis de detalhe novamente após recuperar o contexto. O teste usa Chrome com aceleração padrão; `LC02_SOFTWARE=1` seleciona SwiftShader e `LC02_BROWSER=chromium` seleciona o Chromium instalado pelo Playwright. A amostra nativa usa 150 quadros; a execução funcional em software usa 30, para manter todos os personagens em circulação durante a coleta. As esperas de interação observam o avanço, sem exigir uma cadência rápida. `LC02_OUTPUT` permite gravar evidências em outra pasta. As amostras registram qual renderer foi reportado. Emulação móvel não comprova comportamento em aparelhos físicos. O CI executa as verificações também em Chromium/SwiftShader e disponibiliza suas próprias capturas como artefato. Evidências locais em `evidence/people/`; resultados e limites em `validation.md`.
