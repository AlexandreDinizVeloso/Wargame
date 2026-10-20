# Protocolo 3 — motor headless e cliente Godot

`shared/` e `server/` não importam React, `src/` ou APIs do DOM. O cliente web usa comandos e eventos JSON; outro cliente pode utilizar o mesmo transporte. O renderer Godot não está implementado nesta versão.

```sh
npm ci
npm run server:headless
```

## HTTP e WebSocket

| Rota          | Conteúdo                                                                             |
| ------------- | ------------------------------------------------------------------------------------ |
| `/api/health` | `status: ok`, versão 0.3.0 e `protocolVersion: 3`                                    |
| `/api/schema` | Mapa, nações/brasões SVG, doutrinas, cidades sagradas por escopo, objetivos e ordens |
| `/ws`         | Texto JSON UTF-8 em WebSocket                                                        |

O modo headless não inicia Vite, não exige `dist/` e retorna 404 para a raiz. HTTP e WS usam a mesma porta, 3000 por padrão. Browser precisa da mesma origem; cliente nativo sem `Origin` é aceito. Um proxy HTTPS usa WSS. Mensagens de comando têm limite de 16 KiB e há controle de frequência por conexão.

## Sala, identidade e recuperação

```json
{
  "type": "create",
  "name": "Estrategista",
  "mode": "quick",
  "theater": "EUROPE",
  "nationId": "PORTUGAL"
}
```

`mode`: `quick` ou `campaign`. `theater`: `EUROPE`, `AMERICAS` ou `ASIA`; Campanha ativa todos os continentes. `demo: true` cria três bots, inicia a sala e remove o cronômetro.

```json
{ "type": "join", "code": "A3F021", "name": "Convidado" }
```

A escolha de nação é opcional na entrada; ausência escolhe a primeira disponível. Uma nação só pode estar em uso por um jogador. O lobby aceita `SET_IDENTITY` para mudar a seleção.

O servidor responde `{type: joined, code, playerId, token}`, seguido de `{type: state, state: GameView}`. Guarde a credencial em armazenamento privado. Reencontre a sessão com `type: resume` e os mesmos `code`, `playerId` e `token`. Tokens não devem aparecer em chat, logs ou URLs.

`{"type":"leave"}` desconecta da sala. Uma sessão aberta em outra conexão encerra a anterior com código 4001. O arquivo de campanhas guarda somente SHA256 dos tokens. Após queda/reinício ou quando todos saem, o relógio pausa até um humano reconectar.

Os envelopes antigos v1/v2 são rejeitados com orientação para atualizar o cliente. A migração de snapshots v2 é independente do protocolo de rede e preserva uma cópia `.v2-backup`.

## Comandos

```json
{
  "type": "command",
  "command": {
    "type": "SUBMIT_ORDER",
    "order": { "type": "MOVE_BATTALION", "battalionId": "army-1", "path": ["castile", "france"] }
  }
}
```

| `command.type`            | Campos adicionais                                    |
| ------------------------- | ---------------------------------------------------- |
| `SUBMIT_ORDER`            | `order: PlayerOrder`                                 |
| `CANCEL_ORDER`            | `key`: `city:<provinceId>` ou `army:<battalionId>`   |
| `READY`                   | `ready: boolean`                                     |
| `ANSWER_OFFER`            | `offerId`, `accept: boolean`                         |
| `START_GAME`              | Somente anfitrião, com 3–8 jogadores                 |
| `SET_MODE`                | `mode`, `theater?`; anfitrião, no lobby              |
| `SET_IDENTITY`            | `nationId`, `religiousPolicy?`; no lobby             |
| `SET_RELIGIOUS_POLICY`    | `policy: INQUISITION ou TOLERANCE`                   |
| `ADD_BOT`                 | Anfitrião, no lobby                                  |
| `REPLACE_WITH_BOT`        | `playerId`; anfitrião, somente ausente               |
| `CHAT`                    | `text`, não vazio, até 280 caracteres                |
| `DECLARE_WAR`             | `targetRealmId`, `casusBelli`, `offensiveAllyIds?`   |
| `CALL_TO_ARMS`            | `warId`, `allyId`                                    |
| `OFFER_PEACE`             | `warId`, `terms: PeaceTerm[]`                        |
| `JOIN_DIET`, `LEAVE_DIET` | Sem campos adicionais                                |
| `VOTE_EMPEROR`            | `candidateId`, que deve ser membro                   |
| `ISSUE_IMPERIAL_EDICT`    | Somente Imperador, com ouro e autoridade disponíveis |

`casusBelli`: `CONQUEST`, `IMPERIAL_BAN`, `HOLY_WAR`, `HUMILIATION`.

## Ordens de cidade e formação

