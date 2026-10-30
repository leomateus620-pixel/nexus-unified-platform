# Base operacional NR-33 e NR-35

Os módulos compartilham identidade, organização ativa, clientes, unidades e acervo. As rotas `/nr-33` e `/nr-35` abrem visões filtradas por norma; um registro aplicável às duas normas conserva o mesmo UUID. O shell global e o gate autenticado continuam canônicos.

As páginas abrangem visão geral, clientes/unidades, locais, levantamentos, documentos, pastas, pendências, biblioteca, histórico e configurações. Detalhes usam URLs estáveis, por exemplo `/nr-33/locais/UUID` e `/nr-35/documentos/UUID`. Busca, contexto, paginação e lixeira são parâmetros validados. A NR-33 acessa a PET existente em `/execucao/pets`; não cria outra identidade de PET.

Consulte [arquitetura](arquitetura.md), [mapeamento](mapeamento.md), [importação e recuperação](importacao-recuperacao.md), [conversão DOCX](docx-derivados.md) e [impactos documentais](impactos-documentais.md), [publicação técnica interna](publicacao-tecnica.md) e [histórico/reconciliação](historico-e-reconciliacao.md). Evidências de banco, tipos, build e regressões ficam em [evidencias](evidencias/). As capturas de laboratório e os documentos sintéticos renderizados ficam em `docs/nexus-operacional/nr/evidencias`.

O [estado verificável da entrega](estado-entrega.md) registra os 736 documentos preservados, os 233 derivados editáveis e os 1.022 objetos confirmados no Storage, além das pendências específicas. O [dimensionamento](dimensionamento.md) separa consumo comprovado, tamanhos declarados e premissas de crescimento.

O ledger conectado contém **64 entradas**. As oito migrações aditivas `0038`–`0045` foram efetivamente aplicadas pelo Lovable, preservando a histórica `0037`. As provas de instalação limpa, upgrade, repetição, rollback, tipos e aplicação remota estão em [evidências técnicas](evidencias/README.md). O lote foi encerrado como `com_pendencias`: 4.300 itens terminais, dos quais 3.260 importados, 550 revisões históricas indisponíveis e 490 referências de imagens sem correspondência. A inspeção administrativa permite consultar esses resultados e suas evidências sob demanda, sem SQL manual.

## Limites funcionais explícitos

Importação conserva o estado histórico `emitido_origem`, sem criar aprovação ou assinatura Nexus. Aprovar/emitir novos documentos permanece bloqueado enquanto não existir o fluxo profissional e de assinatura aplicável; nenhum botão simula essa emissão. Revisão de impactos usa o vínculo profissional real existente e não equivale a uma certificação externa. PET, avaliação atmosférica atual, presença e liberação de entrada conservam os contratos anteriores.

As nove regras e seis critérios importados permanecem em rascunho e sem ativação normativa automática. A publicação técnica interna está disponível pela interface, com vínculo profissional real, fontes/versionamento, datas e confronto registrado; nenhum critério legado foi publicado por esta migração. Texto legado, cálculo, fotografia e documento recebido não comprovam segurança ou conformidade normativa. As configurações não atribuem capacidades, validade ou frequência de inspeção desconhecidas.

O editor nativo oferece títulos, parágrafos, tabelas, imagens privadas, referências e campos vinculados/snapshots. A conversão DOCX produz documento derivado separado, com limitações declaradas; o original permanece íntegro. Exportações PDF/DOCX são cópias de consulta, sem assinatura. PDF recebido não vira conteúdo editável por inferência.

Arquivos locais obtidos, arquivos confirmados no Storage e referências ainda indisponíveis são contagens distintas. O relatório final do lote no banco e os relatórios privados de conciliação são a autoridade sobre o progresso; esta documentação de arquitetura não declara concluído um upload apenas preparado.
