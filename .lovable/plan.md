# Auditoria somente leitura — recuperação da UI NR após PR19

Nada foi alterado. Leituras feitas em 30/10/2026, cerca de 23:50 UTC.

## 1. Projeto e ledger
- O banco é o do projeto `yhtgijtllvgzoqtfcgal` (Lovable Cloud).
- Ledger `nexus_migrations.applied`: **66 entradas**.
  - pos 63 `drizzle/migrations/0044_nr_publicacao_tecnica.sql`, sha256 `c0920137…d8bf`, 20:54:32 UTC
  - pos 64 `0045_nr_historico_paginado.sql`, sha256 `c237f3b7…2a47`, 20:54:39 UTC
  - **pos 65** `drizzle/migrations/0046_nr_fluxos_completos.sql`, sha256 `7505bb32fcb3e4101b48d5525b0345fdd799da1404a7bf4b551939d903279cfa`, 22:42:49 UTC, origin `applied`
  - **pos 66** `drizzle/migrations/0047_nr_fila_importacao.sql`, sha256 `16b1d71bd71a483962a2b2494bc56b0e5d1d6da9f02d7253ff077a57044bae02`, 22:43:02 UTC, origin `applied`
- Os sha256 dos arquivos em disco são **idênticos** aos registrados no ledger para 0046 e 0047.
- Ledgers secundários, para referência: `supabase_migrations.schema_migrations` tem 18 entradas e `drizzle.__drizzle_migrations` tem 12 (até 0011). Nenhum dos dois é o ledger NR.

## 2. Contagens atuais
| Tabela | Linhas |
|---|---|
| clientes | 6 |
| unidades | 4 |
| nr_locais | 112 |
| nr_levantamentos | 112 |
| nr_respostas | 8.685 |
| levantamento_avaliacoes | 0 |
| nr_pastas | 60 |
| nr_documentos | 969 |
| nr_pendencias | 80 |

Bucket `nexus-nr-acervo`: privado, limite de 52.428.800 bytes (50 MiB) por arquivo, **1.022 objetos / 291.872.274 bytes**.

## 3. nr_locais.dados — COTRIROSA, Fábrica de Ração — Santa Rosa
Locais encontrados:
- EC 01 `dd9917a1-…85ee` (Silo de carregamento SC-01)
- EC 13 `846f8a66-…a538` (Silo dosador SD 03)
- EC 28 `c640b3bd-…c0e3` (Silo externo SA 05)

**Câmera EC01: não encontrada.** Existe um único `EC 01` em todas as unidades. Nenhum título, unidade ou conteúdo tem "câmara/câmera" junto da tag EC01. É preciso informar o identificador correto.

Os três locais têm as mesmas chaves de primeiro nível: aberturas, acesso, ancoragens, arquivos_recebidos, atividades, cadastro, calculo, calculo_fixo, cobertura, confianca_levantamento, descricao, enquadramento, familia, fotos, geometria, historico, id, itens, levantamento, nome, processo, resgate, setor, tag, tag_campo, tipo, unidade_id, ventilacao, ventilacao_fixa.

