# Unidade 3Tentos · CAD integrado à base existente

A aplicação permanece em **`/mapas-3d`**, no menu existente do Nexus, com a mesma cena, IDs históricos, materiais e controles. A revisão integra medidas CAD às estruturas associadas e preserva a implantação fotográfica, com intervenções localizadas registradas no cadastro.

O usuário confirmou que o CAD de Giruá e as referências pertencem à mesma unidade e autorizou uma convenção local de integração. Isso não define norte geográfico, coordenadas cadastrais ou datum de campo. **Geometria CAD verificada, base fotográfica estimada e nome técnico por convenção são informações separadas.** A medição interativa permanece desativada; o painel informa a origem, os envelopes e as cotas locais.

## Executar o mapa

Node.js/npm executam a aplicação; Blender só é necessário para gerar modelos. O lockfile npm define as versões. O gerador usa Blender 4.5 LTS; a extração CAD usa Python 3 com `numpy` e `lxml`.

```sh
npm ci
npm run dev
# abrir /mapas-3d na URL informada pelo Vite
npm run typecheck
npm run test:industrial
npm run build
npm run preview -- --port 4173
```

TanStack Start, o wrapper Vite/Lovable, o SSR das demais rotas e o destino Cloudflare permanecem. A prévia usa Wrangler local. No Windows, encerre a prévia antes de outro build, pois o Worker pode manter arquivos de `.output/public` abertos. Esses comandos não publicam a aplicação.

## Fontes e coordenadas

