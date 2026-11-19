# Acervo de Cruz Alta

## Cadastro e migrações

A cena `tres-tentos-cruz-alta` corresponde à organização `abab473b-8baa-4781-aed2-c1243338af65`, ao cliente `c3d779b6-c407-8ab4-8545-6bdfd6068013` e à unidade `a9f6603b-6497-8e9e-822a-dfc860510c1a`. O catálogo de elementos contém 1 unidade, 7 setores, 56 estruturas, 74 componentes e 75 itens LVHF, incluindo o 29.2 retirado. A restrição da cena verifica essa tripla.

| Migração | Posição do ledger | Conteúdo | SHA-256 do SQL |
| --- | --- | --- | --- |
| 0080 | 104 | Acervo contextual, intenções de envio, proveniência, delegações de leitura, inventários privados e erratas editoriais | `d6a4cb45ff8b79e544725006be73e17e4886dd2934f1ee92406d75996be64e6d` |
| 0081 | 105 | Catálogo de identidades e hierarquia | `93b4a5c4581e05d2bb22ad45819d35bb375bff75abf1f99b6ce3476ed0c6e664` |
| 0082 | 106 | Fotografia original com data interna desconhecida, nota de evidência e autoria da inclusão | `cd8f0840b477d6dfd3d986cd6ecf04be60e2d0c6c0824a61c1c531ce7a1fdc86` |
| 0083 | 107 | Conjuntos dos descendentes na ficha da estrutura e conferência de proveniência pelo inventário no servidor | `cccfc0840b1dc60eeb825e4f4139e1c06c8e23290b1f6e0d0ec07d218940f4e1` |
| 0084 | 108 | Conflito editorial HTTP 409 na gravação de ficha, metadados e revisão | `19af09c17012112a1d2bfd90e18eac6463d217303bda6708105a5e682ff0369e` |

O conector Lovable confirmou as cinco migrações no banco do Nexus em 19/11/2026. O ledger registrou 0080 às 00h38min57s, 0081 às 00h39min56s, 0082 às 00h44min22s, 0083 às 00h50min56s e 0084 às 01h25min20s, horário de Brasília. A aplicação direta usou o envelope do repositório, que confere o prefixo completo do ledger, serializa com o deploy e grava o checksum na mesma transação da alteração.

## Leitura e publicação

Cada chave do manifesto resolve um `nr_locais.id` por `nr_cena_objetos`. O provisionamento dos locais exige sessão editora e registra o usuário real em `nr_historico`. Uma nova execução acrescenta somente identidades ainda ausentes. A ficha permite editar título, descrição, observações e dimensões. Cada dimensão guarda valor numérico ou desconhecido, unidade de medida, fonte e grau de confirmação. A comparação de versão impede que uma sessão sobrescreva uma alteração feita em outra.

Os documentos e as revisões usam `nr_documentos` e `nr_documento_revisoes`. A revisão atual aponta para um registro específico. O título e a descrição de exibição comportam errata editorial auditada. O carimbo, o snapshot e os bytes originais permanecem acessíveis pelo ID da revisão histórica. `nr_cena_documentos` registra o vínculo lógico e sua finalidade. `nr_arquivo_vinculos` identifica os bytes de cada revisão. Arquivos compartilhados são reutilizados dentro da mesma organização, cliente e unidade. Retirar o vínculo lógico de um objeto preserva o acesso pelos demais destinos autorizados.

O leitor exige sessão e revalida a associação exata entre objeto, documento, revisão e arquivo. A URL expira em 60 segundos. O acesso NR legado conserva o alcance organizacional definido por `pode('ver_nr')`. Para membros sem esse papel, uma entrada explícita em `nr_cena_consultores` habilita a ficha apenas da unidade concedida. A opção `permite_original` autoriza a prévia que precisa ler os bytes originais. O acesso às tabelas internas, ao inventário de importação e à listagem direta do bucket continua sujeito a suas políticas. Revogar a delegação impede novas leituras.

A preparação reserva o caminho físico no bucket privado `nexus-nr-acervo`. A transferência aceita os tipos do bucket, com teto de 50 MiB. O servidor confere os bytes, sua assinatura, tamanho e SHA-256. A publicação grava arquivo verificado, revisão, vínculos, histórico e recibo em uma transação. A mesma intenção recupera o resultado já confirmado. Uma transferência inválida é retirada antes da remoção no Storage. Sua retomada recebe outro caminho, protegendo a nova cópia contra uma limpeza atrasada. Um envio interrompido com conteúdo válido continua associado à intenção do autor e pode ser retomado.

O inventário de fontes fica em tabela privada. Uma nova leitura da pasta gera outro snapshot quando o conteúdo muda. Alterar a ordem dos mesmos registros não gera cópia. Uma origem externa associada a novo hash requer conferência do documento lógico e da revisão vigente. Pranchas usam a data técnica informada. Fotografias importadas sem data interna podem registrar `NULL` com o rótulo editorial “Original”. A data de inclusão e a nota sobre o detalhe sustentado pela imagem são campos distintos.

