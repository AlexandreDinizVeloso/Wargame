# Concórdia — Atlas de Impérios · v0.3

Grand Strategy para **3–8 participantes**: ordens simultâneas, cidades e batalhões independentes, marinha, guerras formais, religião e uma Dieta Imperial. Cliente React/TypeScript/SVG e servidor Node.js autoritativo, também executável sem frontend.

## Executar

Node.js **22.12+**; Node 24 foi verificado.

```sh
npm ci
npm run dev
```

HTTP e WebSocket `/ws` compartilham a porta **3000**. Todos entram no endereço do mesmo anfitrião e usam o código da sala. A demonstração cria uma partida com três bots e sem cronômetro.

```sh
npm run build
npm start
```

Para servir somente o motor e o protocolo JSON, sem Vite ou interface compilada:

```sh
npm run server:headless
```

| Variável opcional  | Padrão                                       |
| ------------------ | -------------------------------------------- |
| `PORT`             | `3000`                                       |
| `HOST`             | `0.0.0.0`; `::` permite IPv6                 |
| `ROOMS_STATE_FILE` | `.local/rooms-state.json` na raiz do projeto |

Não há banco externo, assets remotos de áudio ou chave de API obrigatória. No ambiente cloud com cache pessoal não gravável: `npm ci --include=dev --cache /workspace/.cache/npm --no-audit --no-fund`.

## Um mundo e oito nações

O mapa usa contornos orgânicos incorporados do **Natural Earth**, de domínio público. Rápido oferece Europa, Américas ou Ásia/Pacífico, cada teatro com **16 províncias terrestres** e suas zonas marítimas. Campanha usa **56 terras em quatro regiões e 13 zonas marítimas**.

O total de 56 permite três teatros de 16 terras mais oito de MENA/África. As fronteiras modernas são agrupadas para o jogo; não representam uma reconstrução política de 1550. Há travessias curtas abstratas, enquanto deslocamentos oceânicos usam frotas. Nações sem capital histórica no teatro escolhido recebem uma sede local. Capitais disponíveis são reservadas antes de distribuir territórios de apoio.

Portugal, Castela, França, Sacro Império, Otomanos, Ming, Japão e Incas são escolhas exclusivas no lobby. Cada nação possui brasão SVG, religião, duas ideias nacionais e composição inicial própria. As quatro crenças usam doutrinas de jogo, com nomes fictícios; cada uma tem uma Cidade Sagrada por mapa configurado.

## Comandar

- **Clique no território:** administrar cidade, construir, pacificar, converter e recrutar.
- **Clique na ficha militar:** selecionar batalhão ou frota, inspecionar composição e preparar suas ordens.
- **Clique direito em qualquer região:** calcular o menor caminho legal para a formação selecionada. Cada rodada percorre uma ligação.
- **Scroll:** zoom entre 0,8× e 3,5×; arraste com botão direito, meio ou Espaço + esquerdo para mover a câmera.
- **1–5:** mapas político, religioso, economia/suprimento, diplomático e estabilidade.
- **Esc:** fechar a janela ou modal ativo.

Cidades e batalhões recebem ordens separadas. Infantaria protege artilharia; cavalaria flanqueia e persegue; canhões neutralizam fortes e atacam a moral. Portos constroem navios; cada transporte embarca quatro unidades. Frotas em zonas adjacentes bloqueiam cidades inimigas.

Diplomacia permite declarar guerra com casus belli, convocar aliados, negociar paz, impor reparações e desarmamento, ceder ocupações, forçar religião/ingresso na Dieta e subjugar reinos. Entrar em território de outra nação exige guerra formal ou acesso. Ocupação militar e propriedade definitiva são campos distintos.

Todas as janelas podem ser desanexadas, arrastadas, redimensionadas e minimizadas. A disposição fica salva no navegador. A resolução tem replay de quatro segundos e sons sintetizados; o botão de som fica na barra superior.

## Exatamente duas vitórias

1. **Dominação Total:** eliminar/subjugar os demais reinos ou controlar pelo menos 75% das terras, sem outro reino acima de 15%.
2. **Pacificação Imperial:** ser Imperador, reunir pelo menos 60% das nações vivas na Dieta e sustentar cinco rodadas consecutivas sem guerras no mundo.

Não há vitória por ouro, religião ou pontuação acumulada. No limite de rodadas, uma campanha sem condição cumprida termina sem vencedor. A dissolução de todos os reinos também encerra a campanha sem vencedor. Religião, economia e diplomacia dão meios para disputar esses dois objetivos.

