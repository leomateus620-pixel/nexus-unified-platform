# Prompt final — Mapa 3D industrial da 3 Tentos no Sistema Nexus

## 1. Missão e ambiente de execução

Atue como uma equipe sênior de desenvolvimento full stack, computação gráfica, modelagem industrial, arte técnica, otimização WebGL e design de interação. Implemente um mapa tridimensional imersivo, realista, dinâmico e intuitivo da unidade da **3 Tentos Agroindustrial S/A**, utilizando as quatro fotografias fornecidas como referências principais.

Desenvolva o módulo dentro do Sistema Nexus existente. Não crie uma aplicação independente, não substitua a plataforma e não se limite a apresentar um plano, uma imagem estática ou uma cena industrial genérica.

```text
Diretório local obrigatório:
C:\Users\Leonardo\Documents\Nexus-Dev

Repositório remoto esperado:
https://github.com/leomateus620-pixel/nexus-unified-platform.git

Documento de referência deste trabalho:
docs/prompts/mapa-3d-3-tentos.md

Menu de integração:
Mapas 3D das Unidades

Rota principal esperada:
/mapas-3d

Branch sugerida para a implementação:
feature/mapa-3d-3-tentos
```

A prioridade será: fidelidade espacial, modelagem dos equipamentos principais, navegação estável, realismo dos materiais e iluminação, desempenho e funcionalidades complementares. O resultado inicial será uma reconstrução visual referenciada, não um levantamento cadastral, um as built validado ou um gêmeo digital conectado a sensores.

## 2. Auditoria obrigatória do repositório e proteção do trabalho existente

Antes de editar qualquer arquivo, confira o ambiente local, o diretório efetivo, o vínculo remoto, a branch, as alterações existentes e as instruções aplicáveis em `AGENTS.md`. Leia também `README.md`, `src/routes/README.md`, `package.json`, os lockfiles, `vite.config.ts`, `src/routes/__root.tsx`, `src/components/nexus/AppShell.tsx` e `src/lib/nexus-nav.ts`.

Na consulta que originou este prompt, o projeto apresentou React 19, TypeScript, TanStack Start/Router, Vite, Tailwind CSS, Three.js, React Three Fiber e Drei. Havia `bun.lock`, scripts de desenvolvimento/build/lint, integração com Lovable e uma entrada de menu apontando para `/mapas-3d`. A árvore de rotas consultada ainda não registrava essa rota. Revalide tudo no checkout atual; esses achados não substituem uma auditoria da cópia local.

Preserve a arquitetura existente. Não migre para Next.js, não instale React Router DOM, não crie `src/pages/` ou `app/layout.tsx` e não inicialize outro projeto Vite dentro da raiz. Não duplique plugins já fornecidos por `@lovable.dev/vite-tanstack-config`. Preserve `src/routes/__root.tsx`, seus providers e o `<Outlet />`; não coloque outro AppShell dentro da página do mapa.

O repositório contém instruções de preservação do histórico publicado por causa da sincronização com Lovable. Não execute force push, reset destrutivo, limpeza de arquivos do usuário ou reescrita de commits publicados. Não atualize dependências de toda a plataforma para resolver uma necessidade localizada.

Faça a inspeção inicial em PowerShell, somente quando o diretório já existir:

```powershell
$RepoPath = 'C:\Users\Leonardo\Documents\Nexus-Dev'
$ExpectedRemote = 'https://github.com/leomateus620-pixel/nexus-unified-platform.git'

if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    throw 'Diretório não encontrado. Avalie a clonagem antes de prosseguir.'
}

Set-Location -LiteralPath $RepoPath
git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) {
    throw 'O diretório não foi reconhecido como repositório Git.'
}

git status --short
git branch --show-current
git remote -v
git diff --stat
Get-ChildItem -Force
```

Compare a raiz retornada com o destino, normalizando caminhos. Confirme que o remoto corresponde ao proprietário e ao repositório esperados, inclusive quando configurado por SSH. Não troque o remoto automaticamente. Caso a pasta não exista, clone o remoto para esse destino somente após conferir a pasta pai e a inexistência de conteúdo conflitante. Se a pasta existir com arquivos sem Git, não a apague nem execute clone sobre ela.

Não execute pull, troca de branch ou stash automático sobre alterações não compreendidas. Trabalhe em branch dedicada quando isso for seguro e compatível com as instruções do projeto. Use o gerenciador de pacotes efetivamente adotado; não acrescente lockfiles concorrentes. Faça uma verificação inicial de build/lint para distinguir problemas anteriores das regressões introduzidas.

