# Protocolo 4 — servidor headless / Godot

`shared/` e `server/` não importam `src/`, React ou APIs DOM. O cliente utiliza JSON por HTTP/WS. Execute `npm run server:headless`; nenhum renderer Godot é incluído.

## HTTP

| Rota              | Retorno                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `GET /api/health` | `status: ok`, `version: 0.4.0`, `protocolVersion: 4`                         |
| `GET /api/schema` | Nações, brasões, mapas, recursos, estações, crises, crenças e tipos de ordem |
| `GET /api/rooms`  | Array de salas públicas não encerradas, sem sessão ou cartas privadas        |
| `/ws`             | WebSocket de mensagens JSON                                                  |

Browser usa mesma origem; cliente nativo pode omitir `Origin`. Mensagens têm até 16 KiB; há limite de frequência. HTTPS exige WSS.

Cada item da listagem possui `roomId`, `roomName`, `hostName`, `theater` (`Mapa-Múndi`, `Europa`, `Américas`, `Ásia`), `enableSecretObjectives`, `playersCount`, `maxPlayers`, `status` (`LOBBY`/`IN_GAME`) e `turn`. O cliente consulta a cada 2 segundos. Só salas em lobby com vaga aceitam novas entradas; campanhas iniciadas exigem reconexão de sessão existente.

## Entrada

```json
{
  "type": "create",
  "name": "Ana",
  "roomName": "Mesa de sábado",
  "isPublic": true,
  "enableSecretObjectives": true,
  "turnTimerSeconds": 60,
  "mode": "quick",
  "theater": "EUROPE",
  "nationId": "aurelia"
}
```

`mode` é `quick` ou `campaign`; `theater` é `EUROPE`, `AMERICAS` ou `ASIA`. Campanha usa o mundo. Nome da sala, publicidade, objetivos e timer são opcionais; padrões: nome gerado, pública, objetivos ativos, 60 segundos. O timer aceita 15–600. `demo:true` adiciona três bots e inicia a sala.

```json
{ "type": "join", "code": "A3F021", "name": "Bia" }
```

O servidor responde `{type:"joined",code,playerId,token}`, seguido de `{type:"state",state:GameView}`. `nationId` é opcional e deve estar disponível. Use `SET_IDENTITY` no lobby para trocar. Código é dispensável na interface do browser de salas.

Recuperação: `{type:"resume",code,playerId,token}`. Saída: `{type:"leave"}`. O token é privado, guardado na aba; o disco guarda somente SHA256. Uma conexão nova para a mesma sessão encerra a anterior com código 4001.

## Comandos

Todo comando usa `{type:"command",command:{type:..., ...campos}}`.

| Tipo                                      | Campos                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `SET_MODE`                                | `mode`, `theater?`; somente host no lobby                                                   |
| `SET_LOBBY_OPTIONS`                       | `roomName`, `isPublic`, `enableSecretObjectives`, `turnTimerSeconds`; somente host no lobby |
| `SET_IDENTITY`                            | `nationId`, `religiousPolicy?`; no lobby                                                    |
| `ADD_BOT`, `START_GAME`                   | Somente host                                                                                |
| `REPLACE_WITH_BOT`                        | `playerId`; somente ausente, pelo host                                                      |
| `SUBMIT_ORDER`                            | `order`                                                                                     |
| `CANCEL_ORDER`                            | `key`, por exemplo `army:army-1` ou `city:portugal`                                         |
| `READY`                                   | `ready:boolean`                                                                             |
| `CHOOSE_SECRET_OBJECTIVE`                 | `objectiveId`; turno 1, antes de confirmar                                                  |
| `DECLARE_WAR`                             | `targetRealmId`, `casusBelli`, `offensiveAllyIds?`                                          |
| `DECLARE_WAR_AND_MOVE`                    | Campos de declaração mais `battalionId`, `targetProvinceId`; atômico                        |
| `JOIN_COALITION`, `DECLARE_COALITION_WAR` | `targetRealmId`                                                                             |
| `CALL_TO_ARMS`                            | `warId`, `allyId`                                                                           |
| `OFFER_PEACE`                             | `warId`, `terms`                                                                            |
| `ANSWER_OFFER`                            | `offerId`, `accept`                                                                         |
| `SET_RELIGIOUS_POLICY`                    | `policy`: `TOLERANCE`/`INQUISITION`                                                         |
| `CHAT`                                    | `text`, até 280 caracteres                                                                  |

