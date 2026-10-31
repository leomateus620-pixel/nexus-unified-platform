# Marcas de clientes e seleção contextual

Base: PR20, commit `476cd7ecde56aae5a235af906157d39e4072a40c`. As marcas foram verificadas no site oficial e baixadas sem transformação em 31/10/2026. São servidas pela própria Nexus em `public/brands`; a interface não faz hotlink para a origem.

| Cadastro preservado | Ativo oficial | Dimensões | SHA-256 | Superfície |
|---|---|---|---|---|
| COTRIROSA | [cotrirosa-logo.png](https://cdn.siterapido.rs/wp-content/uploads/sites/210/2023/11/cotrirosa-logo.png) | PNG 211×40 px, 8.349 bytes | `8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7` | Escura: o binário contém letras brancas. Nenhum filtro ou recoloração aplicado. |
| Camera Alimentos | [logo.svg corporativo](https://www.camera.ind.br/src/img/home/logo.svg) | SVG viewBox 258,35×41,575, 4.023 bytes | `a7965c6dc0d707d83d4320f2ea5e8119ec6cbbdb216999c4b033b73dabb2d917` | Clara |

O site oficial da Camera identifica a marca como **Camera Agroindustrial**. A consulta ao cadastro canônico confirmou a associação entre o nome comercial Camera Alimentos e a razão social Camera Agroindustrial S/A. Não foi localizado nem declarado um arquivo específico da assinatura “Camera Alimentos”. A atribuição da mídia usa ID e organização conferidos, preservados nas migrações; o frontend não seleciona clientes pelo texto do nome.

O PNG COTRIROSA é exibido em largura inferior à resolução nativa. `object-fit: contain`, transparência, proporção e respiro são preservados. Não houve ampliação artificial para simular vetor. Ausência ou erro da imagem mostra monograma e mantém o nome legível.

`NrClientBrand` compartilha a composição entre seletor e agrupamentos. `NrClientSelect` usa Radix Popover + cmdk: busca textual, valor pelo ID, confirmação explícita, opção atual, Enter/Escape e retorno de foco. Abrir ou buscar não muda contexto; a troca de cliente limpa a unidade para seleção explícita.

O cadastro existente permite PNG/JPEG até 1 MiB, prévia e escolha de superfície clara/escura. Selecionar o arquivo permanece local. Upload acontece somente ao salvar, com autorização do chamador, validação de MIME real/tamanho/dimensões/SHA-256 e readback privado antes da adoção. O caminho é imutável por organização/autor/hash. Retentativas verificam o objeto existente. Falha de validação ou revisão concorrente preserva o formulário; Cancelar exige o descarte explícito já existente. URLs assinadas não são persistidas e as assinaturas são feitas em lote por coleção.

Migrações aplicadas pelo conector Lovable do projeto Nexus, com envelope/ledger versionado: `0052_clientes_marcas` (posição71), `0054_clientes_marca_superficie` (73), `0055_clientes_marca_verificacao` (74). A aplicação de metadados no banco não representa publicação do frontend.

Validação: 10 testes Vitest de mídia/servidor; 18 asserts SQL isolados de RLS, versão, preservação e idempotência; 14 verificações de interface em Chromium/WebKit (7 por engine), incluindo cliente após a25ª opção, falha de imagem, teclado/foco, marca local+Cancelar e390×844. Evidências sintéticas em `docs/ui/evidence/nr-client-brands/`. WebKit não certifica Safari em dispositivo real. O teste SQL usa apenas metadados Storage de um banco descartável; a prova dos bytes fica no teste de readback/validação do servidor.