## 3. Integração correta com TanStack Start e Nexus

Crie ou evolua a rota `/mapas-3d` pelo roteamento baseado em arquivos do TanStack. Siga as convenções locais e deixe o gerador atualizar `src/routeTree.gen.ts`; não edite esse arquivo manualmente nem esconda erros de rota com casts indiscriminados.

Carregue o visualizador 3D sob demanda e somente no cliente, usando uma fronteira compatível com a versão instalada, como `ClientOnly` combinado com importação dinâmica e Suspense. Mantenha um fallback HTML com dimensões estáveis. Não acesse `window`, `document`, WebGL ou localStorage durante a avaliação de módulos executados no servidor. A fronteira de renderização não substitui o isolamento das importações que dependem do navegador.

Preserve SSR e navegação das demais telas. Não carregue a engine 3D na entrada de todas as rotas, nem desative SSR globalmente apenas para acomodar o canvas.

Reutilize componentes de interface, cores, tipografia, ícones e padrões existentes. O canvas deve ocupar a maior área útil da página sem encobrir a navegação. Implemente modo expandido reversível, painel de detalhes recolhível e layout responsivo.

Apresente o contexto da 3 Tentos sem alterar dados de outros clientes. No AppShell consultado havia um contexto demonstrativo de outra organização: resolva esse possível conflito por configuração contextual ou indicação clara no módulo, não por substituição global de textos.

Prepare o cadastro para várias unidades, mas implemente integralmente a unidade fotografada primeiro. Não invente seu município, código oficial ou identificação cadastral. Use identificadores provisórios explícitos enquanto esses dados não forem fornecidos.

## 4. Fotografias, rastreabilidade e limites da reconstrução

Utilize as quatro imagens na ordem original:

| Referência | Arquivo original fornecido | Uso principal |
|---|---|---|
| A | `DE8CBDEB-B80D-4584-A99F-C44956F484E3.png` | Aérea oblíqua: rodovia à direita, galpão em primeiro plano, profundidade do conjunto. |
| B | `24C7F9DF-9669-47D7-93CF-C97B1812BE16.png` | Vista superior: implantação dos silos, edifícios, vias, canteiros e cercas. |
| C | `6E762B60-F347-4E7B-AC1A-8ABEFB1B01EB.png` | Aérea pelo lado oposto: conferência de fachadas, coberturas e conexões. |
| D | `90E869D1-CF44-4CDA-9BF7-C09E199A23B0.png` | Vista do solo: chapas, telhados, tubos, torres, acessos e guarda-corpos amarelos. |

Esses nomes identificam os anexos, não comprovam que os arquivos estejam no checkout. Localize-os no ambiente disponibilizado. Não procure nem altere indiscriminadamente outras pastas pessoais. Se os originais não estiverem acessíveis, registre a pendência e avance apenas nas partes independentes deles, sem declarar validada a reconstrução visual.

Mantenha os originais fora da pasta pública da aplicação, por exemplo em `references/3-tentos/originals/`, com regra específica de exclusão do Git até existir autorização para divulgação. Não publique fotografias, plantas ou documentos privados automaticamente. Use cópias derivadas na aplicação apenas quando aprovadas. Não versione segredos, tokens ou arquivos `.env`.

Crie um inventário de elementos com identificador estável, categoria, fotografias de origem, transformações e parâmetros. Registre separadamente: evidência de existência, certeza sobre a função e confiabilidade dimensional. Uma forma visível não comprova a função operacional nem sua dimensão exata.

Não transforme hipóteses em dados oficiais. Não adicione equipamentos porque seriam comuns em unidades de grãos. Não produza interiores, fundações ocultas, conformidade de segurança, capacidades ou dados de operação sem evidência.

## 5. Implantação, geometria e calibração

Comece com um blockout completo e parametrizado. Adote origem local próxima ao centro dos quatro silos, Y vertical e terreno no plano XZ. Na orientação da Foto B, use +X para a direita e +Z para baixo, sem atribuir norte geográfico.

A Foto B orienta a implantação, mas não será tratada como ortofoto georreferenciada. Distinga pontos no solo de pontos elevados. Não aplique uma única correção plana de perspectiva a terreno, telhados e topo das torres.

Ajuste câmeras virtuais equivalentes às quatro imagens, incluindo campo de visão e enquadramento. Todas devem observar o mesmo modelo: não espelhe a unidade nem distorça peças para encaixar cada vista isoladamente.

