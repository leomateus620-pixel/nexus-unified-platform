# Publicação técnica interna de regras e critérios

A migração aditiva `0044_nr_publicacao_tecnica.sql` oferece publicação versionada pela interface para modelos dos tipos regra e critério. É uma declaração de revisão interna registrada por pessoa responsável; não certifica habilitação externa, licença ou conformidade, não assina/emite documentos ou PETs e não aplica critérios automaticamente a locais.

As 15 regras/critérios migrados continuam em rascunho, sem publicação automática. Criar ou editar conteúdo permanece uma ação de configuração; publicar exige também revisão e o mecanismo profissional existente `lev_profissional`: pessoa ativa vinculada ao usuário, registro profissional declarado e permissão operacional de revisão. Ser administrador do software não satisfaz esse vínculo por si só.

## Evidências necessárias

O responsável informa motivo, escopo, exceções, data do confronto e declaração explícita de revisão. Cada norma do modelo exige referência oficial própria, com título, versão, data da fonte, consulta e texto de confronto. Datas devem respeitar fonte ≤ consulta ≤ confronto ≤ data UTC atual.

URLs oficiais são restritas às páginas correspondentes do Ministério do Trabalho e Emprego para [NR-33](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-33-nr-33) e [NR-35](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35), ou aos PDFs da NR correspondente nos diretórios MTE reconhecidos. Não basta um endereço HTTPS genérico; parâmetros de rastreamento/URLs temporárias não são aceitos. A validação do endereço não substitui a leitura e o confronto declarados pelo profissional.

Referência licenciada só é exigida quando efetivamente usada. Nesse caso, requer arquivo privado confirmado, declaração de autorização de uso e sua referência/evidência. Nenhum conteúdo de norma indisponível ou licença é inventado. Arquivos precisam pertencer à organização e, quando o modelo tiver cliente/unidade, ao mesmo contexto. Modelos globais podem citar arquivo autorizado com seu contexto explicitamente preservado; não se cria cliente ou unidade fictício para uma norma.

## Autoridade, histórico e retenção

A publicação passa por RPC dedicada com autenticação, versão esperada e chave idempotente. O servidor determina pessoa responsável e executor; não confia em flags editáveis de `dados`. A tabela relacional `nr_modelo_publicacao_fontes` conserva versão, fontes, datas, confronto, declarações e UUID/hash/contexto dos arquivos. Tem FKs de organização, RLS, leitura autorizada e bloqueio de alteração/exclusão.

`nr_modelo_versoes` conserva conteúdo e snapshot imutáveis, incluindo escopo, normas, contexto, declaração e nome/registro profissional declarados no momento. A consulta de disponibilidade usa permissões e pessoa atuais; uma revogação impede nova publicação, preservando o histórico anterior. Fonte/qualificação declaradas não são apresentadas como verificação externa.

Modelos publicados exigem nova edição antes de modificar conteúdo. A publicação posterior cria outro número de versão. Mudança genérica de tipo de regra/critério, flag de aprovação ou ativação automática não contorna o fluxo; o bloqueio genérico anterior de publicação normativa permanece. Os comandos dedicados não ampliam poderes de aprovação, emissão ou assinatura documental/PET.

Arquivos referenciados por qualquer versão técnica publicada ficam retidos, inclusive após nova edição ou arquivamento do modelo. Publicação e arquivamento serializam pelo lock do arquivo: publicar não aceita fonte já arquivada; arquivar não oculta fonte que acabou de ser publicada. A exclusão física genérica continua indisponível.

O contexto inicial da publicação entrega resumo limitado de versões/fontes. Conteúdo e provas completas são lidos sob demanda no histórico, evitando carregar o acervo inteiro para decidir se um botão está disponível.

## Verificação

`tests/db/nr-publicacao-tecnica.mjs` usa exclusivamente PostgreSQL descartável. As 46 verificações cobrem pessoa responsável real no mecanismo do projeto, administrador sem vínculo, organização/papel indevidos, fontes oficiais por norma, datas, referências licenciadas, bytes/contexto, flags forjadas, troca de tipo, versão esperada, repetição, histórico imutável, revogação e duas corridas de publicação/arquivamento. Não se publicam critérios de teste ou fontes normativas fictícias em produção.
