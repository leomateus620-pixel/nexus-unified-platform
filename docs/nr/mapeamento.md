# Mapeamento e evidência de migração

Esta matriz descreve transformação; o de-para completo por UUID, payload e decisão fica no staging privado. Nenhum nome, TAG ou nome de arquivo funciona como chave global.

| Origem | Destino | Transformação | Evidência e resultado |
|---|---|---|---|
| Cliente e CNPJ | `clientes` | Reuso por CNPJ canônico confirmado; novo registro somente sem correspondência conflitante | ID da origem, hash, decisão do RPC e UUID persistido |
| Unidade, inclusive sem locais | `unidades` | Preserva relação de cliente, nome e campos de origem | ID próprio; documentos/pendências independem da existência de local |
| Local | `nr_locais` | Chave externa unidade/ID; TAG textual, zeros, espaços e sufixos preservados; nomes anteriores em aliases | Fonte privada integral, UUID e relacionamento confirmado |
| EC operacional | `pet_espacos` + vínculo do local | Integra somente classificação EC confirmada; local ALTURA conserva ausência de vínculo PET | Decisão explícita do importador, sem similaridade de nome |
| Avaliações por família | `nr_sistemas.dados` | Preserva cinco eixos e justificativas; cada linha é uma avaliação, sem inferir equipamento instalado; código técnico não vira código/preço comercial | Local/família identificados na origem; validação Nexus pendente |
| Roteiro, blocos e campos | `nr_modelos` e versões | Mantém IDs de origem, versão, destinos e condições; respostas por caminho versionado | Estrutura efetivamente exposta, inclusive roteiros históricos com 15/16 blocos |
| Levantamento e respostas | `nr_levantamentos` | Respostas extensíveis separadas do snapshot bruto; modelo fixado | Local explícito, autor histórico e hash; ausência não vira reprovação |
| Famílias, regras e critérios | `nr_modelos` por tipo | Códigos/textos/escopos preservados; sem ativação automática de regra/critério | Fonte e snapshot; revisão normativa profissional pendente |
| Registro documental | `nr_documentos` | Documento lógico por unidade/ID; tipo, origem e estado histórico separados do recebimento | Associação local somente por ID; norma inicial inferida fica rotulada quando não explícita |
| Revisão e snapshot | `nr_documento_revisoes` | Número/vigência/estado de origem e conteúdo preservados; conversão de valores para blocos nativos sem fabricar arquivo | Hash do payload, data/autoria histórica; `emitido_origem` não aprova no Nexus |
| Word/PDF/foto | `nr_arquivos` | Bytes originais, MIME detectado, extensão, tamanho e SHA-256 | Preparação não conta como confirmação; validação de bytes e Storage são independentes |
| Mesmo original em vários contextos documentais | `nr_arquivo_vinculos` | Relação explícita por arquivo/documento/revisão/local/pasta com evidência | Sem ligação por TAG; uma identidade física mantém vários vínculos autorizados |
| Pasta enumerada | `nr_pastas` | ID estável e relação pai conhecida; ancestrais não expostos permanecem desconhecidos | Enumeração oficial, paginação/arestas; nomes parecidos não provam hierarquia |
| Pendência aberta ou encerrada | `nr_pendencias` e tratativas | Preserva texto, criticidade desconhecida como `a_classificar`, desfecho e autoria | Encerramento histórico não cria aprovação eletrônica |
| Log histórico | `nr_historico` / fonte privada | UUID determinístico posição+hash no escopo da organização/origem | Data textual original preservada sem inferir fuso; executor e autor histórico distintos |
| Referência sem bytes | item/fonte privada | Conserva vínculo e motivo terminal indisponível/conflito/sem correspondência | Nunca contado como arquivo migrado |
| Revisão Drive histórica sem acesso aos bytes | fonte e item `versao_arquivo` | Metadados/ID preservados, `indisponivel`; arquivo atual conciliado separadamente | Política oficial/erro observado, sem alterar retenção ou reconstruir original |

Uma conversão DOCX suportada cria outro documento editável com arquivo original, documento e revisão de origem explicitamente referenciados. Se houver vários vínculos históricos sem relação única, o conversor exige seleção/conciliação; não escolhe pelo nome. Títulos, parágrafos, tabelas e imagens raster compatíveis são preservados na estrutura; layout, mesclagem, notas e outros recursos não suportados produzem aviso. O original permanece disponível.

Revisão superada com descrição textual de substituição, mas sem ID alvo, conserva a descrição e a associação não confirmada. Não se inventa `substituido_por` relacional. Conflitos de TAG/nomes são preservados no de-para privado com evidência e decisão explícita.