Sem medidas confiáveis, trabalhe com proporções e parâmetros estimados. Solicite diâmetro de silo, espaçamento entre centros, altura do corpo e comprimento de uma edificação ou plataforma para calibração posterior. Uma medida de referência não valida automaticamente todas as direções e alturas.

Mantenha escala, posições, dimensões, caminhos e câmeras em configuração central. Qualquer dimensão usada inicialmente como aproximação deve ser identificada. Medição, área e coordenadas só poderão aparecer como oficiais após validação; enquanto isso, desative essas funções ou marque claramente as estimativas.

## 6. Terreno, pátios, vias, cercamentos e entorno

Reconstrua toda a área visível da unidade: quatro silos em disposição 2 × 2, galpão adjacente, edifícios periféricos, pátios, área de pesagem, canteiros, acessos, rodovia lateral, faixas verdes e cercamentos.

Modele as vias internas em cinza com leitura de pedra/agregado compactado, variação granular, marcas discretas de circulação e transições para solo avermelhado. Não substitua os pátios por asfalto preto uniforme. Distinga a rodovia externa, o acesso superior da Foto B e a circulação interna.

Desenhe pátios e vias a partir de contornos e curvas coerentes com as imagens. Preserve áreas de manobra, ilhas vegetadas e afastamentos. Não deixe vegetação ou componentes atravessarem faixas de circulação.

Reproduza bases aparentes de concreto, passeios, meios-fios e pequenos desníveis identificáveis. Não invente relevo dramático. Nas regiões sem evidência altimétrica, mantenha uma solução conservadora e documente a aproximação.

Modele cercas por trechos, com postes, fios ou telas e portões conforme observação. Diferencie divisões internas do perímetro aparente, sem atribuir valor jurídico à delimitação. Nas aproximações, preserve espessuras e apoios; nas distâncias maiores, simplifique a geometria.

Inclua entorno agrícola e vegetação marginal de maneira econômica, mantendo a continuidade da paisagem sem inventar construções ou ocultar erros com barreiras de árvores.

## 7. Silos e equipamentos industriais prioritários

Desenvolva um silo paramétrico e derive quatro instâncias editáveis, com identificadores provisórios SILO-01 a SILO-04. Modele corpo cilíndrico, anéis de chapas corrugadas, montantes verticais, emendas, cobertura cônica segmentada radialmente, bordas, base aparente e componentes do topo.

Separe altura do corpo, altura do cone e altura dos acessórios. Preserve diâmetro, afastamentos e relações de profundidade. Reproduza a corrugação horizontal sem convertê-la em grandes nervuras. Não use cilindros lisos com telhados genéricos como resultado final.

Use geometria nas silhuetas e nos detalhes próximos relevantes: montantes, bordas, escadas, plataformas, guarda-corpos e tubos. Reserve normal maps e mapas de rugosidade para microdetalhes repetitivos. Fixadores individuais devem aparecer somente onde a aproximação justificar seu custo.

Reconstrua o conjunto central de elevação e distribuição com colunas, carenagens, suportes, contraventamentos, tubos inclinados e ligações aos silos e ao galpão. Diferencie tubos, transportadores, escadas e estruturas de apoio; não os reduza a uma torre única arbitrária.

As conexões devem ter origem e destino coerentes. Não aceite tubos soltos, escadas sem apoio, plataformas suspensas ou elementos atravessando telhados em posições incompatíveis com as referências. Modele guarda-corpos e acessos amarelos onde forem visíveis, sem interpretar a reconstrução como certificação de segurança.

Prepare níveis de detalhe consistentes. Reduzir polígonos não pode alterar o diâmetro, a altura ou a silhueta identificadora do equipamento.

## 8. Galpões, pesagem e estruturas secundárias

Modele o galpão junto aos silos com cobertura, inclinação, espessuras, beirais, fachadas, portas e equipamentos externos identificáveis. Preserve posição e altura relativa.

Reconstrua as duas edificações no setor superior esquerdo da Foto B, a edificação lateral direita e a construção inferior direita com o elemento circular adjacente. Não determine automaticamente se são escritórios, laboratórios, residências ou instalações elétricas. Descreva o elemento circular como possível reservatório até confirmação.

Na provável área de pesagem, represente a faixa longitudinal pavimentada e sua edificação de apoio, observando alinhamento, acessos, canteiros e proporções. Mantenha função, limites exatos e dimensões como pendências quando necessário. Não invente células de carga ou mecanismos internos.