- **historico**: lista de `{acao, data, autor}`. Tamanhos: EC01 = 7, EC13 = 6, EC28 = 9. Exemplo: `{data:"2026-10-11", acao:"Ancoragens, linhas de vida e laudos … Bloco B16 registrado…"}`.
- **fotos**: lista de `{arquivo, autor, data, legenda, miniatura, origem}`, todos texto. Tamanhos: 3, 3 e 4. `origem` = "Levantamento técnico em campo — acervo fotográfico da unidade".
- **geometria**: objeto com altura, comprimento, largura, diametro, forma, metodo, deducoes[], fonte_volume, volume, volume_documento, volume_informado, volume_placa, validacao, nota_validacao, autor, data. EC28 tem também `altura_cone`. Exemplo EC01: forma `cilindrica`, diâmetro 2.4, altura 7.5, volume 33.93, volume_documento 135.72, volume_placa 22, validacao `validada`.
- **resgate**: objeto com ancoragem, cenario, funcoes, metodo, rota, simulado, sistema, tempo_resposta, validacao e autor (texto), mais equipamentos (lista). EC01: validacao `validada`.
- **calculo**: `{volume, volume_bruto, deducoes, Q, n, N, t_um_volume, t_N_volumes, conclusao, bloqueios}`.
- **ventilacao**: `{equipamento, quantidade, vazao_nominal, vazao_efetiva, dutos, criterio_n, criterio_N, tempo_placa, tempo_placa_texto, tempo_memorial_min, placa_instalada_em, observacao, validacao, autor, aprovador}`.
- **levantamento**: `{modelo:"MLT-EC-R00", situacao:"concluido", blocos_ok:[B01…B16], bloco, iniciado_em, concluido_em, atualizado_em, fonte, autor, aprovador}`.
- **arquivos_recebidos**: lista de `{formato, grupo, nome, url}`. Os valores de url não foram lidos.
- **avaliações**: não há chave `avaliacoes` em `dados`, e a tabela `levantamento_avaliacoes` está vazia (0 linhas).

## 4. nr_modelos MLT-EC-R00, versão 2
- Modelo `e13a236b-…6861c78b`, tipo `levantamento`. A versão 1 (`6b5ad619-…`) é outro modelo e tem 0 blocos.
- Chaves de `dados`: id, nome, versao (2), escopo, origem, regras, aplicacao, nota_versao, total_campos (104), atualizado_em, blocos, blocos_origem, familias_ventilacao_fixa.
- **16 blocos**, cada um `{id, codigo, secao, titulo, instrucao?, campos[]}`. B09 tem `aplica_se` e B14 tem `tipo_bloco`. A soma dos campos dá **104**, igual a `total_campos`.
  - B01 Identificação: 7 campos
  - B02 Enquadramento: 8
  - B03 Acessos: 2
  - B04 Fotos: 3
  - B05 Sinalização: 3
  - B06 Atividades/riscos: 3
  - B07 Geometria/volume: 16
  - B08 Ventilação: 8
  - B09 Ventilação fixa/aeração: 29
  - B10 Requisitos/EPI: 3
  - B11 Resgate: 7
  - B12 Emergência: 3
  - B13 Bloqueio de energias: 3
  - B14 Adequações: 1
  - B15 Histórico/fechamento: 3
  - B16 Ancoragens/laudos: 5
- Propriedades presentes nos campos: id, id_origem, nome, rotulo, tipo, tipo_origem, obrigatorio, destino, legenda, placeholder, ajuda, opcoes, rotulos_opcoes, colunas, subcampos, dimensoes, formula, mostrar_se, foto_obrigatoria_se, gera_pendencia_se, solucao_se, rotulo_adicionar, vazio.
- Exemplo (B01, primeiro campo): `{id:"B01.foto_placa", id_origem:"foto_placa", nome/rotulo:"Foto da placa de identificação", tipo:"foto", tipo_origem:"foto", destino:"fotos", legenda:"Placa de identificação", obrigatorio:true}`.

## 5. Versão publicada
- Último commit do projeto: `f32db5d1e297c9e6f9add8fd79c56965340f023a` (merge da PR #19, 30/10/2026 20:40 −03).
- **Não há evidência de deploy acessível por aqui.** Não existe ferramenta para ler o estado nem o SHA do deployment publicado. Esse é o último commit, não uma versão publicada confirmada.

## Limitações
- Câmera EC01 não foi localizada (ver seção 3).
- Os valores de url, autor e aprovador foram omitidos de propósito; aparecem só os tipos.
- O registro de deploy publicado não pode ser verificado.

## Próximo passo proposto (depende de aprovação)
Recuperar a UI NR para ler esses shapes. Essa etapa fica para depois, mediante nova autorização. Nada será editado sem ela.
