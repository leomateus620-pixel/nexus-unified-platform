# Acervo de Cruz Alta

## Cadastro e migrações

A cena `tres-tentos-cruz-alta` corresponde à organização `abab473b-8baa-4781-aed2-c1243338af65`, ao cliente `c3d779b6-c407-8ab4-8545-6bdfd6068013` e à unidade `a9f6603b-6497-8e9e-822a-dfc860510c1a`. O catálogo de elementos contém 1 unidade, 7 setores, 56 estruturas, 74 componentes e 75 itens LVHF, incluindo o 29.2 retirado. A restrição da cena verifica essa tripla.

| Migração | Posição do ledger | Conteúdo | SHA-256 do SQL |
| --- | --- | --- | --- |
| 0080 | 104 | Acervo contextual, intenções de envio, proveniência, delegações de leitura, inventários privados e erratas editoriais | `d6a4cb45ff8b79e544725006be73e17e4886dd2934f1ee92406d75996be64e6d` |
| 0081 | 105 | Catálogo de identidades e hierarquia | `93b4a5c4581e05d2bb22ad45819d35bb375bff75abf1f99b6ce3476ed0c6e664` |
| 0082 | 106 | Fotografia original com data interna desconhecida, nota de evidência e autoria da inclusão | `cd8f0840b477d6dfd3d986cd6ecf04be60e2d0c6c0824a61c1c531ce7a1fdc86` |

O conector Lovable confirmou 0080 e 0081 no banco do Nexus em 19/11/2026 às 00h38min57s e 00h39min56s, horário de Brasília. A aplicação direta usou o envelope do repositório, que confere o prefixo completo do ledger, serializa com o deploy e grava o checksum na mesma transação da alteração.

## Leitura e publicação

Cada chave do manifesto resolve um `nr_locais.id` por `nr_cena_objetos`. O provisionamento dos locais exige sessão editora e registra o usuário real em `nr_historico`. Uma nova execução acrescenta somente identidades ainda ausentes. A ficha permite editar título, descrição, observações e dimensões. Cada dimensão guarda valor numérico ou desconhecido, unidade de medida, fonte e grau de confirmação. A comparação de versão impede que uma sessão sobrescreva uma alteração feita em outra.

Os documentos e as revisões usam `nr_documentos` e `nr_documento_revisoes`. A revisão atual aponta para um registro específico. O título e a descrição de exibição comportam errata editorial auditada. O carimbo, o snapshot e os bytes originais permanecem acessíveis pelo ID da revisão histórica. `nr_cena_documentos` registra o vínculo lógico e sua finalidade. `nr_arquivo_vinculos` identifica os bytes de cada revisão. Arquivos compartilhados são reutilizados dentro da mesma organização, cliente e unidade. Retirar o vínculo lógico de um objeto preserva o acesso pelos demais destinos autorizados.

O leitor exige sessão e revalida a associação exata entre objeto, documento, revisão e arquivo. A URL expira em 60 segundos. O acesso NR legado conserva o alcance organizacional definido por `pode('ver_nr')`. Para membros sem esse papel, uma entrada explícita em `nr_cena_consultores` habilita a ficha apenas da unidade concedida. A opção `permite_original` autoriza a prévia que precisa ler os bytes originais. O acesso às tabelas internas, ao inventário de importação e à listagem direta do bucket continua sujeito a suas políticas. Revogar a delegação impede novas leituras.

A preparação reserva o caminho físico no bucket privado `nexus-nr-acervo`. A transferência aceita os tipos do bucket, com teto de 50 MiB. O servidor confere os bytes, sua assinatura, tamanho e SHA-256. A publicação grava arquivo verificado, revisão, vínculos, histórico e recibo em uma transação. A mesma intenção recupera o resultado já confirmado. Uma transferência inválida é retirada antes da remoção no Storage. Sua retomada recebe outro caminho, protegendo a nova cópia contra uma limpeza atrasada. Um envio interrompido com conteúdo válido continua associado à intenção do autor e pode ser retomado.

O inventário de fontes fica em tabela privada. Uma nova leitura da pasta gera outro snapshot quando o conteúdo muda. Alterar a ordem dos mesmos registros não gera cópia. Uma origem externa associada a novo hash requer conferência do documento lógico e da revisão vigente. Pranchas usam a data técnica informada. Fotografias importadas sem data interna podem registrar `NULL` com o rótulo editorial “Original”. A data de inclusão e a nota sobre o detalhe sustentado pela imagem são campos distintos.

## Verificação local

O cenário `tests/db/cruz-alta-acervo.mjs` cria uma base descartável de PostgreSQL 17.11 no loopback. Aplica as 103 migrações anteriores, cria o cadastro de teste e executa duas vezes os envelopes 0080–0082. O runner posterior encontra zero migrações pendentes. O cenário utiliza usuários, documentos e observações de teste, sessões distintas e as funções de banco usadas pela aplicação. O Storage do cenário de banco contém metadados de teste. A transferência de binários em Storage real requer o teste da aplicação conectada.

| Cenário | Resultado local |
| --- | --- |
| Instalação, repetição pelo conector e deploy posterior | Ledger coerente, cena legada preservada |
| Cadastro das 213 identidades em duas chamadas | Zero locais adicionais na repetição |
| Inventário em duas ordens de enumeração | Mesmo snapshot e conjunto de fontes |
| Edição concorrente de ficha | Segunda conexão recebe conflito e a observação original permanece legível |
| Descarte e retomada de transferência inválida | Novo caminho e mesma operação |
| Falha entre envio e publicação | Zero documentos visíveis antes da confirmação e recibo estável na repetição |
| Preparos simultâneos com o mesmo conteúdo | Um arquivo físico reservado |
| Folha de conjunto em dois objetos e duas revisões | A mesma revisão vigente nos dois itens e leitura da revisão anterior |
| Correção editorial concorrente | A errata aparece nos dois itens e o número de revisões técnicas permanece igual |
| Fotografia sem data interna | Data técnica desconhecida, nota, autor e data de inclusão presentes |
| Revogação de original e de consulta | Nova emissão de prévia bloqueada, tabelas e Storage protegidos |
| Membro de outra unidade e link direto incorreto | Acesso negado |
| Desvinculação | Outros vínculos, auditoria e revisões preservados |

Passaram 13 cenários do acervo, 48 verificações de vínculos contextuais NR, 30 do mapa/PET da Cotrirosa e 12 do manifesto e contrato do gerador de tipos.