Inclua postes, luminárias e pequenos componentes sustentados pelas fotos. Não acrescente hidrantes, placas, extintores, veículos ou personagens apenas para preencher a cena.

## 9. Vegetação e paisagismo

Separe gramados, palmeiras, árvores de copa densa, árvores podadas e vegetação periférica. Preserve os alinhamentos, grupos e posições marcantes. Não atribua espécies botânicas sem confirmação.

As palmeiras devem ter tronco e folhas radiais com curvatura legível, não copas esféricas. Árvores próximas devem apresentar troncos, galhos e copas convincentes; evite cones ou esferas como representação final.

Use variantes com diferenças controladas e semente aleatória fixa. A distribuição principal deve seguir a implantação observada; variação procedural serve para reduzir repetição, não para redesenhar o paisagismo.

Modele a grama por distância: aparência geral no terreno, manchas intermediárias e tufos instanciados em aproximações. Use máscaras para excluir grama de vias, bases, edifícios e plataforma de pesagem.

Aplique vento discreto e dessincronizado somente às partes flexíveis. Disponibilize desligamento do vento e redução de movimento. Controle transparência, sobreposição de folhas e LOD sem desaparecimentos abruptos.

## 10. Materiais, luz, reflexos e definição

Adote materiais PBR distintos para aço galvanizado, pintura, concreto, telhas, agregado, solo e vegetação. Os silos devem apresentar rugosidade e variação de painéis compatíveis com metal galvanizado, sem aspecto de espelho cromado.

Configure espaços de cor, exposição e tone mapping de maneira consistente. Não duplique correções de gama. Texturas de dados físicos e texturas de cor precisam de tratamento apropriado. Não incorpore sombras fortes fotografadas ao material-base que receberá luz dinâmica.

Use iluminação solar e ambiente com sombras legíveis nos apoios e sob os equipamentos. Controle alcance, bias e resolução para evitar tremulação, acne e objetos aparentemente flutuantes. Não esconda erros geométricos com sombras excessivas.

Utilize ambiente de reflexão filtrado e avalie reflexões locais somente quando agregarem qualidade mensurável. Não atualize reflexões de toda a unidade em cada quadro sem necessidade. Evite autocaptura incorreta das sondas.

O brilho deve decorrer do material e da iluminação; não aplique emissividade artificial aos silos. Bloom deve ser discreto. Profundidade de campo e motion blur ficam desativados na navegação técnica. Trabalhe antisserrilhamento e filtragem para reduzir cintilação em chapas, cercas e folhas.

Disponibilize modo diurno de referência e modo neutro de inspeção. Simulação de horário será ilustrativa enquanto localização e orientação não estiverem confirmadas.

## 11. Navegação, interação e dados técnicos

Implemente exploração orbital, zoom, pan, vista superior ortográfica, foco por equipamento e passeio ao nível do solo. Use transições suaves, interrompíveis e que não atravessem estruturas. O passeio normal deve possuir colisões simplificadas com solo, silos e edifícios.

No desktop, ofereça comandos previsíveis, WASD/setas no passeio e Esc para sair. Capture o ponteiro somente após ação consciente. No celular, utilize gestos e controles sem depender de hover. Evite interferir nos atalhos e na rolagem fora do visualizador.

Crie presets equivalentes às Fotos A, B, C e D, visão geral e focos nos principais setores. Disponibilize botão de retorno à visão geral, minimapa, busca de elementos, seleção por clique/toque e painel lateral com fotografias autorizadas e status de confirmação.

Implemente camadas para equipamentos, edificações, vegetação, cercas e informações técnicas. Etiquetas devem respeitar distância e oclusão, sem cobrir toda a unidade. Mantenha acesso por teclado e uma lista HTML utilizável quando WebGL não estiver disponível.

Estruture vínculos opcionais por `clientId`, `unitId` e `assetId` para integração futura com clientes, levantamentos, projetos, documentos e inspeções. Não use índices voláteis das malhas como identificadores cadastrais. Preserve o vínculo em LODs, instanciamento e seleção por `instanceId`.

Não fabrique certificados, validades, sensores ou medições. Dados de teste devem ser identificados como demonstração; dados indisponíveis devem aparecer como não cadastrados. Preparar uma integração não equivale a implementá-la.

## 12. Organização e pipeline de ativos

Adapte a estrutura abaixo aos padrões locais, preservando a separação de responsabilidades:

