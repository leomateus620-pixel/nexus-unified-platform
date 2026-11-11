# Concluir migração 0067 (posição 90) em uma única entrega

Situação: ledger reconciliado até a posição 89; envelope de 0067 já gerado com as ferramentas do Nexus (66.734 caracteres); tabela de coleta ainda não existe.

## Execução (uma só passada)
1. Enviar o envelope `DO` gerado, inteiro, em uma única chamada à ferramenta de dados (que já aceitou bloco `DO`). Ele valida o ledger 1–89, aplica o SQL e registra a posição 90 juntos; qualquer erro desfaz tudo.
2. Em timeout/erro, consultar ledger e catálogo antes de qualquer nova tentativa (sem reenviar às cegas).
3. Prova de fidelidade (cobre o risco de cópia): para cada função criada pela 0067, comparar o corpo gravado no banco com o texto do arquivo original, por hash. Divergência = relatar e corrigir na mesma entrega com `CREATE OR REPLACE` do texto exato.
4. Verificações finais (somente leitura): posição 90 com checksum da5e135d…; `nr_coleta_revisoes` com RLS ativa e sem acesso direto; privilégios das funções de coleta; gatilhos de proteção dos relatórios; `nr_coleta_pdf_preparar` só para `service_role`; bucket `nexus-nr-acervo` privado.
5. Comprovante final único: projeto, commit, posições 86–90, horário UTC, checksum e resultado de cada verificação.

Sem criar levantamentos, PETs ou arquivos de teste; sem publicar.
