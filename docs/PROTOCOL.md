# Protocolo 2 — servidor headless e cliente Godot

`shared/` e `server/` não importam `src/`, React, `window` ou `document`. A aplicação web usa o mesmo contrato que um cliente nativo futuro. O modo headless não inicia Vite e não depende da existência de uma interface compilada.

```sh
npm ci
npm run server:headless
```

O servidor usa a porta 3000 por padrão. Um cliente Godot pode usar `WebSocketPeer`, enviar texto JSON e consumir o estado/eventos. A UI e o renderer Godot ainda precisam ser construídos; o motor e os contratos já estão separados para essa substituição.

## Transporte

| Rota          | Uso                                                         |
| ------------- | ----------------------------------------------------------- |
| `/ws`         | WebSocket de texto, mensagens JSON UTF-8                    |
| `/api/health` | Disponibilidade, versão da aplicação e `protocolVersion: 2` |
| `/api/schema` | Versão, nomes de ordens e os 32 registros estáticos do mapa |

O limite de mensagem é 16 KiB e há controle de frequência por conexão. Clientes de navegador devem usar a mesma origem do servidor; cliente nativo sem cabeçalho Origin é aceito. HTTPS com proxy reverso utiliza WSS.

## Entrar em uma sala

Criar:

```json
{ "type": "create", "name": "Estrategista", "mode": "campaign", "objective": "concord" }
```

Entrar em uma sala existente, usando um código recebido do anfitrião:

```json
{ "type": "join", "name": "Convidado", "code": "A3F021", "objective": "prosperity" }
```

`mode` é `quick` ou `campaign`; `objective` é `conquest`, `prosperity`, `concord` ou `faith`. `demo: true` em `create` acrescenta três bots, inicia a partida e remove o prazo de rodada.

O servidor responde com `type: joined`, `code`, `playerId` e `token`. Guarde esses campos no armazenamento privado do cliente. O token é uma credencial de reconexão, não deve aparecer em chat, logs ou URLs. Em seguida chega `type: state` com o campo `state` do tipo `GameView`.

Para recuperar a sessão, envie um objeto com `type: resume` e os mesmos `code`, `playerId` e `token`. O servidor recupera o vínculo salvo em disco. Abrir a mesma sessão em outra conexão encerra a anterior com código 4001. `{"type":"leave"}` desconecta da sala; o cliente web remove a sessão ativa da aba ao sair.

## Comandos

Todos os comandos de jogo usam o envelope `type: command`, campo `command`. Exemplos completos:

```json
{
  "type": "command",
  "command": {
    "type": "SUBMIT_ORDER",
    "order": { "type": "MOVE_ATTACK", "fromProvinceId": "p16", "toProvinceId": "p8", "troops": 5 }
  }
}
```

```json
{
  "type": "command",
  "command": {
    "type": "SUBMIT_ORDER",
    "order": { "type": "RECRUIT", "provinceId": "p16", "amount": 3, "isMercenary": true }
  }
}
```

```json
{
  "type": "command",
  "command": {
    "type": "SUBMIT_ORDER",
    "order": { "type": "DIPLOMACY", "action": "EMBARGO", "targetRealmId": "A3F021-p2" }
  }
}
```

| Comando            | Campos adicionais                                                             |
| ------------------ | ----------------------------------------------------------------------------- |
| `SUBMIT_ORDER`     | `order: PlayerOrder`                                                          |
| `CANCEL_ORDER`     | `key: string`, obtida pela província da ordem; `CONVERT` usa a província alvo |
| `READY`            | `ready: boolean`                                                              |
| `ANSWER_OFFER`     | `offerId: string`, `accept: boolean`                                          |
| `START_GAME`       | Somente anfitrião                                                             |
| `SET_MODE`         | `mode`, somente no lobby pelo anfitrião                                       |
| `SET_IDENTITY`     | `objective`, `doctrine: tolerant ou devout`, somente no lobby                 |
| `ADD_BOT`          | Somente anfitrião, no lobby                                                   |
| `REPLACE_WITH_BOT` | `playerId`, somente ausente e pelo anfitrião                                  |
| `CHAT`             | `text`, até 280 caracteres                                                    |

`PlayerOrder` é uma união discriminada por `type`:

