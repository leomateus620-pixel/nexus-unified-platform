# Fonte Blender e integração CAD

`3tentos-reconstruction.blend` é a fonte editável produzida por `scripts/blender/generate_unit.py`, com Blender 4.5 LTS. Reúne a base fotográfica preservada e as partições geométricas do CAD da unidade confirmada pelo usuário. A geração empacota as imagens no arquivo e reutiliza os materiais existentes. Esse arquivo não substitui o original CAD nem o cadastro central em `src/industrial/data/site.json`.

## Coleções e geração incremental

As coleções correspondem a `terrain`, `buildings`, `grain-handling`, `silos-high`, `silos-low`, `fences`, `grass`, `vegetation-prototypes`, `vegetation-low` e `blockout`. A fonte também inclui `vegetation-layout`, com instâncias ancoradas, e câmeras de referência A–D. Os setores high/low e blockout têm a mesma referência geométrica; detalhes e densidade de malha variam conforme o LOD.

O gerador abre a fonte existente, substitui apenas as coleções selecionadas por `--sectors` e suas dependências, preservando as demais. Alterar silos inclui os dois LODs e blockout. A geração salva a fonte antes da otimização dos GLBs; **uma fonte salva não comprova que os modelos públicos passaram na validação**. Consulte o manifesto da execução e os relatórios antes de considerar uma revisão concluída.

## Fonte local e coordenadas

O XML `.model` original autorizado permanece fora do repositório. A extração offline gera `assets/industrial/raw/cad/geometry-cache.npz` e `cad-manifest.json`, ignorados pelo Git. O navegador utiliza os GLBs compactados, sem acesso ao XML ou ao cache local. Para regenerar as partições CAD é necessário obter a mesma fonte autorizada e executar a extração; a fonte Blender preserva as malhas editáveis da geração salva.

Os vértices do cache estão em metros. O gerador acumula as transformações das ocorrências, aplica o registro rígido CAD → Nexus com escala 1 e converte a base para Blender `(x,−z,y)`. O exportador retorna glTF Y-up; posições e rotações ficam incorporadas ao ativo, sem nova transformação no React. As cotas subterrâneas são mantidas.

Nome CAD, caminho de instância, proprietário Nexus e estado de associação ficam separados no cadastro e nos metadados. A convenção local não estabelece georreferenciamento, datum de campo ou nome operacional oficial. Os componentes CAD têm medidas verificadas contra a fonte; terreno, vias, vegetação e estruturas sem associação confirmada mantêm sua proveniência fotográfica estimada. Espessuras e detalhes estimados não são especificações de fabricação, e a navegação não certifica interiores ou segurança operacional.

Consulte o [pipeline de preparação](../../../docs/industrial/README.md), o [método de extração e redução](../../../docs/industrial/cad-geometry.md), a [proveniência e as associações](../../../docs/industrial/reconstruction.md) e a [validação efetivamente executada](../../../docs/industrial/validation.md).