## Verificação local

O cenário `tests/db/cruz-alta-acervo.mjs` cria uma base descartável de PostgreSQL 17.11 no loopback. Aplica as 103 migrações anteriores, cria o cadastro de teste e executa duas vezes os envelopes 0080–0083. O runner posterior encontra zero migrações pendentes. O cenário utiliza usuários, documentos e observações de teste, sessões distintas e as funções de banco usadas pela aplicação. O Storage do cenário de banco contém metadados de teste. A transferência de binários em Storage real requer o teste da aplicação conectada.

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
| Conjunto ligado a dois descendentes | Uma entrada na ficha da estrutura, com as duas origens e a revisão comum |
| Correção editorial concorrente | A errata aparece nos dois itens e o número de revisões técnicas permanece igual |
| Fotografia sem data interna | Data técnica desconhecida, nota, autor e data de inclusão presentes |
| Revogação de original e de consulta | Nova emissão de prévia bloqueada, tabelas e Storage protegidos |
| Membro de outra unidade e link direto incorreto | Acesso negado |
| Desvinculação | Outros vínculos, auditoria e revisões preservados |

Passaram 14 cenários do acervo, 48 verificações de vínculos contextuais NR, 30 do mapa/PET da Cotrirosa e 12 do manifesto e contrato do gerador de tipos.

## Importação de conferência com os originais

A árvore recursiva do Drive continha 103 arquivos. O anexo da revisão 43 foi conferido à parte. O validador binário utilizado pela aplicação (`validarBinarioNr`) verificou assinatura MIME, tamanho e SHA-256 de 88 PDFs, 11 JPEGs e 4 PNGs, totalizando 1.141.539.587 bytes. O vídeo de 679.370.492 bytes ficou no inventário privado como pendência de representação. O bucket NR admite até 52.428.800 bytes por original e não habilita MP4.

Em PostgreSQL descartável com todas as migrações, os metadados desses originais passaram pelas RPCs de preparação, verificação, publicação e vínculo da aplicação. Ao final da primeira passagem havia **103 arquivos físicos identificados, 102 documentos lógicos, 103 revisões e 124 vínculos ativos**. A segunda passagem reencontrou as 103 revisões e conservou todas as contagens. A verificação dos bytes foi feita no disco local. A confirmação no banco usou os metadados do Storage de teste.

A ficha 28.1 devolveu a individual na revisão 02 e o conjunto Preparação na 01. As fichas 11 e 56 abriram o mesmo documento de conjunto na revisão 01 e suas individuais nas revisões 11 e 06, respectivamente. A ficha da unidade reuniu as revisões 56 e 43 do layout. A ficha histórica 29.2 manteve sua individual na revisão 03. O relatório por fonte, incluindo as identidades externas, fica fora do Git.

### Prévia conectada e armazenamento real

Na prévia do Lovable, a sessão de Diego cadastrou as 213 entidades e conciliou os 104 registros de origem. A primeira passagem confirmou 103 conteúdos, 124 vínculos e 103 revisões publicadas. A repetição pela mesma interface informou 103 revisões já existentes, zero publicações e a mesma pendência do vídeo. O catálogo PostgreSQL confirmou 103 arquivos vinculados, 102 documentos lógicos, 103 revisões e 124 vínculos ativos antes dos testes editoriais.

Na ficha 28.1, a individual abriu no leitor autenticado na revisão 02, datada de 12/11/2026, página 1 de 2. Fechar o leitor devolveu a ficha 28.1 com as seções de componente e conjunto. O editor salvou uma observação e publicou um PDF identificado como teste. Pelos componentes 11 e 56, vinculou o mesmo documento de teste como desenho de conjunto. A revisão 02 foi publicada a partir do 11. A consulta pelo acervo do 56 mostrou a revisão 02 vigente e a 01 histórica. O leitor renderizou a página do original histórico. Depois de sair da sessão, o link direto solicitou login e devolveu a mesma página do PDF, objeto e revisão. A observação e o anexo reapareceram na ficha 28.1.

O teste criou um documento lógico adicional, dois arquivos com conteúdos diferentes, duas revisões e três vínculos. O banco confirmou o mesmo autor de sessão nas duas revisões. Os originais importados conservaram seus históricos. O teste com um segundo perfil de consulta e o caso de interrupção entre Storage e banco estão documentados nos cenários de PostgreSQL acima.

Na prévia conectada, duas abas iniciaram a edição da mesma versão da ficha 28.1. A primeira gravou a observação. Na segunda, o rascunho local continuou no formulário enquanto a ficha mostrou a versão 3 do servidor, a observação já gravada e o controle de conciliação. O teste revelou inicialmente uma repetição do erro transitório pelo transporte. A migração 0084 passou a distinguir esse conflito editorial com HTTP 409, e o ensaio foi repetido com sucesso. O catálogo confirmou o sinal nas três funções e a posição 108 do ledger.
