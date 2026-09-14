# Nexus Unified Platform

Crie um escopo inicial do sistema Nexus:  O Sistema Nexus é uma plataforma integrada para centralizar a operação comercial, técnica e documental da empresa. O foco é reduzir planilhas, retrabalho e informações espalhadas, conectando desde a oportunidade comercial até a execução técnica, geração de documentos e histórico do cliente.

O fluxo principal fica assim:

Cliente → Oportunidade → Proposta → Levantamento técnico → Engenharia → Dimensionamento → Custos → Aprovação → Projeto → Compras/Produção → Execução → Documentação → Inspeções → Histórico.

Menus principais do Nexus

Dashboard — indicadores gerais, propostas, projetos, execução, financeiro e pendências.

Comercial — oportunidades, negociações, propostas e aprovações.

Clientes — cadastro, contatos, unidades, projetos, documentos e histórico completo.

Produtos e Soluções — produtos, códigos, NCM, custos, fornecedores, impostos e biblioteca técnica.

Levantamentos Técnicos — coleta em campo, fotos, marcações, conformidades, não conformidades e quantitativos.

Engenharia — NR-12, espaços confinados, trabalho em altura, análises de risco e dimensionamentos.

Projetos — projetos aprovados, listas de materiais, prazos, ordens de produção e acompanhamento.

Compras e Produção — solicitações, fornecedores, materiais, compras e itens a fabricar.

Execução / Ordens de Serviço — equipes, horas, deslocamentos, materiais utilizados, fotos e assinaturas.

Documentação Técnica — laudos, relatórios, análises de risco, memoriais, dossiês e modelos de documentos.

Inspeções — inspeções periódicas, validade, histórico e próximas revisões.

Financeiro — custos, margens, orçamento, faturamento e resultado por projeto.

Relatórios — desempenho comercial, técnico, operacional e financeiro.

Configurações — usuários, permissões, templates, normas, impostos, categorias e parâmetros do sistema. Inclua mais este menu principal:

Mapas 3D das Unidades — visualização interativa e técnica das unidades dos clientes em ambiente 3D. Permite representar estruturas, máquinas, silos, linhas de vida, espaços confinados, pontos de ancoragem, acessos e áreas operacionais, vinculando cada elemento diretamente aos dados do sistema. Em anexo estão as cores e identidade visual para esse primeiro desenvolvimento.

This project was built with [Lovable](https://lovable.dev).

## Mapa 3D da unidade 3 Tentos

O menu **Mapas 3D das Unidades** abre `/mapas-3d`: reconstrução visual baseada nas quatro fotografias fornecidas, com silos paramétricos, edifícios, vias, vegetação, passeio, seleção e comparação de referências. Dimensões são estimadas e a ferramenta de medição permanece desativada.

Instalação reprodutível: `npm ci`, seguida de `npm run dev`. Os GLBs e o arquivo-fonte Blender já estão incluídos. Para regenerar os ativos com Blender 4.5 LTS: `npm run assets:prepare`.

Consulte [preparação completa, controles e testes](docs/industrial/README.md), [inventário e hipóteses](docs/industrial/reconstruction.md) e [validação e desempenho](docs/industrial/validation.md).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/91380c2d-559c-4527-b3a4-1a8bc1e19f69).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
