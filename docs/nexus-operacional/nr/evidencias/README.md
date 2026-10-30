# Verificação visual NR-33/NR-35 — 30/10/2026

As capturas deste diretório mostram os componentes reais do Nexus dentro do laboratório isolado `tests/ui`. Todos os cadastros, textos e indicadores exibidos são **fixtures sintéticas de teste**, sem correspondência com clientes reais. As capturas não comprovam importação, persistência Supabase, RLS, acesso ao Storage ou conformidade técnica.

## Fluxos conferidos no Chrome

- Painel branco, shell global preservado e dois menus NR visíveis.
- Criação de local com cliente, unidade e TAG: confirmação após resposta e nova consulta à lista.
- Ficha de local, vínculo com dados canônicos e estados próprios do acervo.
- Documento nativo com título, parágrafo e tabela; alteração de seção, confirmação e versão atualizada após nova consulta.
- Formulário em celular: foco inicial no primeiro campo editável, inputs legíveis, contexto de cadastro protegido, salvamento indicado apenas após resposta.
- Escape com preenchimento alterado apresenta confirmação explícita de descarte; o descarte preserva o documento previamente salvo.
- Troca de área por seletor em celular; abas em desktop/tablet.
- Gerenciador de arquivo sintético: alteração do nome de exibição, arquivamento com motivo, consulta da lixeira, restauração e movimento para pasta; o nome original, UUID e hash permaneceram visíveis e inalterados.
- Gate real em `http://127.0.0.1:3000/nr-33`: sem sessão, redirecionamento para `/auth`; console sem erros após a estabilização do servidor e a recarga final. Esse teste não iniciou sessão nem alterou dados reais.
- Larguras 390 px (celular) e 820 px (tablet): `document.documentElement.scrollWidth === innerWidth`, depois da correção de uma margem que excedia 4 px no celular.

## Capturas inspecionadas

- `laboratorio-desktop-painel.png`: painel e navegação global.
- `laboratorio-mobile-local.png`: ficha de local e contexto em 390 px.
- `laboratorio-mobile-editor.png`: formulário e foco em 390 px.
- `laboratorio-tablet-documento.png`: leitura de texto e tabela, acervo e ações em 820 px.
- `laboratorio-desktop-arquivos.png`: comandos do gerenciador e identidade da fixture após renomeação, arquivamento, restauração e movimento.
- `rota-real-gate-sem-sessao.png`: aplicação real na autenticação após acesso direto a `/nr-33`.

O servidor de apresentação simula respostas somente neste laboratório. Upload/exportação não chamam banco, Storage ou clientes reais. A persistência e os controles de autorização dependem das verificações separadas de PostgreSQL e da homologação autenticada no ambiente conectado. Avisos de hot reload do laboratório durante a edição não são evidência de um erro no bundle de produção.

A conferência visual e os fluxos manuais descritos não constituem certificação WCAG. Leitor de tela completo, zoom do sistema, navegadores alternativos, duas sessões reais e integração Auth/Storage HTTP permanecem verificações separadas.

## Complemento: impactos e consumo

A interface de impactos foi conferida com fixture sintética: o botão de conferência permaneceu ausente na revisão afetada; a criação explícita de nova revisão habilitou o formulário; a confirmação registrou a decisão e manteve os valores anterior/novo acessíveis. A configuração exibiu métricas agrupadas por unidade/bucket e distinguiu medição de capacidade informada. Console do laboratório sem erros na leitura final.

Capturas: `laboratorio-impactos-conferencia.png` e `laboratorio-consumo-configuracoes.png`. A lógica persistente e os testes negativos correspondentes estão documentados em `docs/nr/impactos-documentais.md`.

## Complemento: revisões e eventos sob demanda

No Chrome, em 1.470 × 686 px, a lista de versões foi aberta por Enter e a versão selecionada abriu em modal somente de leitura, com zero inputs editáveis. O modal mediu 900 × 597,78 px, em x=285/y=34,30, integralmente dentro da viewport. A inspeção visual revelou uma sobreposição entre as transformações do componente shadcn e do estilo NR; o leitor passou a usar conteúdo Radix com o posicionamento NR, e a captura foi refeita após a correção.

Os eventos foram carregados em uma página de 25 metadados e ampliados para 28 pelo comando de próxima página. O evento completo foi consultado apenas quando aberto. Tab permaneceu dentro do modal; Escape fechou o evento e devolveu o foco ao botão que o abriu. Árvores de snapshots só montam seus filhos quando expandidas, preservando a leitura sem criar toda a árvore no DOM de imediato.

Capturas sintéticas inspecionadas:

- `laboratorio-revisao-sob-demanda.jpg`: conteúdo da revisão em modal branco, tabela e contexto de leitura.
- `laboratorio-evento-sob-demanda.jpg`: evento selecionado e acesso aos estados anterior/posterior.

Os schemas dedicados da publicação técnica e do histórico foram exercitados separadamente: fontes oficiais por norma, cronologia, licença declarada com arquivo privado, ausência de poderes profissionais fornecidos pelo cliente, limites de evidência, IDs bigint sem perda de precisão e recusa de conteúdo integral nas listas de metadados. A leitura unitária permite snapshots retidos maiores que um formulário editável.

A etapa seguinte tentou ajustar a viewport para 390 × 844 px, mas a conexão com a extensão Chrome deixou de responder. A retomada e a solicitação de restauração do viewport também não retornaram confirmação. Por isso, **não se declara homologação visual/móvel dos novos painéis de publicação técnica e inspeção de importações**, nem conclusão do novo teste móvel de histórico. As capturas móveis anteriores pertencem aos fluxos já descritos, não cobrem essas funcionalidades posteriores. As verificações de banco, autorização e schemas permanecem evidências separadas.
