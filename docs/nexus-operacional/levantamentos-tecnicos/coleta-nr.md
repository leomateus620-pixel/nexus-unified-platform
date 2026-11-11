# Coleta de campo NR-33 e NR-35

A coleta abre em **Conformidade → NR-33 ou NR-35 → Levantamento**. A unidade selecionada delimita a busca por TAG, nome e alias. Na ficha técnica e no mapa, **Abrir levantamento** filtra a mesma lista pelo identificador do local. O título e a ação do cartão levam à mesma coleta. O formulário administrativo continua em **Roteiro, origem e administração**.

## Referências e recortes

A comparação visual do Perplexity usou o EC 28 nos blocos 01, 09, 14, 15 e 16, e a Moega 01 no início. O silo tinha 16 blocos e a moega, 15. As duas quantidades e a fonte de vazão do B09 pertencem ao roteiro de origem. O B14 usa cartões e eixos independentes. O Nexus manteve seus tokens, ampliou os alvos de toque e separou conclusão de campo da revisão técnica.

O ponto de partida é `acc0dc30c0272aa201e94aea4f8c9a27db31b7fa`. O Nexus publicado pediu autenticação no navegador da sessão. A causa do recorte foi verificada no SQL e em banco de teste: a consulta exige a norma vinculada ao levantamento. Respostas de altura no B16 não atribuem enquadramento. O mesmo levantamento aparece nos dois menus quando os dois escopos foram confirmados no cadastro e na abertura. O roteiro piloto Telhado ou laje registra observações e fontes. Sua revisão técnica de campo permanece com o responsável pelo modelo.

As versões históricas usam a projeção já existente. Uma nova coleta derivada exige de-para exato com a versão original ou sua apresentação comprovada. A origem, autor e data das respostas copiadas são preservados. A edição subsequente grava nova autoria para o campo alterado. A reinspeção referencia a coleta aprovada e abre uma nova observação do mesmo ativo.

## Conclusão e saídas

A migração `0067_nr_coleta_campo.sql` reaproveita os locais, modelos, respostas e histórico NR. As RPCs validam organização, cliente, unidade, local, versão e capacidades. O salvamento grava só os campos alterados e o bloco de retomada por norma. O diagnóstico de aplicabilidade existente valida o fechamento. A revisão congelada retém o corpo do roteiro, respostas, medidas, fontes, evidências e autoria.

- A conclusão cria um Relatório de Campo imutável no acervo. O PDF é gerado pelo renderizador NR e a representação privada usa uma chave estável da revisão. A geração pode ser repetida após falha de armazenamento. A prévia em loopback usa o mesmo renderizador e metadados SQL controlados, sem Storage remoto.
- A decisão técnica exige a atribuição de revisão e a identidade profissional cadastrada. A devolução registra motivo. A aprovação produz um Relatório Técnico separado, com link para a revisão congelada. Os dois relatórios aparecem vinculados ao local e ao acervo da unidade.
- Uma adequação marcada Verificar com aplicabilidade pendente gera pendência rastreável. A base comercial em CSV inclui apenas itens confirmados na aprovação com código de catálogo, quantidade, unidade e evidência. A adoção de medidas em proposta segue o mecanismo de Levantamentos Técnicos.
- Cadastros, procedimentos, memoriais e programas são preparados a partir de um modelo publicado e do catálogo contratado, com referência à revisão aprovada. O destino segue o escopo do tipo documental. A preparação gera um rascunho. Cálculos e critérios permanecem no motor técnico do local.
- **Iniciar reinspeção deste ativo** mantém a relação com o levantamento aprovado. A rota geral de inspeções periódicas ainda não tem cadastro próprio.

## Evidência

Em PostgreSQL 18 descartável, `tests/cotrirosa/coleta-db.mjs` validou os recortes, a versão fixada, repetição e concorrência, validação de campos, devolução, aprovação, retomada, relatórios, seleção comercial, reinspeção e RLS. O teste de armazenamento usa o stub de metadados do banco descartável.

No navegador local foram exercitados busca pelo alias SA 05, gravação e recarga, B14 por toque, conclusão, geração PDF, consulta da revisão congelada e roteiro de altura. O ajuste responsivo foi inspecionado em janelas equivalentes a celular, tablet e desktop. O banco de teste usa um roteiro reduzido para os estados de interação, e os 16 blocos foram observados no protótipo de referência.

A migração remota depende de acesso ao projeto Nexus no conector Lovable. As contas disponíveis retornaram `project_not_found`. O manifesto registra também as quatro migrações PET já presentes no repositório, em ordem, sem alterar seus arquivos. Antes de executar no remoto, confronte o ledger e a trilha Drizzle para evitar reaplicar migrações já executadas pelo Lovable.
