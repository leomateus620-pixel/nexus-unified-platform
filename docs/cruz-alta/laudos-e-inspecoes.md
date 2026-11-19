# Laudos e inspeções de Cruz Alta

O mapa consulta um resumo privado de evidências LVHF depois de validar a sessão e o acesso à unidade. A ficha reúne montagem, RT/ART, inspeção e próximo prazo com a página da fonte. A etiqueta acompanha a projeção da linha de vida na estrutura. O leitor abre a revisão privada por URL temporária e valida o arquivo pelo hash. O estado de montagem do levantamento continua com sua própria legenda.

## Operação no Lovable

1. O conector Lovable aplicou as migrações `0085` e `0086` com os envelopes transacionais de `scripts/migrations/connector-batch.mjs`. A conferência no projeto Nexus confirmou as posições 109 e 110 do ledger, o bucket privado e a restrição de acesso às funções. As três raízes foram cadastradas. A fila está preparada e aguarda a configuração do worker.
2. Usar uma conta de serviço dedicada do Google Cloud com a Drive API habilitada. Conceder **Leitor** no Layout Geral e em Laudos, com acesso a Linhas Já Montadas, e cadastrar `CRUZ_ALTA_DRIVE_SERVICE_ACCOUNT_JSON` como segredo do runtime do Lovable. As raízes exatas estão no módulo privado `inspection-sync/sources.server.ts`.
3. Após o deploy da rota do worker e a configuração do segredo, cadastrar no Vault a URL `https://nexusgestao.app/api/public/cruz-alta/inspection-worker` com o nome `nexus_ca_inspecao_worker_url`, pelo conector Lovable. Em um ambiente novo, registrar as raízes com `ca_inspecao_sync_start`, passando a lista de `{folderId, kind}` para `layout`, `montada` e `laudo`.
4. Conferir o estado na ficha da unidade. O agendador revisita a fila a cada minuto e abre um novo lote por raiz a partir de 15 minutos. O botão de conferência imediata usa a mesma fila. Para pausar o processamento, tornar a URL do callback indisponível no Vault. As revisões privadas e as últimas evidências conferidas continuam acessíveis.

PDFs finais de laudos e placas são classificados pela pasta, pelo código completo e pela revisão técnica. A leitura automática é limitada a 24 MiB e 120 páginas, com os resultados incompletos encaminhados para conferência. Os PDFs preservados ficam no bucket `nexus-cruz-alta-laudos`. Arquivos editáveis, scripts e pranchas auxiliares ficam fora da importação de laudos. Nenhum PDF do Drive é distribuído no repositório.

O perfil revisor precisa da permissão `revisar_nr` e de um cadastro profissional ativo no Nexus. O revisor abre a página do documento, confirma os campos indicados e decide sobre o aviso. O mapa usa datas documentadas. Um aviso de prazo ou restrição informa a condição registrada no acervo. A autorização operacional é tratada no processo da unidade.

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
