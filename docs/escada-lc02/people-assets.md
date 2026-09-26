# Personagens da circulação LC-02

As pessoas são elementos ilustrativos de circulação. Não provêm do PDF e não acrescentam dados de projeto à estrutura.

## Origem e licença

Base anatômica, alvos corporais e esqueleto GameEngine: **MakeHuman/MPFB 2.0.17**, commit `80919fa4682335c41847f761a4d79dcad4124732`.
Pacote **MakeHuman system assets**, arquivos `male_worksuit01`, `shoes02`, `low-poly` (olhos), `young_caucasian_male` e `young_african_female` (peles).

Esses recursos gráficos são CC0-1.0. Os cabeçalhos dos arquivos do pacote registram a cessão em setembro de 2020 e os autores Data Collection AB, Joel Palmius e Jonas Hauquier. O gerador usa o código MPFB somente dentro do Blender; nenhum código MPFB é distribuído ao navegador.

- Licença: https://static.makehumancommunity.org/about/license.html
- Pacote: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- Exportação: https://static.makehumancommunity.org/mpfb/docs/exporting.html
- CC0: https://creativecommons.org/publicdomain/zero/1.0/

Capacete com aba arredondada e canos acolchoados das botas: geometria original gerada pelo script. Uniformes e proporções receberam ajustes próprios. A aparência dos equipamentos não representa certificação de EPI.

## Arquivos e reprodução

`public/models/escada-lc02/people/worker-a.glb` e `worker-b.glb` contêm duas bases distintas, cada uma com 53 ossos, geometria próxima e distante. `manifest.json` registra hashes, tamanho e contagens exatas. Texturas PBR de até 2048 px estão incorporadas aos GLBs.

Com Python 3.11+ e Blender 4.5 instalado:

```powershell
python scripts/escada-lc02/prepare-people-assets.py
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/escada-lc02/build-people.py
npm run test:escada:assets
```

As entradas são baixadas de fontes oficiais e verificadas por SHA-256. Arquivos intermediários e fontes `.blend` ficam em `.cache/lc02`, fora do Git. Os scripts e manifestos permitem gerar novamente os modelos; a interface não depende de Blender, serviços externos, contas ou downloads durante a execução além dos recursos locais do próprio site.

## Animação e limites

O movimento é calculado sobre as mesmas posições de degraus usadas na geometria. Um pé mantém apoio fixo enquanto o outro passa ao degrau seguinte; pernas recebem IK e o quadril se ajusta ao alcance. Braços, tronco, curvas e transições de patamar acompanham a passada. Esqueletos são independentes; geometrias e texturas são compartilhadas, com dez personagens reutilizáveis.

Velocidades de 0,90 m/s nos pisos e 0,42 m/s de avanço horizontal nos lances, além do espaçamento de 0,90 m, são escolhas visuais. Não permitem inferir capacidade estrutural, tempo regulamentar de evacuação ou aprovação de circulação. Não há deformação da escada, simulação biomecânica ou contato físico com o corrimão.

O validador glTF pode apontar `NODE_SKINNED_MESH_NON_ROOT`: as malhas estão agrupadas sob a armadura exportada pelo Blender. O visualizador Three.js é o destino verificado. Esses avisos de hierarquia não equivalem a erros glTF; o relatório completo fica em `evidence/people/assets.json`.
