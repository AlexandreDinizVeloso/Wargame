# Concórdia — Atlas de Impérios · v0.4

Grand Strategy multiplayer para **3–8 jogadores**, com ordens simultâneas, **oito nações assimétricas**, guerras formais, recursos estratégicos, estações, crises e coalizões. Vitória por **60% das terras incluindo vassalos**, eliminação/submissão dos rivais ou **objetivo secreto**. As partidas não têm limite de rodadas.

## Executar

Node.js **22.12+** (validado com Node 24).

```sh
npm ci
npm run dev
```

Abra a porta **3000**. O navegador de salas lista campanhas públicas desse servidor; salas privadas usam código. A demonstração cria três bots e obedece ao mesmo timer First-Ready.

```sh
npm run build
npm start
```

Motor sem interface, Vite ou dependência de `dist/`:

```sh
npm run server:headless
```

| Variável           | Padrão                        |
| ------------------ | ----------------------------- |
| `PORT`             | `3000`                        |
| `HOST`             | `0.0.0.0`; use `::` para IPv6 |
| `ROOMS_STATE_FILE` | `.local/rooms-state.json`     |

Sem banco externo, chave de API ou assets remotos. No cloud com cache pessoal sem permissão, use `npm ci --include=dev --cache /workspace/.cache/npm --no-audit --no-fund`.

## Nações e mundo

| Nação       | Mecânica                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Aurélia     | Vassalagem voluntária ou por tratado; recebe 25% da renda bruta dos súditos; compartilha visão e dominação          |
| Ferro-Norte | +8 ouro por baixa inimiga; moral ao saquear; ignora inverno e penalidades da floresta                               |
| Véspera     | Mercenários imediatos em porto/mercado, −35% custo; +30% receita comercial local; visão comprável e suborno dobrado |
| Sol Invicto | Conversão +25 ouro e +10 Fervor; +20% ataque/moral em guerra religiosa e chance de agitação adjacente               |
| Kaldor      | Fortes −30%, até nível 4, causam 15% de atrito em sitiantes; artilharia −25% custo e +25% fogo                      |
| Turan       | Cavalaria pura percorre duas planícies/costas por rodada; arrasar conquista rende 80 ouro                           |
| Sapiência   | Recruta com treinamento 1,20×; vê intenções inimigas em províncias adjacentes                                       |
| Verídia     | Camuflagem em mata/colinas próprias; defesa local com +50% poder de emboscada                                       |

As 56 terras e 13 zonas marítimas usam geometria Natural Earth incorporada, de domínio público. Os teatros Europa, Américas e Ásia têm 16 terras cada. As nações são ficcionais sobre geografia terrestre; o mapa não pretende reconstruir fronteiras de 1550. Quatro religiões fictícias mantêm doutrinas e cidades sagradas.

Trigo, ferro, cavalos, minas de ouro e relíquias aparecem no mapa e alteram recrutamento, ataque, suprimento, renda e moral. Primavera, verão, outono e inverno formam um ano. Uma crise a cada quatro rodadas dura duas rodadas; expansão excessiva permite coalizões de contenção.

## Comandar

- Clique em uma província para administrar, recrutar, converter e negociar com o proprietário.
- Selecione uma ficha militar: os destinos vizinhos ficam verdes (mover), vermelhos (invadir) ou azuis (transporte). Clique esquerdo ou direito prepara o movimento. Clique fora ou pressione **Esc** para desmarcar.
- Clique no **✕ da seta** para cancelar a marcha. A HUD inferior divide 50/50, reúne formações, abre recrutamento, entrincheira e permite arrasar quando aplicável.
- Declare guerra pelo brasão no topo, pelo painel de uma província estrangeira ou pelo modal ao tentar invadir em paz. **Declarar Guerra e Marchar** é uma operação atômica no servidor.
- **Scroll** ajusta zoom; botão direito/meio ou Espaço + arraste move a câmera; **1–5** troca o modo de mapa.

As janelas podem ser arrastadas, redimensionadas, desanexadas e minimizadas. A resolução tem replay de quatro segundos e áudio sintetizado com opção de silenciar.

## Ritmo e vitória

O lobby configura o prazo de **15–600 segundos**, padrão **60**. Cada rodada começa com `turnDeadlineAt: null`: o primeiro humano a confirmar inicia o relógio para todos. Todos prontos ou prazo expirado resolve a rodada. Cancelar a confirmação não reinicia o prazo. Bots não disparam o relógio. Após desconexão geral/reinício, a campanha pausa e conserva o tempo restante de um relógio já iniciado.

Objetivos secretos vêm ativados por padrão. Cada comandante recebe duas cartas no turno 1 e escolhe uma. Se não escolher, a primeira é adotada ao resolver. Metas são adaptadas ao mapa; o botão **🎯 Meu Objetivo Secreto** mostra o progresso. O servidor verifica a vitória ao fim da rodada e revela a carta vencedora. Adversários não recebem as cartas, a seleção ou o progresso privado durante a partida.

Não há limite de turnos em partidas humanas. Somente o simulador usa um corte interno para encerrar a coleta. Dissolução de todos os reinos encerra sem vencedor.

## Persistência e exportação

O servidor grava snapshots atômicos, backups e hashes de tokens. Preserve `.local/` em volume persistente e use um processo por arquivo. O código da sala permite entrar no lobby; recuperar um jogador existente exige o token privado da aba.

Snapshots v0.3 migram para v0.4 com uma cópia `.v3-backup`, preservando sessão, ouro, tropas e tabuleiro. Objetivos secretos ficam desligados nessas partidas já iniciadas; a Dieta passa a ser arquivo histórico. Snapshots v0.2 também são aceitos e guardam `.v2-backup`. Salas migradas ficam privadas por padrão.

JSON e TXT podem ser baixados na HUD e na tela final. O relatório inclui todas as rodadas, batalhas, economia, guerras, estações e coalizões, respeitando a visão de quem exportou. Tokens, semente privada e ordens ocultas não são exportados.

## Validar

```sh
npm run build
npm test
npx tsx scripts/smoke-browser.ts
npx tsx scripts/simulate-balance.ts --games=40 --seed=20261020 --max-turns=60
```

O smoke inicia um servidor isolado em porta livre e abre três navegadores Chromium. É preciso Chromium instalado (`CHROMIUM_PATH` opcional; padrão `/usr/bin/chromium`). `BASE_URL` permite apontar para um servidor v0.4 já iniciado. Artefatos ficam em `.local/`. O simulador informa vitórias e partidas ainda sem vencedor no corte, sem inventar resultado por pontos.

## Arquitetura

| Área                                                      | Papel                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `shared/types.ts`, `rules.ts`, `strategy.ts`              | Contratos, nações, recursos, economia, objetivos e regras comuns |
| `shared/map.ts`                                           | Geometria, adjacências e recursos                                |
| `server/game.ts`, `combat.ts`, `diplomacy.ts`, `world.ts` | Resolução autoritativa, combate, tratados, crises e coalizões    |
| `server/rooms.ts`, `storage.ts`, `migration.ts`           | HTTP/WS, sessões, timer e persistência                           |
| `src/`                                                    | Cliente React/SVG, HUD, áudio e janelas                          |

`shared/` e `server/` não importam React, `src/` ou DOM. Um cliente Godot pode consumir o [protocolo 4](docs/PROTOCOL.md). Consulte [regras v0.4](docs/REGRAS_V4.md), [validação/balanceamento](docs/BALANCE.md), [cartografia](docs/CARTOGRAFIA.md) e [rede sem IPv4 público](docs/REDE.md). As regras e resultados v0.2/v0.3 em `docs/` são arquivos históricos.
