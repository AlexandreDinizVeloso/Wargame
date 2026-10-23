# Protocolo 7 — servidor headless / Godot

`shared/` e `server/` não importam `src/`, React ou APIs DOM. O cliente utiliza JSON por HTTP/WS. Execute `npm run server:headless`; nenhum renderer Godot é incluído.

## HTTP

| Rota              | Retorno                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/health` | `status: ok`, `version: 1.0.1`, `protocolVersion: 7`                                        |
| `GET /api/schema` | Nações, mapas, recursos, crises, crenças, ordens, `skills`, `commanderTraits` e `buildings` |
| `GET /api/rooms`  | Array de salas públicas não encerradas, sem sessão ou cartas privadas                       |
| `/ws`             | WebSocket de mensagens JSON                                                                 |

Browser usa mesma origem; cliente nativo pode omitir `Origin`. Mensagens têm até 16 KiB; há limite de frequência. HTTPS exige WSS.

Cada item da listagem possui `roomId`, `roomName`, `hostName`, `theater` (`Mapa-Múndi`, `Europa`, `Américas`, `Ásia`), `enableSecretObjectives`, `playersCount`, `maxPlayers`, `status` (`LOBBY`/`IN_GAME`) e `turn`. O cliente consulta a cada 2 segundos. Lobbies com vaga aceitam novas entradas. Campanhas públicas também permitem assumir bots permanentes substituíveis; humanos e regentes temporários exigem reconexão com o token da sessão.

## Entrada

```json
{
  "type": "create",
  "name": "Ana",
  "roomName": "Mesa de sábado",
  "isPublic": true,
  "enableSecretObjectives": true,
  "allowBotSecretVictory": false,
  "turnTimerSeconds": 60,
  "mode": "quick",
  "theater": "EUROPE",
  "nationId": "aurelia"
}
```

`mode` é `quick` ou `campaign`; `theater` é `EUROPE`, `AMERICAS` ou `ASIA`. Campanha usa o mundo. Nome da sala, publicidade, objetivos e timer são opcionais; padrões: nome gerado, pública, objetivos ativos, vitória secreta de bots desabilitada, 60 segundos. O timer aceita 15–600. `demo:true` adiciona três bots e inicia a sala.

```json
{ "type": "join", "code": "A3F021", "name": "Bia" }
```

O servidor responde `{type:"joined",code,playerId,token}`, seguido de `{type:"state",state:GameView}`. `nationId` é opcional e deve estar disponível. Use `SET_IDENTITY` no lobby para trocar. Código é dispensável na interface do browser de salas.

Recuperação: `{type:"resume",code,playerId,token}`. Saída: `{type:"leave"}`. O token é privado, guardado na aba; o disco guarda somente SHA256. Uma conexão nova para a mesma sessão encerra a anterior com código 4001.

## Comandos

Todo comando usa `{type:"command",command:{type:..., ...campos}}`.

| Tipo                                      | Campos                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `SET_MODE`                                | `mode`, `theater?`; somente host no lobby                                                                            |
| `SET_LOBBY_OPTIONS`                       | `roomName`, `isPublic`, `enableSecretObjectives`, `allowBotSecretVictory`, `turnTimerSeconds`; somente host no lobby |
| `SET_IDENTITY`                            | `nationId`, `religiousPolicy?`; no lobby                                                                             |
| `ADD_BOT`, `START_GAME`                   | Somente host                                                                                                         |
| `REPLACE_WITH_BOT`                        | `playerId`; somente ausente, pelo host                                                                               |
| `SUBMIT_ORDER`                            | `order`                                                                                                              |
| `CANCEL_ORDER`                            | `key`, por exemplo `army:army-1` ou `city:portugal`                                                                  |
| `READY`                                   | `ready:boolean`                                                                                                      |
| `CHOOSE_SECRET_OBJECTIVE`                 | `objectiveId`; turno 1, antes de confirmar                                                                           |
| `DECLARE_WAR`                             | `targetRealmId`, `casusBelli`, `offensiveAllyIds?`                                                                   |
| `DECLARE_WAR_AND_MOVE`                    | Campos de declaração mais `battalionId`, `targetProvinceId`, `autoTransport?`; atômico                               |
| `JOIN_COALITION`, `DECLARE_COALITION_WAR` | `targetRealmId`                                                                                                      |
| `CALL_TO_ARMS`                            | `warId`, `allyId`                                                                                                    |
| `OFFER_PEACE`                             | `warId`, `terms`                                                                                                     |
| `ANSWER_OFFER`                            | `offerId`, `accept`                                                                                                  |
| `SET_RELIGIOUS_POLICY`                    | `policy`: `TOLERANCE`/`INQUISITION`                                                                                  |
| `CHAT`                                    | `text`, até 280 caracteres                                                                                           |

Casus belli: `CONQUEST`, `HOLY_WAR`, `HUMILIATION`, `COALITION`. A contenção exige coalizão válida; o servidor inclui todos os membros. Comandos antigos de Dieta são rejeitados.

Ordens de cidade: `BUILD_BUILDING`/`DEMOLISH_BUILDING` (`provinceId`, `building`: `MARKET`/`BARRACKS`/`FORT`/`FOUNDRY`/`TEMPLE`/`PORT`), `RECRUIT_BATTALION`, `BUILD_FORT`, `BUILD_PORT`, `BUILD_MARKET`, `PACIFY`, `CONVERT`. Recrutamento usa `provinceId`, composição (`infantry`, `cavalry`, `artillery`, `warships`, `transports`), `isFleet?`, `isMercenary?`, `battalionId?` para reforçar e `name?`.

Ordens de formação: `MOVE_BATTALION` (`battalionId` e `targetProvinceId` ou `path` exclusivamente), `TRAIN_BATTALION`, `ENTRENCH_BATTALION`, `SPLIT_BATTALION` (`composition`), `MERGE_BATTALIONS` (`targetBattalionId`), `MERGE_ALL`, `EMBARK_BATTALION` (`fleetId` ou `disembarkProvinceId`), `RAZE_PROVINCE`, `ASSAULT_SIEGE` (`battalionId`) e `NAVAL_BRIDGE` (`battalionId`, `fleetId`, `targetProvinceId`). Fusão/divisão enviadas pelo antigo `SUBMIT_ORDER` também são imediatas, sem entrar na fila.

Diplomacia usa ordem `DIPLOMACY` com `action`, `targetRealmId`, `amount?`, `targetProvinceId?`. Ações: `PROPOSE_ALLIANCE`, `BREAK_ALLIANCE`, `MILITARY_ACCESS`, `DEMAND_TRIBUTE`, `EMBARGO`, `FUND_REBELS`, `SEND_SUBSIDY`, `OFFER_VASSALAGE` (Aurélia), `BUY_VISION_OR_BRIHC` (Véspera). Essa última compra visão quando não há província e suborna quando há `targetProvinceId`.

Tratados: `CEDE_PROVINCES` (`provinceIds`), `WAR_REPARATIONS` (`immediateTribute`), `HUMILIATE_DISARM`, `FORCE_EMPIRE_OR_RELIGION` com `choice:RELIGION` (nome preservado do protocolo anterior) e `SUBJUGATE`.

## Timer, privacidade e persistência

`GameView.version` e `MatchTelemetry.schemaVersion` valem **7**. `turnDeadlineAt` é `null` no começo de cada rodada. O primeiro humano vivo a enviar `READY:true` define o prazo e `firstReadyPlayerName`. `deadline` é alias de compatibilidade. Todos prontos ou prazo expirado resolve; nova rodada zera ambos. Desconfirmar não adia o prazo. Após pausa, um relógio iniciado retoma o tempo restante; planejamento ainda sem primeiro pronto continua livre.

`GameView` não contém `seed`, `nextId`, ordens alheias ou pendências internas. As cartas e seleção dos outros jogadores são removidas inclusive do histórico. Intenções são fornecidas apenas à própria visão, a soberano de súditos, contratos de visão e inteligência adjacente de Sapiência. Tropas camufladas de Verídia são removidas da visão adversária; não são enviadas como composição zero. A visão final revela as cartas.

`reports`, `lastReport` e `history` incluem `world:{season,event,coalitions}`. Exportações têm `worldHistory`; `dietHistory` permanece apenas como arquivo legado. O histórico não recebe o corte interno do simulador em jogos humanos.

Snapshots 2/3/4/5/6 são migrados para 7 com backups específicos. A migração v6 preserva tropas, tesouro, posições, sessões e objetivos; inicializa os campos novos sem crescimento neutro retroativo, cancela ofensivas/rotas e reabre o planejamento. As migrações anteriores também aplicam os ajustes históricos de economia/limites/objetivos. Não há redistribuição retroativa das capitais. O arquivo usa escrita temporária, `fsync`, troca atômica e rollback quando uma gravação de comando falha. O token privado da sessão é a credencial de reconexão.

## Ações imediatas da v0.5

Todos os comandos abaixo exigem planejamento aberto (`ready:false`). Um jogador confirmado deve enviar `READY:false`; o relógio em andamento não é reiniciado. Mudanças usam a mesma transação autoritativa com persistência e rollback dos demais comandos.

| Comando               | Campos                                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| `INSTANT_ARMY_ACTION` | `action`: `MERGE_BATTALIONS`, `MERGE_ALL`, `SPLIT_BATTALION` ou `ASSIGN_LEADER` |
| `ASSIGN_LEADER`       | `battalionId`, `commanderId:string ou null`; transfere ou retira o líder        |
| `RECRUIT_COMMANDER`   | `isAdmiral`, `trait`, `name?`; 60 ouro + 15 influência, máximo três             |
| `UNLOCK_SKILL`        | `skillId`; custa 25/45/70 XP, com pré-requisitos e exclusividade A/B            |
| `SET_AUTO_MERGE`      | `battalionId`, `autoMerge:boolean`                                              |

```json
{
  "type": "command",
  "command": {
    "type": "INSTANT_ARMY_ACTION",
    "action": {
      "type": "SPLIT_BATTALION",
      "battalionId": "army-1",
      "composition": { "infantry": 3, "cavalry": 0, "artillery": 0, "warships": 0, "transports": 0 }
    }
  }
}
```

O servidor publica o estado atualizado imediatamente. Fusão/divisão cancelam ordens e rotas das formações envolvidas; a formação resultante pode receber nova marcha na mesma rodada. `DECLARE_WAR_AND_MOVE` aceita `bridgeFleetId?` para declarar guerra e preparar uma ponte naval atomicamente.

`Province.siege` contém `attackerOwnerId`, `progress`, `required`, `turnsUnderSiege`, `startedTurn` e `lastProgressTurn`. `maxBuildingSlots`, `barracksLevel`, `foundryLevel` e `templeLevel` completam a cidade. `GameView.commanders` contém os líderes; batalhões expõem `autoMerge`, `infantryPower` e `artilleryPower`. Jogadores expõem `militaryXP` e `unlockedSkills`; `paxStreak` e `objectiveStreak` permanecem privados durante a partida.

Relatórios incluem `sieges`, `movements[].viaSeaId?`, `battles[].capturedShips?` e métricas `industry`, `administration`, `buildingUpkeep` e `plunder`. Batalhas navais sempre reportam modificadores terrestres neutros (1) e forte 0. A ponte nunca cria um estado terrestre em zona marítima. Embarque explícito continua disponível e exige vínculo recíproco entre frota/carga e capacidade suficiente.

## Ações e estado da v0.6

| Comando              | Campos / efeito                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `EMERGENCY_LEVY`     | Sem campos. Planejamento aberto, guerra defensiva, perda ou cerco; 50 ouro e 15 estabilidade.                                   |
| `CONTINUE_SANDBOX`   | Sem campos. Somente anfitrião após vitória; reabre planejamento e preserva `victoryRecord`.                                     |
| `READ_NOTIFICATIONS` | `notificationIds:string[]`, até 250 por comando; somente notificações visíveis. Pode ser usado após confirmação e no resultado. |

`AUTO_TRANSPORT` é uma ordem com `battalionId` e `targetProvinceId`. O cliente **não escolhe** `seaPath` ou `fleetId`: o parser remove esses campos e o servidor determina rota, disponibilidade e custo. A rota atravessa uma ou duas zonas adjacentes, exige acesso diplomático ao destino e ausência de navios de guerra hostis. Usa transporte próprio disponível ou reserva 15 ouro para fretamento. A taxa é cobrada somente ao resolver com sucesso. `DECLARE_WAR_AND_MOVE` aceita `autoTransport:true` para preparar a invasão costeira atomicamente.

`Province` adiciona `straitNeighbors:string[]`, `straitSeaIds:Record<string,string>`, `recruitedThisTurn` e `recruitmentTurn`. Os estreitos também integram `neighbors`. `Battalion.encircled` indica isolamento logístico. `Player` adiciona `manpowerCap`, `emergencyLevyTurn`, `homelandDefenseUntil` e `lostProvinceIds`; `armyCap` é dinâmico.

`GameView` inclui `allowBotSecretVictory`, `graceUntilTurn`, `sandboxContinued`, `victoryRecord`, `notifications` e **somente o próprio** `readNotificationIds`. O mapa de leituras dos outros jogadores não é enviado. `victoryRecord` contém `winnerId`, `objective` e `turn`; o modo livre suprime novas interrupções de vitória.

Uma notificação contém `id`, `turn`, `type`, `text`, `involvesPlayerIds:string[]`, `severity:CRITICAL|WARNING|INFO`, `focusProvinceId?` e `offerId?`. O servidor envia apenas eventos pessoais envolvendo o destinatário e os eventos `WORLD` públicos. Os relatórios também possuem `notifications`, `encirclements` e `desertions`. Leituras são persistidas e o histórico conserva os eventos; a central guarda os 250 avisos mais recentes.

Declarações diretas contra outra nação principal são bloqueadas nas rodadas 1/2 de partidas novas. Bots não disparam vitória secreta, salvo `allowBotSecretVictory:true` explícito. Todas as cartas exigem `objectiveStreak >= 3`; alertas públicos ocorrem em 1 e 2, sem revelar a carta.

## Nomes e nações dos bots

- `SET_PLAYER_NAME`: `name:string` de até 30 caracteres, sem nome em branco ou controles. Espaços são normalizados. Modifica somente o próprio jogador autenticado, no lobby, planejamento (mesmo confirmado) ou resultado. IDs, tokens, ordens e prazo são preservados; nomes históricos não são reescritos.
- `SET_BOT_NATION`: `playerId`, `nationId`. Somente anfitrião no lobby e somente para um bot. Atualiza nação, cor e fé. Se a nação pertencer a outro bot, troca ambas atomicamente; se pertencer a humano, rejeita. Nenhuma mudança de nação depois de iniciar.

A carga de snapshots também remove as adjacências legadas China–Japão e Países Baixos–Grã-Bretanha; essas costas usam transporte. Os estreitos explicitamente cadastrados continuam sendo conexões terrestres.

## Ordem e estado da v0.7

`BOMBARD_COAST` é uma ordem de formação com `battalionId` e `targetProvinceId`. Reserva seis ouro, ocupa a ação da frota e é incompatível com movimento/ponte. Na resolução, frota, posição inicial, costa, guerra e recursos são revalidados; uma costa recebe no máximo um bombardeio por rodada. Exemplo:

```json
{
  "type": "SUBMIT_ORDER",
  "order": { "type": "BOMBARD_COAST", "battalionId": "fleet-1", "targetProvinceId": "italy" }
}
```

- `Battalion.disorganized:boolean`: estado terrestre persistente. Moral <25 o ativa; descanso completo em terra amiga com moral ≥25 o remove. Todas as entradas ofensivas e assaltos são validados no envio e na resolução.
- `Province.neutralDevelopmentLevel:0..5`, `neutralDevelopmentTurn:number`: crescimento de cidades independentes a cada quatro rodadas, protegido contra execução repetida.
- `Province.coastalBombardment:null | {ownerId,startedTurn,untilTurn}`: apoio válido na rodada da ação e na seguinte.
- `TurnResolutionReport.bombardments`: `{fleetId,ownerId,provinceId,fortBefore,fortAfter,cost}[]`.
- `TurnResolutionReport.neutralDevelopments`: `{provinceId,level,targetGarrison,fortLevel}[]`.
- `BattleReport.bombardmentModifier?`: `0.85` no apoio terrestre aplicável, `1` em combate naval/sem apoio.
- `EconomyMetric.maritimeTrade?`: componente já incluído em `trade`, sem duplicar a receita.
- Notificação pessoal `BOMBARDMENT`, severidade `WARNING`, com foco na costa.

Nós comerciais são derivados de províncias, frotas e guerras por `shared/maritime.ts`; não exigem ordens comerciais persistidas. Consultas do cliente são janelas não modais e não pausam o planejamento.

## Extensões compatíveis do RC v0.8/v0.9

O protocolo/snapshot permanece em **7**. O release HTTP é `0.9.0-rc.1`; `MatchConfig.createdVersion` admite esse release e a origem v0.7. Não é necessária migração destrutiva das salas v7.

- `create.tutorial?:boolean`: `true` cria uma mesa privada, iniciada, com um humano e dois bots. O servidor configura nação, recursos e alvo de treino; `MatchConfig.tutorial` marca a sala. Entrada de novos humanos nessa mesa é recusada; reconexão autenticada permanece disponível. Não existe comando para injetar esses recursos em uma campanha comum.
- `TurnHistory.analytics?:RealmTurnAnalytics[]`: cada fechamento novo registra `playerId`, `landTroops?`, `ships?`, `fortLevels` e `tradeNodes`. A ausência do campo em rodadas antigas indica dado não coletado.
- Durante o planejamento, `viewFor` remove `landTroops`/`ships` de adversários sem compartilhamento de visão; o resultado final revela os totais. Exportações respeitam a mesma visão. Cartas e ordens privadas continuam com a redação anterior.
- Gráficos, medalhas, volumes, tutorial e estado de consultas são recursos do cliente; não alteram as ordens ou a ordem de resolução de combate.

## Extensão opcional v0.95: sinais táticos

Protocolo e snapshots permanecem em **7**. O cliente autenticado envia `{ "type": "map_ping", "provinceId": "portugal", "note": "Atacar juntos!" }`. A nota é opcional, limitada a 80 caracteres. O servidor valida sala, sessão, nação ativa e província; aplica intervalo mínimo de 1,5 segundo por jogador/sala (inclusive após reconectar) e envia `{ "type": "map_ping", "ping": { "id", "code", "playerId", "provinceId", "note", "expiresAt" } }` somente ao remetente e seus aliados atuais. Identidade, código, ID e expiração são definidos pelo servidor.

O sinal dura seis segundos, não prepara ordens, não altera recursos/turno e não entra em snapshots, relatórios, chat público ou histórico. Clientes antigos podem ignorar a nova mensagem. Não há replay de sinais ao retomar a sessão. A prévia de combate usa exclusivamente a visão já filtrada pelo servidor e o cálculo puro compartilhado de poder.

## Extensões Gold v0.98 (protocolo 7)

`matchConfig.ruleset = GOLD_098` habilita as regras novas. `scenario`, `campaignId` e `sourceReport` identificam preparação, continuidade e origem de relatório. Salas antigas não recebem o ruleset automaticamente.

`export_campaign` exige anfitrião e responde com `campaign_export`. `import_campaign` recebe `save` e cria sala privada validada. `seat_invites` entrega ao importador convites individuais novos; o token bruto não entra no arquivo exportado. A retomada usa o fluxo normal de sessão com código, vaga e claim novos.

`OFFER_PEACE` aceita `concession` e termos Gold `WHITE_PEACE`, `CEDE_PROVINCES`, `WAR_REPARATIONS`, `HUMILIATE_DEMILITARIZE`, `SUBJUGATE_VASSAL`. A soma é validada pelo servidor na criação e aceitação. `CAST_IMPERIAL_VOTE` registra voto na Dieta do cenário Coroa Continental.

Eventos opcionais de era, metadados do tratado e estados dos cenários permanecem serializáveis/headless. O cliente calcula conquistas locais a partir da visão autorizada, sem enviar incrementos de dinheiro ou estatísticas ao servidor.

## Extensões v0.99 (protocolo 7)

Na v0.99, `matchConfig.verticalSlice: true` ativava Autoridade e névoa nas novas salas; `createdVersion: 0.99.0` identifica a origem. A ausência do campo preserva as regras anteriores.

`BattleReport.attackerCompositionBefore` e `defenderCompositionBefore` são opcionais e registram forças antes das baixas. Nenhum campo legado foi removido. A visão do cliente filtra forças, comandantes e detalhes de relatórios sem reconhecimento. O snapshot autoritativo e o Save JSON completo conservam o estado integral.

`GET /api/audio-assets` retorna a lista dos arquivos opcionais disponíveis, sem exigir assets de áudio para iniciar o servidor. Shared/server continuam independentes do DOM e de src.

## Extensões v1.0 (protocolo 7)

- `GET /api/rooms/public`: apenas lobbies com vaga ou campanhas públicas com bot permanente substituível. Inclui `scenario`, `humanPlayersCount`, `replaceableBots` e `joinable`, além dos campos da listagem anterior.
- `join` em campanha pública pode assumir uma nação de bot permanente. Regentes AFK não são vagas públicas. Token humano existente é preservado durante regência.
- `{type:"CHOOSE_DILEMMA", option:0|1}` resolve o dilema privado da rodada. `activeDilemma: {id,turn}|null`, `lastDilemmaTurn`, `authority`, `afkStreak` e `afkRegent` são extensões opcionais de jogador.
- `authority` é sincronizada pelo servidor em cada comando e resolução; o cliente não altera o valor. Os campos antigos continuam serializáveis para compatibilidade, compondo a reserva única.
- `previousProvinceId` e `lastMovedTurn` no batalhão registram a origem usada pelo modificador de rio. `riverCrossingModifier` no relatório indica a média ponderada aplicada ao poder atacante.
- `GET /api/audio-assets` inclui os cinco arquivos WAV PCM. `GET /api/schema` retorna o mapa expandido; saves carregados conservam a geometria armazenada.

As regras novas de Autoridade, logística, dilemas e regência valem independentemente de `verticalSlice`. Esse campo continua controlando névoa e apresentação histórica. Consulte [v1.0](V1_0.md).

## Extensões v1.01 (protocolo 7)

`EXECUTE_SUPREME_COMMAND` recebe `command: BLITZ_MARCH|WAR_BONDS|ELITE_GUARD|SIEGE_BREAKER|SABOTAGE_SUPPLY` e, conforme o caso, `battalionId` ou `provinceId`. Custos e alvos são descritos por `supremeCommands` no schema. `continentBonuses` publica os cinco conjuntos de IDs e seus ganhos. O mapa padrão passa a 42 terras + 10 mares; saves conservam a geometria original.

`MASS_RECRUIT` recebe `composition: {infantry,cavalry,artillery}`, com inteiros não negativos e soma entre 1 e 240. O planejador compartilhado `planMassRecruitment` retorna ordens, quantidades solicitadas/atendidas/restantes, custo e distribuição por cidade. O servidor recalcula a distribuição, preserva ordens existentes e reserva recursos através das ordens regulares. Pedidos parcialmente atendidos são aceitos e notificados; zero atendimento é rejeitado.

`blitzUntilTurn`, `supplySabotagedUntilTurn`, `dilemmaAttackUntilTurn` e `dilemmaBuildingCredits` são campos opcionais validados em disco. Os dois últimos permanecem para compatibilidade de saves antigos. As cartas usam `CHOOSE_DILEMMA`; `activeDilemma` também pode conter `targetProvinceId` e `context`. `councilEffects` guarda efeitos com início, expiração, origem, modificadores e região opcional. `lastDilemmaId` evita repetição frequente. `authorityEarnedTurn` e `authorityEarnedThisTurn` registram o limite de ganhos militares. Consulte os custos, a economia escassa e o Conselho em [v1.01](V1_01.md).

`lastHumanActivityAt` é persistido por sala. Listagens fazem limpeza de entradas com 900000 ms de inatividade; arquivos ficam em `archived-rooms`. `GET /api/rooms/:code/DownloadSave` funciona em salas ativas ou arquivadas com `Authorization: Bearer TOKEN` e `X-Concordia-Player: PLAYER_ID` do anfitrião. A resposta é `CONCORDIA_SAVE_098` sem hashes de sessão. Um `resume` autenticado pode reabrir sala arquivada com as credenciais originais. O código WebSocket 4004 informa arquivamento e impede reconexão automática da aba AFK.

O manifesto `/api/audio-assets` inclui as músicas de 16 segundos. O mixer é local ao navegador, não participa do estado autoritativo.
