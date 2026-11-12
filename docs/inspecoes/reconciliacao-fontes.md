# Reconciliação das fontes de Inspeções

## Concluído

O histórico parte de `base-completa-2026-11-01/db.json` do pacote fornecido, SHA-256 `343bcc56f1a0f436e1bf1b1dcf5ef1b1ecf739bf9d25e161c4a4aba4d34f41ea`. A base de exemplo pertence aos testes do protótipo. O plano mantém os oito clientes operacionais, 18 documentos (15 emitidos na origem e três recebidos), 835 ativos, 844 inspeções históricas, 300 pendências, oito lotes históricos, 13 avisos e 26 tentativas simuladas. A consulta de ativos vigentes e existentes devolve 761. Há outros 20 ativos existentes fora de vigência e 54 marcados como inexistentes. A planta contém 149 vínculos, sendo 104 PAC e 45 PAL.

O catálogo inclui 27 serviços, as 20 definições da ficha, seis tipos, cinco pacotes, uma matriz, 13 famílias com 144 itens de checklist e oito itens T6, 64 regras, 45 parâmetros, nove textos e EQ-01. O estado aprovado se aplica à R64 na fonte. Os estados propostos e os campos a definir permanecem como dados da origem. Os 24 eventos do registro global conservam autoria e data declaradas. O cliente de exemplo e os três locais cadastrais permanecem no staging. Os textos de setor e localização continuam nos ativos, com seus IDs de origem e sem geração de novos cadastros de local.

A leitura canônica da organização Nexus encontrou seis clientes, nenhum com correspondência de nome normalizado ou documento fiscal entre os oito do pacote. Foram criados oito clientes e oito unidades canônicos, com mapeamento explícito e verificação de duplicidade. Onde a origem informa só o CNPJ da unidade, o identificador permanece associado à unidade no snapshot. Os campos de contato dos oito clientes e unidades vieram em branco. Destinatários de avisos simulados permanecem no histórico de simulação. Nenhum logotipo de cliente foi confirmado no pacote.

O importador conserva o snapshot e registra lote, bloco, item, hash, resultado e destino. Uma nova versão que diverge do registro já projetado fica disponível para conciliação no staging e mantém o destino original. No PostgreSQL do projeto Nexus, o conector Lovable confirmou a conclusão dos 18 blocos, zero conflitos, oito contextos, 835 ativos, 761 vigentes e existentes, 18 documentos, 844 inspeções e 3.392 relações. No ensaio local em PostgreSQL 17, a reaplicação conservou 835 ativos, uma nova versão divergente ficou em conciliação e uma sessão autenticada sem atribuição técnica foi rejeitada.

### Publicação e pacote

