# Evidências do relatório PET V2

Amostra gerada pelo renderer da aplicação com o fixture controlado de testes: 45 itens de checklist, registros de demonstração e uma captura de tela já presente no repositório para conferir incorporação de imagem. Não representa uma PET emitida nem comprova assinatura certificada ou operação em campo.

- `pet-v2-capa.png`: primeira página e resumo dos registros.
- `pet-v2-encerrada.png`: abertura visual de uma PET encerrada no fixture.
- `pet-v2-fotografia.png`: fotografia demonstrativa, legenda e trilha final.
- `pet-v2-paginacao.png`: todas as páginas para conferir continuação de tabelas e margens.
- `pet-v2-demonstracao.pdf`: amostra de consulta, com aproximadamente 204 KiB.

Os testes de versão preservam o renderer V1 e seus bytes, separam solicitações V2 e verificam hash estável para o mesmo snapshot. O resultado dos testes e o trecho sanitizado do runner SQL local estão na pasta superior.
