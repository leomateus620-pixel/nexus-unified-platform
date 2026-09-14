# Sistema Nexus — Escopo Inicial

Plataforma interna para centralizar a operação comercial, técnica e documental, do primeiro contato comercial até o histórico do cliente.

## O que entra nesta primeira entrega

Uma versão navegável e completa da estrutura do sistema: todos os menus existem, com telas reais (listas, filtros, formulários, detalhes) alimentadas por dados de exemplo. O objetivo é validar fluxo, telas e identidade visual antes de ligar o banco de dados e o login.

### Identidade visual (das imagens enviadas)
- Fundo verde-escuro profundo (quase preto esverdeado), superfícies em verde petróleo
- Destaque em verde neon para ações, indicadores e traços de contorno
- Texto branco/cinza-claro, tipografia sem serifa larga e técnica
- Detalhes gráficos: linhas curvas finas em neon e cortes diagonais, como nas artes da marca

### Menus e telas
1. **Dashboard** — indicadores de propostas, projetos, execução, financeiro e pendências
2. **Comercial** — oportunidades (funil), negociações, propostas, aprovações
3. **Clientes** — cadastro, contatos, unidades, projetos, documentos, histórico
4. **Produtos e Soluções** — produtos, códigos, NCM, custos, fornecedores, impostos, biblioteca técnica
5. **Levantamentos Técnicos** — fichas de campo, fotos, conformidades/não conformidades, quantitativos
6. **Engenharia** — NR-12, espaços confinados, trabalho em altura, análises de risco, dimensionamentos
7. **Projetos** — projetos aprovados, lista de materiais, prazos, ordens de produção
8. **Compras e Produção** — solicitações, fornecedores, compras, itens a fabricar
9. **Execução / Ordens de Serviço** — equipes, horas, deslocamentos, materiais, fotos, assinaturas
10. **Documentação Técnica** — laudos, relatórios, memoriais, dossiês, modelos
11. **Inspeções** — periodicidade, validade, histórico, próximas revisões
12. **Financeiro** — custos, margens, orçamento, faturamento, resultado por projeto
13. **Relatórios** — desempenho comercial, técnico, operacional e financeiro
14. **Mapas 3D das Unidades** — cena 3D interativa da unidade do cliente
15. **Configurações** — usuários, permissões, templates, normas, impostos, categorias, parâmetros

### Mapas 3D das Unidades
Cena 3D navegável (girar, aproximar, mover) representando a planta de uma unidade: estruturas, silos, máquinas, linhas de vida, espaços confinados, pontos de ancoragem, acessos e áreas. Cada elemento é clicável e abre um painel lateral com os dados ligados ao sistema (situação, inspeções, laudos, projeto relacionado). Nesta fase, com uma unidade de exemplo montada por volumes simples, no visual da marca.

### Fluxo
O caminho Cliente → Oportunidade → Proposta → Levantamento → Engenharia → Dimensionamento → Custos → Aprovação → Projeto → Compras/Produção → Execução → Documentação → Inspeções → Histórico aparece como trilha de etapas na tela do projeto, mostrando onde cada trabalho está.

## O que fica para as próximas etapas
- Banco de dados real, login e permissões por perfil
- Geração de documentos em PDF e assinaturas
- Importação da planta real das unidades para o 3D
- Integrações (fiscal, financeiro, e-mail)

## Notas técnicas
- Layout com barra lateral fixa, cabeçalho com busca e contexto do cliente/projeto
- Tokens de cor e tipografia definidos no design system (`src/styles.css`), sem cores fixas nos componentes
- Rotas por módulo em `src/routes/*`, com lista e detalhe por área
- Dados de exemplo em módulos locais, prontos para troca por consultas reais
- 3D com Three.js (react-three-fiber), carregado apenas no navegador
- Cada página com seu próprio título e descrição para SEO