Rápido: até **20 rodadas × 3 minutos**. Campanha: até **40 × 7,5 minutos**. Confirmação antecipada, pausas e uma vitória antes do limite alteram a duração real.

## Telemetria e persistência

Na barra superior e no resultado final:

- **Baixar Relatório (.JSON):** configuração, nações, todas as rodadas, guerras, batalhas, Dieta, economia e estado final público.
- **Baixar Crônica (.TXT):** resumo por rodada e estatísticas finais.

A exportação nunca inclui tokens de reconexão, semente privada ou ordens futuras dos rivais. O histórico completo é mantido durante a campanha; a interface também permite rever animações anteriores.

O servidor salva alterações e resoluções em `.local/rooms-state.json`, usando arquivo temporário, sincronização, troca atômica e backup. Ao reiniciar ou quando todos desconectam, a campanha pausa até alguém reconectar. O token privado da aba permite retomar a sessão; o código da sala sozinho não basta.

Snapshots v0.2 são migrados para entidades v0.3, preservando jogadores, tesouros, territórios, tropas e tokens. O tabuleiro antigo é mantido para essas campanhas. Marchas antigas são canceladas e relatórios antigos ficam no arquivo original **`.v2-backup`**, que é criado antes da gravação v3. Resultados de partidas v0.2 já encerradas ficam identificados como legados; não são reclassificados como vitórias v0.3. Novas salas usam o novo mapa. Preserve `.local/` ou use volume persistente; não execute dois servidores escrevendo no mesmo arquivo.

## Validar

```sh
npm run build
npm test
npm run simulate:balance
```

Os testes cobrem fórmulas, batalhões, frotas, guerras, tratados, Dieta, duas vitórias, exportação, privacidade, multiplayer, migração, corrupção de arquivos e queda de um processo headless com `SIGKILL`, seguida de recuperação em outro processo.

O simulador usa **200 partidas reais de seis bots** por padrão, alternando teatros rápidos e campanha mundial. Verifica invariantes militares, transporte naval, guerra formal e integridade da telemetria. Preserva campanhas sem vencedor e informa as duas vitórias separadamente.

```sh
npx tsx scripts/simulate-balance.ts --seed=20261020 --output=.local/balance-v3.json
npx tsx scripts/simulate-balance.ts --mode=campaign --games=200
```

Com o servidor iniciado e Chromium instalado:

```sh
npm run test:browser
```

`CHROMIUM_PATH` e `BASE_URL` permitem outros executáveis e endereços. Capturas e exportações de verificação ficam ignoradas em `.local/`. A validação inclui janelas, câmera, ordens, guerra, replay, áudio/mute, arquivos baixados, celular, três jogadores e vitória imperial.

## Arquitetura e guias

| Local                                           | Responsabilidade                                        |
| ----------------------------------------------- | ------------------------------------------------------- |
| `shared/types.ts`                               | Contratos JSON do protocolo 3                           |
| `shared/map.ts`, `world-geometry.json`          | Grafo, terrenos e geometria orgânica                    |
| `shared/rules.ts`                               | Nações, religiões, economia, BFS, vitórias e telemetria |
| `server/game.ts`, `commands.ts`                 | Máquina de estados, validação, resolução e bots         |
| `server/combat.ts`, `diplomacy.ts`              | Composição, recuo, guerras, paz e Dieta                 |
| `server/rooms.ts`, `storage.ts`, `migration.ts` | Transporte, sessão e recuperação                        |
| `src/FloatingWindow.tsx`, `audio.ts`            | Janelas e sintetizador Web Audio                        |
| `scripts/generate-map.py`                       | Regeneração opcional da cartografia, com Python/Shapely |

`shared/` e `server/` permanecem independentes de React, `src/` e DOM. Um cliente Godot pode usar HTTP/WebSocket com os mesmos contratos; o renderer Godot não faz parte desta versão.

Veja [regras v0.3](docs/REGRAS_V3.md), [protocolo](docs/PROTOCOL.md), [balanceamento](docs/BALANCE.md), [cartografia](docs/CARTOGRAFIA.md), [conceito](docs/CONCEITO.md) e [rede sem IPv4 público](docs/REDE.md). O [balanceamento v0.2](docs/BALANCE_V2.md) e suas sementes são históricos e usam outras condições de vitória.
