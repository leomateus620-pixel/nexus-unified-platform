# Correção do acesso da Engenharia e unificação visual da NEXUS

## Resultado esperado
- O Ricardo verá somente **Comercial**, **Produtos e Soluções** e **Engenharia** no menu principal.
- **Dashboard** e **Configurações** não aparecerão para o papel Engenharia e continuarão bloqueadas por acesso direto.
- Ao entrar, clicar na marca NEXUS ou tentar voltar para a página inicial, o Ricardo será direcionado para **Comercial**, evitando uma página sem acesso.
- A barra lateral, a marca, o cabeçalho e a área do usuário manterão exatamente a mesma aparência ao alternar entre os módulos.
- A palavra NEXUS será apresentada em uma única cor clara, sem destacar o “X” em verde, em todas as aparições da logo do sistema.
- Administradores e outros papéis continuarão com seus menus e página inicial atuais.

## Implementação
1. **Centralizar o destino inicial por papel**
   - Acrescentar à mesma matriz de acesso uma função que determine a primeira tela permitida.
   - Para Engenharia, usar `/comercial`.
   - Aplicar esse destino após login, quando uma sessão existente abrir `/auth`, ao acessar `/` e no link da marca.
   - Ajustar a ação da tela “Sem acesso” para voltar à primeira área permitida, sem mencionar Dashboard para quem não a possui.

2. **Remover a Dashboard da Engenharia**
   - Retirar `/` dos menus permitidos do papel Engenharia.
   - Manter a Dashboard disponível para os papéis que já têm acesso amplo.
   - Preservar os cinco fluxos autorizados nas propostas: Itens, Dimensionamento, Orçamento, Compras e Produção.

3. **Consolidar a identidade visual da aplicação**
   - Tornar a moldura autenticada independente do endereço aberto.
   - Eliminar as regras condicionais que hoje mudam largura da barra, altura do cabeçalho, espaçamentos, tipografia e aparência da navegação entre módulos.
   - Manter os estilos específicos apenas dentro das áreas de trabalho de Comercial, Produtos, Compras e Engenharia.
   - Usar os mesmos estados ativo, foco, cores e dimensões no menu normal e no menu móvel.

4. **Padronizar a logo NEXUS no sistema inteiro**
   - Ajustar o componente central da marca para que todas as letras usem a mesma cor clara, sem o “X” verde.
   - Preservar o desenho tipográfico NEXUS, sua inclinação, proporção e nitidez nos diferentes tamanhos.
   - Aplicar a mesma apresentação na barra lateral, no menu móvel e na tela de acesso.
   - Revisar as demais aparições identificadas da marca e retirar variações conflitantes, sem transformar títulos comuns ou nomes de módulos em logos.

5. **Revisar o acesso da Engenharia**
   - Confirmar que Configurações, Usuários, Orçamentos e Dashboard não aparecem e retornam “Sem acesso” por endereço direto.
   - Confirmar que Comercial, Produtos e Soluções e Engenharia continuam navegáveis e editáveis conforme as permissões existentes.
   - Confirmar que Resumo, Parâmetros e Histórico continuam ocultos dentro das propostas.

## Validação
- Criar testes da matriz de navegação para o papel Engenharia: menus visíveis, rotas bloqueadas, etapas liberadas e destino inicial.
- Entrar como Ricardo e percorrer Comercial → Produtos e Soluções → Engenharia, comparando a barra lateral em cada tela.
- Testar login, clique na marca, acesso direto a `/`, Dashboard e Configurações.
- Conferir a logo na tela de acesso, barra lateral e menu móvel, garantindo que o “X” não receba cor verde.
- Conferir menu móvel e tela ampla, além de erros visuais, carregamento e navegação.

## Limites desta entrega
- Não altera cálculos, catálogo, custos, dados das propostas nem permissões de ações no servidor.
- Não remove a Dashboard do sistema inteiro; remove apenas do papel Engenharia, como solicitado para o Ricardo.