Em 12/11/2026 às 15:28 BRT, o [exportador da publicação](https://nexus-inspecoes.pplx.app/port/5100/api/insp/exportar) devolveu as mesmas contagens das coleções. Os arquivos `insp.js`, `base.css`, `style.css` e `insp.css` corresponderam byte a byte ao pacote.

| Campo comparado      | Diferença na publicação                                                                                             | Conciliação                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Metadados e contexto | `meta.atualizado_em` em 11/11. Exportador inclui formato e horário. Cliente e unidade globais selecionados diferem. | Usar o snapshot de 01/11 como versão histórica. A seleção global da origem fica no staging.                                  |
| FUNDIMISA C1         | Nome de arquivo, referência da importação e primeiro evento no histórico.                                           | Preservar a referência de 01/11. Confirmar qualquer renomeação por bytes e MD5 da origem antes de anexar.                    |
| Giovelli G1/G2       | Nome e identificador do emitente de terceiro nos dois documentos e seções extraídas em G1.                          | Manter a versão redigida fornecida no pacote. A versão publicada requer conferência de origem antes de eventual atualização. |
| Inspeções            | Campo `inspetor` de 156 registros.                                                                                  | Conservar autoria do snapshot. A diferença da publicação foi registrada para revisão.                                        |
| Avisos               | Campo `envios` em um aviso. Ambas as fontes contêm 26 tentativas.                                                   | Conservar histórico de simulação da versão do pacote.                                                                        |

## Arquivos conciliados

O Storage privado do projeto confirmou 22 vínculos com binário, incluindo o original Otmar R00, seis fotos, certificados de EQ-01, ART, projeto, fabricante, modelos, configuração, piloto DOCX/PDF e pranchas A3. O original R00 foi confrontado com o MD5 de origem. A releitura dos 34 objetos confirmou 38.490.920 bytes, seus tipos MIME e SHA-256, incluindo 12 representações WebP de 384 e 768 pixels nas dimensões máximas. O certificado tem vínculos tanto no registro EQ-01 quanto no laudo. As seis fotos pertencem ao laudo da obra e usam a legenda de origem “Teste de carga com dinamômetro.”. A fonte não individualiza as TAGs fotografadas.

O manifesto de transferência discrimina os estados de cada documento. O original só passa a verificado com leitura posterior do Storage e conferência de tamanho, MIME e SHA-256. As autorizações temporárias de transferência foram revogadas e o Storage negou uma leitura sem autenticação após a revogação. Os anexos do piloto são identificados pela função e o piloto fica como saída histórica de teste.

## Originais pendentes

O pacote contém snapshots textuais dos documentos abaixo. Nenhum candidato encontrado na verificação de 1.150 PDFs em Downloads, Desktop e Documents correspondeu ao MD5 dessas referências. A publicação devolveu HTTP 403 nas 34 consultas aos dois caminhos de arquivos para os 17 documentos. A busca no Google Drive conectado por nomes exatos e termos relacionados também não retornou os arquivos. O nome do arquivo e o conteúdo extraído permanecem consultáveis no registro histórico.

| Cliente           | Documentos com original pendente                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGCO              | `DI-agco-santa-rosa-A1`, `DI-agco-santa-rosa-A2`                                                                                                               |
| Cambaí Sementes   | `DI-cambai-A3`                                                                                                                                                 |
| 3tentos           | `DI-tres-tentos-cruz-alta-X1`, `DI-tres-tentos-cruz-alta-L2`                                                                                                   |
| Corteva           | `DI-corteva-santa-rosa-L1-LV`, `DI-corteva-santa-rosa-L1-MNV`, `DI-corteva-santa-rosa-L1-TQRb`, `DI-corteva-santa-rosa-L1-GRF`, `DI-corteva-santa-rosa-L1-HST` |
| Nelson do Brasil  | `DI-nelson-santa-rosa-L3-LV`, `DI-nelson-santa-rosa-L3-EXA`, `DI-nelson-santa-rosa-L3-TQR`, `DI-nelson-santa-rosa-L3-TLH`                                      |
| FUNDIMISA         | `DI-fundimisa-C1`                                                                                                                                              |
| Sementes Giovelli | `DI-giovelli-G1`, `DI-giovelli-G2`                                                                                                                             |

## Dependências técnicas do EST

A biblioteca preserva a origem, o estado e a versão disponíveis. Carga, tolerância, duração, amostragem e capacidade dependem de fonte técnica aplicável e validação. A fonte documenta EQ-02 com dados pendentes. A periodicidade de reinspeção e a validade técnica têm significados próprios, assim como a antecedência D57 da calibração e a D3 da reinspeção.

Os nomes presentes no histórico ou no seletor da publicação são evidências documentais. Atribuições EST e TST na Nexus dependem da identidade autenticada, da qualificação e da designação no escopo.

## Limitações concretas

Em execução isolada, a referência passou 73/73 verificações F1 e 84/84 F1.1. Em F1.2 passou 34/51. As 17 falhas decorreram da etapa de geração. No Windows usado para a verificação, o alias `python3` apontou para a Microsoft Store. O executável `python` disponível não tinha PyMuPDF ou python-docx e a busca local por `pdftotext` e LibreOffice não encontrou os binários. Pillow estava disponível e gerou as 12 representações das fotos. Esses resultados documentam o comportamento do protótipo. Os testes de integração verificam a persistência na Nexus.

Os arquivos privados, nomes das pessoas e mapas completos ficam fora do repositório. Os comandos reproduzíveis estão em `scripts/inspecoes`.