| Ordem         | Campos                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| `MOVE_ATTACK` | `fromProvinceId`, `toProvinceId`, `troops` inteiro                         |
| `RECRUIT`     | `provinceId`, `amount` inteiro de 1–50, `isMercenary` opcional             |
| `TRAIN`       | `provinceId`                                                               |
| `PACIFY`      | `provinceId`                                                               |
| `CONVERT`     | `targetProvinceId`                                                         |
| `BUILD_FORT`  | `provinceId`                                                               |
| `DEVELOP`     | `provinceId`                                                               |
| `DIPLOMACY`   | `action`, `targetRealmId`, `amount` e `targetProvinceId` quando aplicáveis |

Ações diplomáticas: `PROPOSE_ALLIANCE`, `BREAK_ALLIANCE`, `DEMAND_TRIBUTE`, `EMBARGO`, `FUND_REBELS`, `MILITARY_ACCESS`, `SEND_SUBSIDY`. As duas ações monetárias usam `amount`; rebeldes também exigem `targetProvinceId`. Tributo usa `amount` como cobrança por rodada. Ofertas devem ser respondidas por `ANSWER_OFFER` do destinatário.

O servidor valida propriedade, adjacência, orçamento, reservas, fase, tratados, cerco, faixas e números finitos. Erro responde `type: error` e `message`; nenhuma mudança do comando rejeitado é confirmada. Nunca envie poderes, resultados de combate ou estados calculados pelo cliente.

## Estado recebido

O objeto `GameView` é JSON puro. Os principais campos são:

- `version: 2`, código, anfitrião, fase, turno, modo e prazo em milissegundos Unix ou `null`.
- `players`: tesouro, reservas, influência, fé estatal, status, quatro pontuações e `victoryProgress` 0–100.
- `provinces`: dados estáticos e runtime combinados. `training` é multiplicador **1,00–1,50**, não porcentagem. `religion`, `pacification`, `unrest`, `mercenaries` e `fortLevel` são dados explícitos.
- `relations`: confiança, aliança, guerra, trégua, beneficiários de acesso militar, emissores de embargo e tributo.
- `offers`, `stationedArmies` e `displacedArmies`: ofertas e tropas fora de seu território nativo, preservando o dono.
- `plannedOrders`: apenas ordens do jogador autenticado; adversários nunca recebem essa fila.
- `lastReport` e `reports`: último relatório e histórico das últimas oito resoluções.
- `victoryTargets`, `baseUpkeep`, `winnerId`, `winnerObjective`, `hegemonyLeaderId`.
- `paused`, `persistenceEnabled`, crônica e chat.

A semente privada, contador de IDs e filas adversárias não são enviados. IDs públicos não codificam a semente. `myOrders` contém uma projeção de compatibilidade para o cliente v1; novos clientes devem consumir `plannedOrders`. Envelopes v1 ainda são traduzidos no transporte, mantendo o motor em ordens v2.

## Eventos para renderização

`TurnResolutionReport` contém `battles`, `retreats`, `stackwipes`, `conversions`, `rebellions`, `diplomaticChanges`, `attritionLosses` e `hegemonyAlerts`.

Cada batalha informa província, lados, vencedor, tropas iniciais, poderes, treinamento, terreno, fortificação, bônus religioso e de coalizão, baixas, moral antes/depois e destino de recuo. Use os eventos para animar movimentos e apresentar relatórios. Autoria de financiamento encoberto é removida para os outros jogadores.

Polígonos são strings de pares `x,y` separados por espaços, com seis vértices no tabuleiro atual. Um cliente Godot pode convertê-los em `PackedVector2Array` e usar `Polygon2D` ou desenho próprio. Centro, vizinhos e terreno não dependem de SVG, CSS ou coordenadas de tela do navegador.

## Motor puro e recuperação

`executeCommand(estado, jogador, comando, agora)` devolve um novo estado e preserva o original, inclusive em rejeições. Semente, IDs e tempo são dados explícitos. O núcleo não usa relógio global, RNG global, rede, arquivos ou DOM. O transporte fornece a hora; `resolveTurn` usa apenas o estado e a hora recebidos, sem I/O.

`rooms.ts` e `storage.ts` cuidam de sockets e persistência fora do núcleo. O snapshot guarda hashes SHA-256 dos tokens, pausa partidas carregadas e restaura vínculos. Há teste que encerra um servidor headless com `SIGKILL`, inicia outro processo e recupera turno, províncias, ouro e relatório pelo mesmo token.