| `order.type`                                         | Campos                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECRUIT_BATTALION`                                  | `provinceId`, quantidades opcionais `infantry`, `cavalry`, `artillery`, `warships`, `transports`; `isFleet?`, `isMercenary?`, `battalionId?` para reforçar, `name?` |
| `BUILD_FORT`, `BUILD_PORT`, `BUILD_MARKET`, `PACIFY` | `provinceId`                                                                                                                                                        |
| `CONVERT`                                            | `targetProvinceId`                                                                                                                                                  |
| `MOVE_BATTALION`                                     | `battalionId` e **exclusivamente** `targetProvinceId` ou `path: string[]`                                                                                           |
| `ENTRENCH_BATTALION`, `TRAIN_BATTALION`              | `battalionId`                                                                                                                                                       |
| `MERGE_BATTALIONS`                                   | `battalionId`, `targetBattalionId`                                                                                                                                  |
| `SPLIT_BATTALION`                                    | `battalionId`, `composition` com as cinco quantidades, `name?`                                                                                                      |
| `EMBARK_BATTALION`                                   | `battalionId` e **exclusivamente** `fleetId` ou `disembarkProvinceId`                                                                                               |
| `DIPLOMACY`                                          | `action`, `targetRealmId`, `amount?`, `targetProvinceId?`                                                                                                           |

Quantidades são inteiros não negativos; uma ordem recruta 1–50 unidades. Não se mistura composição terrestre e naval. Uma cidade e um batalhão podem agir na mesma rodada. Mercenários e diplomacia são imediatos; demais ordens entram na fila. Cancelar ordem de formação também interrompe sua rota contínua.

Ações diplomáticas: `PROPOSE_ALLIANCE`, `BREAK_ALLIANCE`, `MILITARY_ACCESS`, `DEMAND_TRIBUTE`, `EMBARGO`, `FUND_REBELS`, `SEND_SUBSIDY`. Tributo, rebeldes e subsídio usam `amount`; rebeldes também exigem a província alvo.

## Tratados

`OFFER_PEACE.terms` aceita uma lista sem tipos repetidos:

```json
[
  { "type": "CEDE_PROVINCES", "provinceIds": ["castile"] },
  { "type": "WAR_REPARATIONS", "immediateTribute": 10 },
  { "type": "HUMILIATE_DISARM" },
  { "type": "FORCE_EMPIRE_OR_RELIGION", "choice": "RELIGION" }
]
```

Também há `{type: SUBJUGATE}`. A escolha forçada é `EMPIRE` ou `RELIGION`. Os custos devem caber na pontuação; só se exige terra inimiga ocupada. Uma lista vazia propõe paz sem exigências. Pontuação favorável 100 permite imposição; em outros casos é criada oferta respondida pelo destinatário com `ANSWER_OFFER`. Bots podem aceitar automaticamente conforme sua situação.

## Estado e privacidade

`GameView.version` é 3. Dados principais:

- `matchConfig`, `mode`, `theater`, `turn`, `maxTurns`, `deadline` ou `null`, fase e pausa.
- `players`: nação, fé/política, recursos, prestígio, desgaste, condição de súdito e modificadores temporários.
- `provinces`: estático mais runtime. `ownerId` e `occupierId` são distintos; não existe `province.troops`.
- `battalions`: composição física, moral 0–100, treinamento 1,00–1,50, posição, fila de caminho, entrincheiramento, estado isolado, tipo naval e vínculos de embarque.
- `wars`: lados, líderes, casus belli, pontuação −100–100, início/fim, banimento e termos finais.
- `diet`: Imperador, autoridade, membros, votos, contador de paz, Édito e banimentos.
- `plannedOrders`: somente ordens do jogador autenticado. Caminhos futuros de formações rivais são removidos.
- `lastReport`, `reports` e `history`: última resolução, oito relatórios recentes e histórico integral da campanha.
- `winnerObjective`: apenas `DOMINATION` ou `IMPERIAL_PACIFICATION`; `winnerId` pode ser `null` quando não há vencedor.

Semente, contador interno, hashes/tokens e filas adversárias não são enviados. Autoria de financiamento encoberto é redigida para outros jogadores. O servidor valida todos os custos, adjacências, composições, tratados, capacidades e permissões. Em erro, responde `{type: error, message}` sem confirmar a mutação.

## Eventos, replay e exportação

`TurnResolutionReport` inclui `movements`, `battles`, `retreats`, `stackwipes`, `conversions`, `rebellions`, `diplomaticChanges`, `attritionLosses`, `economy`, `diet` e `events`.

- Movimento informa formação, dono, origem, destino, tipo naval e quantidade.
- Batalha informa lados, IDs das formações, poderes, moral, treinamento, composição perdida, baixas por reino, terreno, fortes neutralizados, bloqueio e recuo.
- Recuos têm motivo `battle`, `repatriation` ou `regrouping` e quantidade preservada/dispersa.
- Cada entrada de `history` acrescenta as nações, guerras e controle territorial daquela rodada.

O cliente web usa os eventos para um replay de quatro segundos; outro cliente pode escolher sua apresentação. Efeitos sonoros e animações não participam da resolução do servidor.

`MatchTelemetry` contém exatamente as seções `matchConfig`, `nations`, `turnByTurnHistory`, `wars`, `battles`, `dietHistory`, `economyMetrics`, `finalState`, além de `schemaVersion: 3`. O exportador público não inclui segredos nem ordens futuras adversárias. Uma crônica legível pode ser construída a partir do mesmo histórico.

`rings` usa listas de coordenadas de mundo. Um cliente Godot pode transformar cada anel em `PackedVector2Array` e desenhá-lo com `Polygon2D`. `path` é fornecido para SVG. O BFS usa somente IDs e vizinhos; nenhum cliente determina resultados de combate ou custos autoritativos.