```text
src/routes/mapas-3d.tsx
src/features/industrial-map/
  components/
  scene/
    terrain/
    silos/
    grain-handling/
    buildings/
    vegetation/
    lighting/
  navigation/
  interaction/
  data/
    three-tentos-unit.ts
    scene-config.ts
    reference-manifest.ts
  performance/
  types/
  tests/
public/models/3-tentos/
public/textures/3-tentos/
public/decoders/
scripts/industrial-map/
  blender/
  optimize/
docs/industrial-map/
```

Use Blender e scripts reproduzíveis para a modelagem detalhada, com CAD como apoio quando houver dados adequados. Componentes paramétricos em Three.js podem sustentar a primeira versão e ajustes de implantação. Ferramentas de produção de ativos não devem ser dependências do runtime no navegador.

Separe fontes de modelagem de GLBs otimizados. Confira unidades, eixos, normais, transformações e materiais após exportação. Faça bake dos materiais procedurais que não puderem ser reproduzidos pelo pipeline glTF escolhido.

Carregue por setores e priorize terreno, silos e volumes principais. Organize metadados e manifesto de ativos. Não gere árvores complexas ou malhas pesadas durante cada interação. Hospede os decodificadores necessários de maneira controlada.

Caso Blender não esteja disponível, entregue scripts reproduzíveis e desenvolva a parte funcional possível, distinguindo ativos gerados dos ainda não executados. Não afirme possuir um arquivo exportado que não exista.

## 13. Desempenho, carregamento e compatibilidade

Use WebGL2 como base, com fallback HTML claro em dispositivos incompatíveis. WebGPU será opcional e não deve duplicar o trabalho sem benefício verificado.

Adote como metas iniciais, não garantias: aproximadamente 60 FPS em desktop de referência e 30 FPS em dispositivo móvel identificado; até cerca de um milhão de triângulos visíveis e 250 draw calls no perfil desktop equilibrado; até 350 mil triângulos e 150 draw calls no perfil móvel econômico. Meça também passes de sombras, reflexos e pós-processamento.

Busque primeira visualização interativa com até aproximadamente 8 MB transferidos e refinamento progressivo posterior. Registre rede, dispositivo, resolução e DPR. Não confunda tamanho comprimido de download com memória depois da decodificação.

Use instanciamento por setores para vegetação, postes e componentes repetidos; LOD; descarte fora do campo de visão; compartilhamento de materiais e geometrias; e compressão adequada de malhas e texturas. Avalie glTF Transform, meshoptimizer e KTX2/Basis conforme compatibilidade real, sem aplicar compressões redundantes à mesma malha.

Controle transparência e overdraw das folhas. Limite resolução de textura à distância de inspeção. Reduza efeitos e vegetação periférica antes de prejudicar a geometria principal.

Implemente qualidade adaptativa com limites e histerese. Renderize sob demanda quando tudo estiver parado; vento e transições devem invalidar os quadros necessários. Pause trabalho desnecessário em abas ocultas. Não atualize estado React a cada quadro para movimentar a cena.

Descarte corretamente recursos e listeners, respeitando geometrias e materiais compartilhados. Teste repetidas entradas e saídas da rota. Registre FPS e percentis de tempo de quadro, draw calls, geometria e memória observável; identifique estimativas e não trate heap JavaScript como memória da GPU.

## 14. Pesquisa e referências de implementação

Consulte os repositórios oficiais abaixo e confirme compatibilidade, manutenção e licenças antes de incorporar código ou ativos. Registre origem, versão/commit, finalidade e atribuição em `docs/industrial-map/third-party-assets.md`. Bibliotecas de referência não substituem a modelagem específica da unidade.

```text
Modelagem e componentes industriais:
https://github.com/blender/blender
https://github.com/FreeCAD/FreeCAD
https://github.com/oddtopus/dodo

Renderização e integração React:
https://github.com/mrdoob/three.js
https://github.com/pmndrs/react-three-fiber
https://github.com/pmndrs/drei

Vegetação:
https://github.com/dgreenheck/ez-tree

Câmera e consultas espaciais:
https://github.com/yomotsu/camera-controls
https://github.com/gkjohnson/three-mesh-bvh

Processamento e validação de ativos:
https://github.com/donmccurdy/glTF-Transform
https://github.com/zeux/meshoptimizer
https://github.com/KhronosGroup/glTF-Validator
```

Não presuma que licença de código também cobre fotografias, HDRIs, texturas e modelos distribuídos junto ao projeto. Não incorpore material sem autorização compatível com o uso pretendido. Não acrescente todas as bibliotecas da lista ao projeto automaticamente.

