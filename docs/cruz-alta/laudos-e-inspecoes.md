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

A ficha consulta o catálogo privado em páginas de seis fotos. Ao abrir uma foto, mostra a prévia de até 1280 px. O controle **Ver original** solicita o arquivo em resolução integral. A listagem em segundo plano acompanha alterações de versão enquanto a ficha está aberta. Cada transferência exige acesso à unidade e verificação atual do arquivo, da versão e das pastas no Drive. Uma cópia privada fica elegível depois da conferência dos bytes gravados. Durante o processamento, a origem continua atendendo a consulta. A sincronização retira versões antigas do catálogo e agenda a remoção das cópias correspondentes.

## Ativação das prévias do acervo

1. Aplicar as migrações `0092` a `0095` pelo ledger do projeto e publicar a aplicação com os assets versionados do leitor. Os buckets `nexus-cruz-alta-pdf-previas` e `nexus-cruz-alta-rdo` são privados. As imagens dos anexos da unidade usam as representações privadas já existentes do NR.
2. Conferir o callback `nexus_ca_inspecao_worker_url` e a credencial do Drive descritos acima. Os agendamentos `nexus-ca-inspecao-drive`, `nexus-ca-rdo-midia` e `nexus-ca-imagens` processam, respectivamente, inspeções/PDFs, fotos de montagem e imagens do acervo. Cada fila autentica sua invocação. O primeiro carregamento do acervo existente depende da conclusão desses trabalhos.
3. Para antecipar os PDFs antigos, um operador pode executar `node --import tsx scripts/cruz-alta/preparar-pdfs.ts 100` em um ambiente de servidor com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. O lote usa a mesma reserva que o agendador e informa quantos arquivos processou. As páginas extraídas têm até 2 MiB. Para originais acima de 24 MiB e folhas maiores, o leitor usa intervalos de 256 KiB com SHA-256. Se o servidor de arquivos não atender a leitura parcial, o leitor confere e abre o original completo.
4. Para imagens grandes ou ambientes sem transformação no Storage, construir o processador dedicado na raiz com `docker build -f scripts/cruz-alta/Dockerfile.imagens -t nexus-ca-imagens scripts/nr`. Com as duas variáveis anteriores já definidas no ambiente protegido, executar `docker run -d --restart unless-stopped --memory=2g --env SUPABASE_URL --env SUPABASE_SERVICE_ROLE_KEY --name nexus-ca-imagens nexus-ca-imagens`. O processo atende apenas imagens vinculadas à unidade e confirma no Storage as variantes de 384 e 768 px. Também pode ser executado em lote com `python3 scripts/nr/image-worker.py --cruz-alta --max-jobs 30` em ambiente com Pillow instalado.
5. Conferir a cobertura em uma sessão administrativa usando as consultas abaixo. Selecionar no mapa um componente com foto e uma LVHF com laudo, abrir o original pelo botão da foto e a página de evidência pela ficha. Na NR-35, repetir a abertura pelo acervo da mesma unidade. O registro da validação deve usar duração, tipo e tamanho, mantendo as URLs assinadas e os documentos privados fora dos logs.

```sql
select coalesce(r.estado, 'aguarda primeira reserva') as fase, count(*)
from public.ca_pdf_fontes() f
left join public.ca_pdf_representacoes r using (organization_id, bucket, caminho, sha256)
group by 1;
select tipo, estado, count(*) from public.ca_rdo_trabalhos group by tipo, estado;
select v.variante, count(*) filter (where exists (
  select 1 from public.nr_imagem_representacoes i
  where i.arquivo_id = f.id and i.variante = v.variante and i.estado = 'disponivel'
)) as prontas, count(*) as imagens
from public.ca_imagem_fontes() f(id)
cross join (values ('miniatura_384'), ('previa_768')) v(variante)
group by v.variante;
```

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
