# Laudos e inspeções de Cruz Alta

O mapa consulta um resumo privado de evidências LVHF depois de validar a sessão e o acesso à unidade. A ficha reúne montagem, RT/ART, inspeção e próximo prazo com a página da fonte. A etiqueta acompanha a projeção da linha de vida na estrutura. O leitor abre a revisão privada por URL temporária e valida o arquivo pelo hash. O estado de montagem do levantamento continua com sua própria legenda.

O título técnico usa `TAG · DESCRIÇÃO DA PRANCHA · LAC`, com TAG na frente e descrição integral em maiúsculas. O lacre aparece no acervo autorizado quando consta de uma fonte conferida. A numeração composta conserva os zeros, os códigos decimais e a ordem da tabela. O mesmo padrão é aplicado na ficha, nos marcadores, na busca e nas listas por estrutura.

## Operação no Lovable

1. O conector Lovable aplica as migrações `0085` a `0088` com os envelopes transacionais de `scripts/migrations/connector-batch.mjs`. Confirmar as posições 109 a 112 do ledger, o bucket privado e as três raízes. A revisão 56 do layout foi conferida na folha 1 e cadastrou 74 TAGs e 38 células com lacre.
2. Usar a conta de serviço dedicada com a Drive API habilitada e acesso de leitura aos documentos de Cruz Alta. As raízes exatas estão em `inspection-sync/sources.server.ts`. O worker solicita o escopo `drive.readonly`.
3. Publicar as rotas e emitir um ticket com `ca_inspecao_drive_setup_emitir`, pelo Lovable, para o e-mail da conta de serviço. Enviar o JSON da conta exclusivamente a `https://nexusgestao.app/api/public/cruz-alta/inspection-drive-setup`, por `POST` com `Content-Type: application/json` e `X-Nexus-Drive-Setup-Token`. A resposta `204` confirma o armazenamento no Vault. O ticket expira em dez minutos e é consumido na mesma transação. O worker lê o segredo apenas para um trabalho com lease ativo. A configuração de runtime `CRUZ_ALTA_DRIVE_SERVICE_ACCOUNT_JSON` continua disponível para implantações que já a usam.
4. Com o worker publicado e a credencial no Vault, configurar `https://nexusgestao.app/api/public/cruz-alta/inspection-worker` como `nexus_ca_inspecao_worker_url` pelo Lovable. Em um ambiente novo, registrar as raízes com `ca_inspecao_sync_start`, passando a lista de `{folderId, kind}` para `layout`, `montada` e `laudo`.
5. Conferir o estado na ficha da unidade. O agendador revisita a fila a cada minuto e abre um novo lote por raiz a partir de 15 minutos. O botão de conferência imediata usa a mesma fila. Para pausar o processamento, tornar a URL do callback indisponível no Vault. As revisões privadas e as últimas evidências conferidas continuam acessíveis.

PDFs finais de laudos e placas são classificados pela pasta, pelo código completo e pela revisão técnica. O worker também lê o quadro da primeira folha do Layout Geral, com a revisão do carimbo. Uma revisão mais recente pode atualizar a identificação do mapa, enquanto uma revisão com o mesmo número e hash diferente preserva a tabela conferida e sinaliza a divergência. A leitura automática é limitada a 24 MiB e 120 páginas, com os resultados incompletos encaminhados para conferência. Os PDFs preservados ficam no bucket `nexus-cruz-alta-laudos`. Arquivos editáveis, scripts e pranchas auxiliares ficam fora da importação de laudos. Nenhum PDF do Drive é distribuído no repositório.

O perfil revisor precisa da permissão `revisar_nr` e de um cadastro profissional ativo no Nexus. O revisor abre a página do documento, confirma os campos indicados e decide sobre o aviso. O mapa usa datas documentadas. Um aviso de prazo ou restrição informa a condição registrada no acervo. A autorização operacional é tratada no processo da unidade.

## Fotos de montagem e RDO

A ficha lateral mostra miniaturas das fotos da LVHF selecionada e das linhas vinculadas à estrutura. A seleção de uma miniatura amplia a foto na própria ficha. O código no início do nome da pasta é conferido contra a cena. As subpastas numeradas da raiz entram como fotos de montagem. As subpastas numeradas de `LANÇADOS RDO CHARLISE` entram como fotos lançadas no RDO.

Aplique as migrações `0089` a `0091` via Lovable. Em um ambiente novo, publique o worker antes de executar `ca_inspecao_rdo_registrar(p_raiz, p_lancadas)` no banco do projeto, com os IDs das duas pastas do Drive. A função cadastra a origem na configuração privada e usa a fila existente. O worker percorre as duas listagens, incluindo páginas adicionais, e substitui a relação de pastas somente ao concluir a conferência. Mudanças de nome, movimentações e novas pastas numeradas entram no ciclo do agendador.

A ficha consulta a lista de imagens da seleção ao abrir e periodicamente enquanto permanece visível. A versão do Drive muda quando o arquivo é editado e faz a ficha pedir a imagem nova. O servidor valida a sessão, o acesso aos originais e o vínculo à estrutura em cada leitura. A conta de serviço lê o arquivo na origem e entrega a imagem pelo Nexus.

## Conferência

- A listagem do Drive encontrou 40 códigos distintos presentes em `Laudos`, `Linhas Já Montadas` e na cena. O número decimal foi tratado como parte da identidade. As duas unidades de `01` mantêm o vínculo no nível da linha enquanto a evidência não as distingue.
- A leitura local do PDF original da `08` confirmou a RT/ART na página 43 e as datas de inspeção na página 18. A placa confirma as duas datas na página 1. A montagem ficou sem data explícita. Os originais das placas `57`, `57.1` e `01` tiveram extração e identificação conferidas separadamente. Os PDFs ficaram fora do repositório.
- O teste de interface (`node tests/cruz-alta/inspection-ui.mjs`) usa a rota real e um acervo descartável de teste. Cobre ocultação ao visitante, perda da sessão, abertura de etiqueta, fichas da estrutura e da LVHF, leitor na página da evidência, volta com o mesmo enquadramento e validação de restrição. Em um segundo piloto local com o PDF original da `08`, a ficha abriu diretamente na página 18 de 44 e voltou ao mesmo enquadramento.
- As capturas da rota real usam dados sintéticos para preservar o acervo. [Marcador e ficha no desktop](evidencias/laudos/ficha-desktop.jpg) · [Ficha no celular](evidencias/laudos/ficha-movel.jpg)

### Desempenho da rota pública

Chrome com ANGLE Metal, viewport 1440 × 900, escala 1 e servidores Vite locais aquecidos. Três cargas em novos contextos do navegador por revisão, alternando a ordem. A medição detecta desenhos WebGL do canvas durante uma órbita controlada de aproximadamente 2,25 s. O primeiro quadro é medido desde o início da navegação. O p95 observado inclui a cadência de 24 ms do comando de arraste.

| Medida                                         | Base `f783538` | Com laudos |
| ---------------------------------------------- | -------------: | ---------: |
| Primeiro quadro, mediana                       |         944 ms |     927 ms |
| Intervalo entre quadros durante o arraste, p95 |        33,4 ms |    33,4 ms |
| Quadros WebGL durante o arraste por passagem   |          68–69 |      68–69 |

O ensaio mede o mapa público local. A passagem autenticada foi verificada funcionalmente em desktop e móvel. A latência do Drive e do callback contínuo deve ser verificada com a credencial de produção provisionada.