| Fonte                                             | Responsabilidade                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/industrial/data/site.json`                   | Implantação Nexus, dimensões, identificação, proveniência, anchors, bounds, colliders, câmeras e base preservada |
| `.model` original autorizado                      | Vértices, hierarquia e transformações CAD; entrada local offline                                                 |
| `assets/industrial/cad/registry-source.json`      | Registro compacto da auditoria, fonte/hash e medidas por ocorrência                                              |
| `assets/industrial/cad/partition-footprints.json` | Projeções convexas dos vértices pertencentes a cada partição, sem filhos excluídos                               |
| `public/references/3tentos/`                      | Fotos originais: aparência, entorno e implantação histórica                                                      |

O original tem 322.380.101 bytes e SHA-256 `bd6767218d609c1e4180e27169fcc5345c56e554e6f320a812e7a7da1ae2702b`. O arquivo fornecido como `3dmodel.model` corresponde ao conteúdo auditado como `8ae5c19b-e1af-4dc4-9c7c-215a3f18c58d.model`. O original e o cache de malhas não substituem os derivados compactos versionados.

A extração converte vértices e translações de milímetros para metros uma vez. O registro CAD métrico → Nexus usa yaw de π e translação, **com escala 1**, sem deformação para caber no traçado estimado. Solo CAD Y=0,010 corresponde ao datum Nexus Y=0; os pisos visuais preservados têm cotas próprias.

Blender converte Nexus `(x,y,z)` para `(x,−z,y)` e exporta glTF Y-up. Matrizes acumuladas e registro são compostos uma vez. **Os GLBs já contêm placement; React não reaplica `element.position`.** Caminho de instância, não apenas ID CAD, identifica cada ocorrência. Veja [método de geometria CAD](cad-geometry.md).

## Preparação incremental

Execute da raiz do repositório, substituindo o caminho de exemplo pelo original autorizado:

```sh
npm run assets:extract -- --source "C:/caminho/3dmodel.model"
node scripts/cad/integrate-site.mjs --check
```

`assets:extract` verifica hash, lê o XML, acumula build/ancestrais e calcula goldens independentes dos GLBs. O cache padrão é `assets/industrial/raw/cad/`, ignorado pelo Git: `geometry-cache.npz`, `cad-manifest.json`, custos e validação do cache. O navegador não carrega esse inventário. `CAD_PYTHON` configura o Python com `numpy`/`lxml`; o extrator aceita `--cache-dir`, `--goldens` e `--reference-dir`.

`integrate-site.mjs --check` confere a reprodução do cadastro. Sem `--check`, aplica as associações/convenção documentadas, preservando `legacySnapshot` e a base fora dos remendos autorizados. Não é ajuste automático por aparência.

Para alterar somente silos, o gerador inclui automaticamente os dois LODs e blockout:

```sh
npm run assets:generate -- --sectors silos-high
npm run assets:optimize
```

Para estruturas e os remendos locais desta revisão:

```sh
npm run assets:generate -- --sectors silos-high,buildings,grain-handling,blockout,terrain,fences,grass
npm run assets:optimize
```

Selecione apenas setores e dependências afetados. Um novo registro global afeta todos os setores CAD; mudanças de dimensões podem afetar ligações, grama e piso local. Selecionar um protótipo vegetal inclui também seu outro LOD. `BLENDER_BIN` configura outro executável; `--cad-cache` informa cache fora do padrão.

O gerador abre o `.blend` existente, substitui coleções selecionadas e reutiliza materiais/imagens. O manifesto `assets/industrial/raw/generation-manifest.json` informa o conjunto produzido. O otimizador usa esse manifesto para não promover intermediários antigos. A fonte deve incluir ambos os LODs antes de salvar.

A otimização ocorre em `assets/industrial/raw/optimized/`, preservando IDs. O conjunto selecionado é validado antes da cópia para `public/models/3tentos/`; meshopt também é decodificado para validação Khronos. O terreno conserva posições sem quantização que colapse separações entre pisos. Falha interrompe a promoção. Conferir relatório/hashes antes de considerar a geração concluída.

`npm run assets:prepare` prepara todos os setores. Para trabalho incremental, use os dois comandos explícitos acima.

### Ferramentas históricas

`scripts/create-industrial-data.mjs` é o bootstrap fotográfico e **recusa executar sobre cadastro com `cadRegistration`**. Não serve para correções CAD.

`scripts/fit-reference-cameras.mjs` conserva o ajuste A/C por pixels da Foto B e não integra o fluxo CAD atual. Seus landmarks estimados e resíduos históricos não substituem anchors registrados nem pontos independentes de conferência.

## Interface e navegação

- **Elementos:** malha, lista, busca e minimapa mantêm o mesmo ID. Busca reconhece aliases, nome CAD e identificador técnico; exportação conserva proveniência e estados.
- **Foco/legenda:** usam envelopes/anchors, incluindo elevações e acessórios, sem repetir transformações.
- **Minimapa:** projeções convexas podem conter vazios e não são footprints de contato. Elas são separadas dos colliders; partes subterrâneas aparecem tracejadas.
- **Passeio:** WASD/setas, arrastar, toque, ponteiro opcional e Esc. Olhos em `groundHeightAt(x,z) + 1,7 m`; colisões respeitam intervalo vertical, mantendo edifícios fechados e portão aberto. Não há circulação subterrânea inferida.
- **Apresentação:** mesmos modos orbital/superior/passeio, vistas A–D, camadas, luz, blockout, qualidade, vento, sobreposição e acessibilidade. Carregamento mantém setores, cancelamento e descarte.

## Organização

| Diretório                                              | Conteúdo                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `src/industrial/app`, `ui`                             | Interface, busca, detalhes, minimapa, fotos e exportações   |
| `src/industrial/data`, `types`                         | Fonte central e contratos                                   |
| `src/industrial/scene`, `navigation`                   | Ativos, seleção, LOD, helpers espaciais, câmeras e colisões |
| `src/industrial/lighting`, `vegetation`, `performance` | Ambiente, instanciamento, vento e diagnósticos              |
| `scripts/cad`, `scripts/blender`                       | Extração, registro, compatibilização e geração              |
| `assets/industrial/source`                             | Fonte Blender editável                                      |
| `public/models/3tentos`                                | Dez arquivos por setor/LOD                                  |
| `tests/industrial`, `docs/industrial/evidence`         | Testes e evidências identificadas pela geração              |

## Validação reproduzível

```sh
npm run typecheck
npm run test:industrial
npm run test:industrial:cad
node scripts/audit-industrial-geometry.mjs
npm run build
npm run test:industrial:ui
npm run test:industrial:views
npm run test:industrial:performance
```

Scripts de navegador exigem aplicação executando. Playwright usa `MAP_URL` como endereço base; captura/benchmark usam URL completa com `/mapas-3d`. Os testes usam Chrome instalado; emulação móvel não certifica Android/iPhone físicos ou Safari. Benchmark registra host/perfil/percurso; tamanho de arquivo não é memória GPU nem FPS.

O roteiro não comprova aprovação. Consulte [validation.md](validation.md) para checks efetivamente executados. Evidências de 14/09/2026 pertencem à versão fotográfica até serem substituídas por medições identificadas da revisão CAD. Um relatório consolidado não executa os testes que cita. Veja também [proveniência](reconstruction.md) e [licenças](licenses.md).
