# PET Cotrirosa — equipe cadastrada com certificado por função

## Situação verificada
- O banco já tem as colunas de carga horária, tipo e modalidade, ou seja, a mudança `0063` foi aplicada.
- Hoje não existe nenhuma pessoa com esses quatro nomes, nenhuma competência ativa e nenhum vínculo de equipe com unidade. Por isso o lote vai criar os registros: nada será "encontrado".
- O ZIP tem os 6 JPEG esperados, entre 60 e 236 KB cada.
- A PET de demonstração guarda o participante como `{id, nome, funcao}`. A PET operacional já usa `PetPicker` com `pessoa_id + funcao`.

## 1. Conferência dos originais (antes de gravar)
- Abrir cada JPEG e registrar titular, curso, carga horária, datas de realização e emissão, local, emissor e validade (explícita ou ausente).
- Se o titular ou o conteúdo divergir da matriz, o item vira "revisar" e não é gravado.

## 2. Importação em duas fases (script privado em /tmp, fora do Git)
- **Prévia (somente leitura):** classificar cada item como existente, criar, vincular, revisar ou incompleto, informando a unidade de destino (Fábrica de Ração — Santa Rosa). Homônimos vão para "revisar".
- **Execução:** usar os RPCs existentes (`salvar_qualificacao`, `nr_unidade_pessoa_salvar`, anexos e confirmação) com chaves idempotentes derivadas de origem + SHA-256 do arquivo + pessoa + competência. Uma segunda execução reconcilia o que já existe e conclui o que ficou pendente.
- Competências reutilizadas ou criadas no catálogo da organização:
  - NR-33 Supervisor de entrada;
  - NR-33 Trabalhador autorizado e Vigia: um único certificado comprova os dois papéis;
  - Equipe de Emergência e Salvamento;
  - Prevenção e Combate a Incêndio.
- Substituto de vigia segue a regra de capacitação do vigia.
- Pessoas e vínculos à unidade:

| Pessoa | Funções na unidade |
|---|---|
| Diciane | Supervisor |
| Jonatan | Supervisor, Resgate |
| Dari | Vigia, Trabalhador, Resgate (candidato) |
| Edemar | Vigia, Trabalhador |

- Os JPEG ficam no acervo privado de qualificações, com trilha de auditoria. "Matriz" é registrado como local do curso.
- Validade: guardo a data explícita quando existe. Quando não existe, a validade é calculada pela regra canônica e marcada com essa origem. Campos que faltam ficam como não informados.
- Pendências que o lote registra:
  - verso do certificado de 24 h do Jonatan;
  - comprovante específico de resgate em espaço confinado do Dari.

## 3. Servidor: candidatos e evidência por função
- Nova consulta autenticada `pet_equipe_candidatos(org, cliente, unidade, local, funcao)`. Ela revalida o escopo e devolve as pessoas vinculadas à unidade, com o estado documental da função: `vinculado`, `ausente`, `em_conferencia`, `vencido`, `incompleto` ou `sem_acesso`, além do id da qualificação escolhida e das alternativas.
- O mapeamento função → competência fica numa tabela/regra versionada do servidor, não na tela.
- O documento é aberto pelo fluxo privado existente de visualização de anexos (link assinado curto), autorizado por pessoa + qualificação.
- Os bloqueios de emissão, assinatura e entrada continuam inalterados. O verde significa apenas "há certificado vinculado".

## 4. Etapa Equipe (PET operacional e demonstração)
- Componente compartilhado `PetTeamSelector` com a sequência Função → Pessoa cadastrada (lista que abre sem digitar, com busca) → Adicionar à equipe. No desktop fica em uma linha; no celular, empilhado.
- Ao trocar a função, a pessoa e o certificado são reavaliados. As consultas usam chave pessoa + função, para que uma resposta atrasada nunca apareça na linha de outra pessoa.
- Participantes agrupados por função, cada linha com nome, função e selo com rótulo:
  - ✅ Certificado vinculado;
  - ❌ Sem certificado desta função;
  - atenção: Em conferência, Vencido ou Incompleto;
  - consulta: Verificando, Indisponível ou Sem acesso, com opção de tentar de novo.
- Botão "Ver treinamento" abre um painel de leitura com curso, carga horária, datas, situação e imagem. Fechar o painel mantém etapa, pessoa, função e rascunho.
- Demonstração: o participante ganha `pessoa_id` opcional, e rascunhos antigos só com nome continuam válidos (com teste). O `id` do participante é preservado para entradas e saídas. Candidatos reais só aparecem na demonstração se o servidor autorizar; caso contrário, ela usa dados próprios e o rótulo de demonstração continua visível.
- As regras existentes de duplicidade, cobertura e incompatibilidade de funções continuam valendo.

## 5. Validação
- Testes unitários: compatibilidade de rascunho antigo, mapeamento função → competência e descarte de resposta atrasada.
- Prévia autenticada no EC 27 e no EC 28: entrar em PET → Equipe e percorrer os cenários Supervisor, Vigia/Trabalhador, Resgate (Jonatan ✅ em conferência, Dari ❌) e troca de função; salvar, recarregar e conferir.
- Exceções: treinamento vencido, documento indisponível, consulta sem permissão, troca de unidade, lote executado duas vezes. Testes que simulam operação usam apenas registros de teste.

## Entrega
Conciliação dos 6 arquivos por pessoa e categoria com os IDs internos criados, informando se o lote foi executado ou apenas simulado; pendências (verso do Jonatan, resgate do Dari); resultados dos testes e capturas.

## Arquivos
Nova mudança de banco (regra função → competência + consulta de candidatos), `pet` functions, `PetTeamSelector.tsx`, `PetEditor.tsx`, `PetDemoWorkspace.tsx`, `demo/domain.ts` e testes. Script de importação somente em /tmp.
