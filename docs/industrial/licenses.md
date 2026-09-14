# Proveniência e licenças

## Fotografias

Os quatro PNGs foram fornecidos pelo usuário para implementar esta reconstrução no repositório indicado. Seus nomes originais e hashes SHA-256 estão em `src/industrial/data/references.json`; os testes conferem os bytes. Autoria e licença de redistribuição ampla não foram informadas. O projeto não afirma que são domínio público ou que uma URL pública comprova licença. Não houve busca/reaproveitamento de fotografias de terceiros.

Nenhum logotipo da 3 Tentos foi redesenhado. O nome aparece como identificação textual da unidade. A interface conserva a identificação Nexus.

## Ativos autorais

Geometria, protótipos de vegetação, padrões de textura, composição e scripts foram produzidos para esta implementação. Não foram importados modelos industriais prontos, árvores de bibliotecas externas ou ativos CAD sem procedência. As texturas são geradas por código determinístico e integradas aos GLBs. Os scripts/materializações passam a integrar o código do projeto; nenhuma licença de terceiro é atribuída falsamente a esses ativos.

## Ferramentas e bibliotecas

As licenças exatas instaladas e versões estão em `evidence/dependency-licenses.json` e nos pacotes/lockfiles. Blender é uma ferramenta de autoria GPL; essa condição não transforma automaticamente a geometria produzida em um modelo GPL. Three.js, React, Fiber, Drei, glTF Transform e meshoptimizer usam suas respectivas licenças distribuídas nos pacotes. Khronos glTF Validator é usado na auditoria de ativos.

As referências FreeCAD, Dodo Workbench, EZ-Tree, Terra e three-mesh-bvh não foram copiadas nem incorporadas. Em particular, nenhum código/ativo CC BY-NC de Terra foi empregado.

## Referências técnicas consultadas

- [Compatibilidade de React Three Fiber e React](https://github.com/pmndrs/react-three-fiber).
- [MeshStandardMaterial: fluxo PBR e espaços de cor](https://threejs.org/docs/pages/MeshStandardMaterial.html).
- [glTF Transform: operações de otimização e validação](https://gltf-transform.dev/cli).
- API de exportação glTF conferida no Blender 4.5.10 instalado; API de compressão conferida nos pacotes glTF Transform 4.5.0 instalados.

Os serviços de fontes já existentes no shell do Nexus são mantidos. A aplicação continua funcional com fontes de fallback se esses serviços não estiverem disponíveis; a cena não depende deles.