## 15. Execução incremental e critérios de aceitação

Primeiro, apresente um diagnóstico curto do checkout e implemente uma rota funcional com blockout completo. Depois, valide os quatro enquadramentos e detalhe um silo e um trecho de estrutura como padrão visual. Em seguida, complete os equipamentos, edifícios, vias, cercas e vegetação; refine materiais; finalize interação; e otimize com medições.

Não interrompa o trabalho na entrega de um plano quando houver ferramentas para implementar. Também não marque como concluído o que ainda depender de ativos, medidas ou testes indisponíveis. Registre pendências e prossiga nas partes independentes.

A entrega deverá manter `/mapas-3d` acessível por menu e URL direta, sem regressões nas demais rotas e sem erros de hidratação introduzidos. Controles precisam funcionar efetivamente; botões sem comportamento não contam como funcionalidades.

Compare capturas do mesmo modelo com as quatro fotos. Avalie implantação, silhueta, profundidade e acabamento separadamente. Erros em pixels não devem ser apresentados como precisão dimensional em metros.

Não aceite equipamentos desconectados, geometrias flutuantes, z-fighting perceptível, alterações de silhueta entre LODs, vegetação dentro de edificações ou navegação normal atravessando obstáculos.

Execute um percurso de teste de pelo menos dois minutos nos perfis disponíveis, documentando hardware e navegador. Verifique seleção, toque, teclado, retorno à visão geral, minimapa, camadas, fallbacks, carregamento com falha e ciclos de montagem/desmontagem. Se não houver dispositivo móvel real, declare a simulação e sua limitação.

Execute os scripts de build e lint encontrados no projeto, verificação TypeScript e testes adequados aos arquivos alterados. Não invente um script de teste já existente: confira antes, adicione testes de forma localizada quando necessário. Valide os GLBs gerados e revise o resultado após otimização.

## 16. Entrega, Git e relatório final

Entregue código funcional integrado, configurações de implantação, cadastro de elementos, câmeras de referência, ativos efetivamente gerados, scripts reproduzíveis, instruções de execução e documentos de limitações, desempenho e licenças.

Mantenha documentação em `docs/industrial-map/` com arquitetura, reconstrução, calibração, testes e pendências. Atualize o README de maneira incremental. Não reescreva páginas ou módulos alheios ao escopo.

Revise o diff antes de qualquer commit. Não use `git add .` indiscriminadamente em checkout com trabalho de outras pessoas. Não versione `node_modules`, builds locais, segredos, originais não autorizados ou arquivos grandes sem política definida. Preserve o histórico e a integração com Lovable.

Prepare alterações em branch dedicada. Publicação da implementação, merge e deploy exigem autorização explícita para essas ações; a indicação do remoto não autoriza mudanças destrutivas nem publicação de dados privados. Se houver autorização para push, envie apenas a branch e os arquivos do escopo, sem force push.

No relatório de conclusão, informe diretório e branch efetivamente utilizados, arquivos alterados, rota de acesso, funcionalidades implementadas, comandos executados e resultados reais, medidas de desempenho, hipóteses geométricas e pendências. Diferencie claramente edição local, commit, push, merge e deploy. Não afirme sincronização com o computador do usuário quando a operação tiver ocorrido somente em ambiente remoto.

**Execute a implementação progressivamente até obter uma unidade tridimensional reconhecível pelas fotografias, com estruturas industriais detalhadas, vegetação coerente, iluminação realista e navegação fluida, preservando a arquitetura e o funcionamento do Sistema Nexus.**

---

## Fontes técnicas e arquivos consultados para preparar o prompt

Revalide estes arquivos no checkout utilizado na implementação. A inspeção do repositório remoto não confirma o estado do diretório Windows.

```text
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/AGENTS.md
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/package.json
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/README.md
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/src/routes/README.md
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/src/routes/__root.tsx
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/src/routeTree.gen.ts
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/src/lib/nexus-nav.ts
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/src/components/nexus/AppShell.tsx
https://github.com/leomateus620-pixel/nexus-unified-platform/blob/main/vite.config.ts
https://tanstack.com/router/latest/docs/api/router/clientOnlyComponent
https://r3f.docs.pmnd.rs/advanced/scaling-performance
https://r3f.docs.pmnd.rs/advanced/pitfalls
https://github.com/dgreenheck/ez-tree/blob/main/README.md
https://github.com/donmccurdy/glTF-Transform
```
