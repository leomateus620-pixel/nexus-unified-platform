# Prontidão gráfica e carregamento progressivo

`performance.ts` versão 3 distingue construção, recursos disponíveis e apresentação real. Todos os tempos da instância usam o mesmo `startedAt`; o relatório de produção soma esse valor ao relógio do documento para confrontar as metas de 3/5 s. A preparação de CPU não representa prontidão gráfica.

1. A cena essencial, materiais, luzes, controles e domínio são construídos. `preparationMs` termina nessa etapa.
2. O PMREM local é carregado e as opções reais de iluminação/recorte são aplicadas. `WebGLRenderer.compileAsync` prepara os materiais; `mainCompileMs` mede a espera transcorrida, incluindo a compilação assíncrona. Não é tempo de GPU medido.
3. O primeiro `renderer.render` essencial concluído registra `explorationMs` e libera a exploração. Só então começam os downloads, decodificação e construção dos técnicos, evitando sua concorrência com o primeiro quadro. Ainda não existe conexão individual visível sem técnico; o cabo permanente pertence à cena essencial.
4. `assetReadyMs` identifica a disponibilidade dos GLBs/rigs. Os materiais dos técnicos são compilados com a câmera, as luzes e o ambiente da cena de destino; `workerCompileMs` registra essa espera. O grupo permanece oculto durante a preparação.
5. Os técnicos e sua conexão são apresentados. Apenas depois desse `renderer.render` real a simulação publica `readyMs`, `data-ready=true` e os comandos de reprodução disponíveis. O relógio do domínio não avança para preparar shaders.

A versão anterior publicava `readyMs` quando os recursos eram montados, antes do primeiro desenho dos técnicos. A investigação [startup-cold.json](evidence/upgrade/startup-cold.json), com sobrecusto de instrumentação declarado, mostrou compilação dos materiais dos técnicos **depois** daquele indicador: prontidão declarada no documento em 5.368 ms e chamadas de desenho até aproximadamente 6.242 ms. Portanto, comparações históricas devem distinguir disponibilidade dos recursos e primeiro quadro completo, sem converter o indicador antigo em uma medição visual que não foi feita.

## Evidência que orientou a mudança

O perfil de partida original encontrou `KHR_parallel_shader_compile` disponível. No carregamento frio instrumentado, consultas síncronas de programas consumiram aproximadamente 958 ms durante a criação do PMREM e 1.319 ms no primeiro render. Os uploads de geometria desse primeiro render consumiram aproximadamente 4 ms. Isso orientou a retirada da convolução em tempo de execução e a preparação assíncrona, preservando geometria, materiais PBR, iluminação e resolução do ambiente.

O ambiente local usa os mesmos pixels do PMREM 256 original, pré-filtrados pelo script de preparação. A conversão linear e as sondas PBR estão documentadas em [environment-map.md](environment-map.md). Não há ambiente externo obrigatório, material provisório ou alteração de qualidade para antecipar a prontidão.

As APIs foram conferidas no código instalado do Three.js 0.186.0: `WebGLRenderer.compile/compileAsync` configura as luzes/ambiente da cena de destino e aguarda os programas com consultas de conclusão; sem a extensão, a compilação continua funcional e a medição mantém o requisito de quadro concluído. Referências primárias: [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer) e [KHR_parallel_shader_compile](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/). A extensão permite consultas sem bloqueio e concorrência; não garante um tempo universal de compilação.

## Recuperação e reprodução

Uma época identifica cada preparação gráfica. Perda de contexto, descarte e erro invalidam continuações antigas. O prazo global de 20 s cobre carregamento e preparação; timeout ou falha de recurso mostram erro recuperável. O descarte cancela requisições e encerra o gate do primeiro quadro sem iniciar GLBs tardios. Perda de contexto pausa o domínio; a restauração reaproveita o bitmap de CPU, prepara novamente os programas e só publica prontidão após outro quadro completo. A liberação de caches GPU não fecha o bitmap do proprietário.

```powershell
node scripts/silo-engolfamento/validate-startup.mjs
```

O script executa nove contratos no Chrome local: prontidão após desenho; exploração/corte enquanto o GLB é retido, sem corda flutuante; compilação pendente e descarte; isolamento e seleção anteriores à chegada do cinturão; perda durante compilação e restauração; ambiente ausente e retry; extensão indisponível; prazo de compilação e retry; prazo antes do primeiro quadro enquanto a aba está oculta, preservando o erro ao retornar. Holds e falhas são injeções controladas para testar ciclo de vida, sem valor como benchmark. `npm run test:silo:ui` inclui esse script após a validação integral, em `evidence/upgrade/startup-state/`. O filtro `SILO_STARTUP_CHECKS` permite repetir somente o contrato pertinente.

O desempenho final usa o build de produção, as condições e os números registrados na entrega. Estes testes sintéticos não comprovam hardware móvel, tempo de GPU ou rede móvel.
