# Revisão da experiência — Agenda e Equipe

Revisão Product Design em 22/10/2026. Referência: aplicação existente, preservando
tokens OKLCH, componentes operacionais e identidade única do rail. Fluxo observado:
encontrar a Agenda → reconhecer o período → abrir compromisso → conferir origem,
pessoas e próxima ação → criar/editar → recuperar validação ou falha.

## Método e alcance

Capturas manuais no navegador integrado, rota de laboratório
`http://127.0.0.1:4182/?page=agenda-equipe&reader=synthetic`, com componentes,
rotas, schemas e hooks da aplicação. Transporte e identidades são sintéticos,
restritos a `tests/ui`. Capturas não provam persistência nem autorização SQL.
Esses contratos são verificados separadamente no PostgreSQL descartável.

Viewport CSS conferido: desktop 1440×900 e celular 390×845. A matriz automatizada
acrescenta 360, 768, 1024 e 1366 px, altura reduzida, ampliação, teclado e foco.
Emulação não representa teste em aparelho físico, Safari ou leitor de tela.

## Achados priorizados e tratamento

| Prioridade | Classe | Impacto e frequência | Tratamento |
| --- | --- | --- | --- |
| P1 | Estrutural | Agenda ausente da busca e navegação; toda alocação começava sem destino operacional | Entrada após Dashboard; acesso e destino por capacidade; menus pendentes fora da navegação |
| P1 | Interação | Erro e conflito poderiam perder a intenção do usuário em qualquer criação | Intenção idempotente, formulário preservado, recarga explícita após conflito, acesso atual revalidado |
| P1 | Interação | Respostas tardias poderiam recolocar conteúdo após revogação ou troca de contexto | Guardas de geração/contexto, descarte de continuação e limpeza direcionada do cache |
| P2 | Estrutural | Filtros e dias vazios empurravam o primeiro compromisso para baixo no celular | Barra progressiva, botões agrupados e lista móvel com dias relevantes |
| P2 | Refinamento | Datas completas e descrição repetida estreitavam os cards de semana | Horário curto no desktop, origem resumida; nome completo em título e nome acessível |
| P2 | Interação | Mensagens padrão do validador apareciam em inglês | Mensagens PT-BR locais, resumo com foco e erro associado ao campo |
| P2 | Interação | Ausência de confirmação clara entre presença e execução | Confirmação por participante separada do estado do compromisso e da origem |
| P2 | Estrutural | Detalhe competia com o calendário no celular | Ficha prioritária móvel; desktop mantém lista e ficha relacionadas; retorno preserva recorte |

## Evidências comparáveis

As imagens abaixo usam dados sintéticos e a mesma aplicação de laboratório.

| Arquivo em evidencias/agenda-equipe | Condição | Avaliação |
| --- | --- | --- |
| 03-antes-busca-desktop.jpg | Desktop 1440×900, busca por Agenda antes da integração | Ausência do destino documentada |
| 05-lista-mobile.jpg | Celular 390×845, primeira composição da lista | Controles extensos e primeiro dia vazio |
| 06-lista-mobile-refinada.jpg | Mesmo viewport e semana, composição refinada | Primeiro compromisso visível e controles agrupados |
| 07-validacao-antes-idioma.jpg | Celular, envio incompleto | Mensagens em inglês rejeitadas na revisão |
| 08-validacao-mobile.jpg | Mesmo formulário e viewport após correção | Resumo e mensagens PT-BR, foco no primeiro campo |
| 10-semana-desktop-final.jpg | Desktop 1440×900, semana com evento noturno | Horários curtos, origem, estado e responsáveis identificáveis |
| 11-origem-mobile-final.jpg | Celular 390×845, compromisso de levantamento | Versão, período, origem e próxima ação visíveis |
| 12-anexos-mobile-final.jpg | Mesmo detalhe, rolagem até pessoas e arquivos | Presença separada da execução e área privada de evidências |
| 13-agenda-desktop-entrega.jpg | Desktop1440×900 com recorte final de menus | Agenda presente; cinco destinos incompletos indisponíveis |

A revisão final também cobriu pendências por versão e redução de30para1registro:
o usuário consegue voltar da página2 e a consulta atual substitui o cache antigo.
`ui-47-agenda-serie-pendencias-final-encolhimento/agenda-serie-pendencias/`
contém a captura390px desse trecho de detalhe, com causa e próxima ação explícitas.

## Fluxo avaliado

1. **Concluído:** identificar destino, período, visualização e próxima ação.
2. **Concluído:** criar evento/ação com validação recuperável; detalhes e vínculos
   com entidades canônicas visíveis. Contratos de persistência têm prova SQL separada.
3. **Concluído:** revisar lista e ficha desktop/mobile, nomes longos, evento noturno,
   vazio, falha de rede, conflito, permissão revogada e retorno preservando filtros.
4. **Concluído com limite declarado:** foco, teclado, Escape, diálogos e ampliação
   no Chromium de teste. Não há declaração de conformidade WCAG integral.

Não foi alterada a geometria ou interação das cenas existentes. Canais externos,
ICS e origens operacionais ainda não implementadas não aparecem como integrações
concluídas. Resultados, migrações e limites conectados constam em `validacao.md`.