Casus belli: `CONQUEST`, `HOLY_WAR`, `HUMILIATION`, `COALITION`. A contenção exige coalizão válida; o servidor inclui todos os membros. Comandos antigos de Dieta são rejeitados.

Ordens de cidade: `RECRUIT_BATTALION`, `BUILD_FORT`, `BUILD_PORT`, `BUILD_MARKET`, `PACIFY`, `CONVERT`. Recrutamento usa `provinceId`, composição (`infantry`, `cavalry`, `artillery`, `warships`, `transports`), `isFleet?`, `isMercenary?`, `battalionId?` para reforçar e `name?`.

Ordens de formação: `MOVE_BATTALION` (`battalionId` e `targetProvinceId` ou `path` exclusivamente), `TRAIN_BATTALION`, `ENTRENCH_BATTALION`, `SPLIT_BATTALION` (`composition`), `MERGE_BATTALIONS` (`targetBattalionId`), `MERGE_ALL`, `EMBARK_BATTALION` (`fleetId` ou `disembarkProvinceId`) e `RAZE_PROVINCE`.

Diplomacia usa ordem `DIPLOMACY` com `action`, `targetRealmId`, `amount?`, `targetProvinceId?`. Ações: `PROPOSE_ALLIANCE`, `BREAK_ALLIANCE`, `MILITARY_ACCESS`, `DEMAND_TRIBUTE`, `EMBARGO`, `FUND_REBELS`, `SEND_SUBSIDY`, `OFFER_VASSALAGE` (Aurélia), `BUY_VISION_OR_BRIHC` (Véspera). Essa última compra visão quando não há província e suborna quando há `targetProvinceId`.

Tratados: `CEDE_PROVINCES` (`provinceIds`), `WAR_REPARATIONS` (`immediateTribute`), `HUMILIATE_DISARM`, `FORCE_EMPIRE_OR_RELIGION` com `choice:RELIGION` (nome preservado do protocolo anterior) e `SUBJUGATE`.

## Timer, privacidade e persistência

`GameView.version` e `MatchTelemetry.schemaVersion` valem **4**. `turnDeadlineAt` é `null` no começo de cada rodada. O primeiro humano vivo a enviar `READY:true` define o prazo e `firstReadyPlayerName`. `deadline` é alias de compatibilidade. Todos prontos ou prazo expirado resolve; nova rodada zera ambos. Desconfirmar não adia o prazo. Após pausa, um relógio iniciado retoma o tempo restante; planejamento ainda sem primeiro pronto continua livre.

`GameView` não contém `seed`, `nextId`, ordens alheias ou pendências internas. As cartas e seleção dos outros jogadores são removidas inclusive do histórico. Intenções são fornecidas apenas à própria visão, a soberano de súditos, contratos de visão e inteligência adjacente de Sapiência. Tropas camufladas de Verídia são removidas da visão adversária; não são enviadas como composição zero. A visão final revela as cartas.

`reports`, `lastReport` e `history` incluem `world:{season,event,coalitions}`. Exportações têm `worldHistory`; `dietHistory` permanece apenas como arquivo legado. O histórico não recebe o corte interno do simulador em jogos humanos.

Snapshots 2/3 são migrados para 4 com backups específicos. O arquivo usa escrita temporária, `fsync`, troca atômica e rollback quando uma gravação de comando falha. Não há autenticação por conta: o token privado da sessão é a credencial de reconexão.
