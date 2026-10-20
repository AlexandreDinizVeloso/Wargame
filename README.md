# Concórdia — Atlas de Impérios

Protótipo de Grand Strategy para **3–8 participantes**, com ordens simultâneas, economia, religião, diplomacia e exércitos governados por moral e suprimento. Cenário europeu por volta de 1550. Interface em português, HUD em tela cheia, mapa SVG e servidor autoritativo.

## Executar

Use Node.js **22.12+**; Node 24 foi verificado.

```sh
npm ci
npm run dev
```

O HTTP e o WebSocket `/ws` compartilham a porta **3000**. Todos os participantes abrem o endereço do **mesmo anfitrião** no navegador e entram com o código da sala. A demonstração cria uma partida com três bots e sem cronômetro.

Versão compilada:

```sh
npm run build
npm start
```

Servidor sem frontend, para clientes próprios, ferramentas de simulação ou futura Godot:

```sh
npm run server:headless
```

Esse modo disponibiliza `/ws`, `/api/health` e `/api/schema`, sem iniciar o Vite ou servir a interface. Não exige compilar o frontend. Não há banco externo ou chave de API obrigatória.

| Configuração opcional | Padrão                                                           |
| --------------------- | ---------------------------------------------------------------- |
| `PORT`                | `3000`                                                           |
| `HOST`                | `0.0.0.0`; use `::` para escutar IPv6                            |
| `ROOMS_STATE_FILE`    | `.local/rooms-state.json`, relativo à raiz do projeto por padrão |

No ambiente cloud com cache pessoal não gravável, use `npm ci --include=dev --cache /workspace/.cache/npm --no-audit --no-fund`.

## Jogar e navegar

- **Clique esquerdo:** selecionar província e abrir a gaveta contextual.
- **Scroll:** zoom entre 0,8× e 3,5×, ancorado no cursor.
- **Arraste com botão direito, meio ou Espaço + esquerdo:** mover a câmera.
- **Clique direito numa vizinha:** preparar marcha a partir da província com suas tropas que estiver selecionada.
- **1–5:** mapas político, religioso, economia/suprimento, diplomático e pacificação/revolta.
- **Esc:** fechar a janela ou gaveta atual.

Prepare uma ordem por província, acompanhe o orçamento reservado e confirme a rodada. Ordens planejadas podem ser substituídas ou canceladas antes da confirmação. Mercenários e ações diplomáticas têm efeito imediato. O relatório inferior registra baixas, modificadores, recuos, aniquilações, conversões, revoltas e atrito.

Rápido: até **20 rodadas × 3 minutos**, limite de planejamento de 60 minutos. Campanha: até **40 × 7,5 minutos**, limite de 5 horas. Confirmar cedo e alcançar um legado encurta a partida; esses limites não garantem uma duração mínima.

## Salvamento automático

O servidor salva salas, ordens, tesouros, relatórios e hashes de autenticação das sessões em `.local/rooms-state.json`. A escrita usa arquivo temporário, sincronização e troca atômica, mantendo também um `.bak`. O salvamento ocorre nas alterações da sala e após cada resolução, antes de enviar o novo estado ao cliente.

Ao reiniciar, partidas em andamento ficam **pausadas até alguém reconectar**. Quando todos desconectam, o relógio também pausa. Mantenha a aba/sessão do navegador para recuperar seu jogador; o código da sala sozinho não substitui o token de reconexão. O anfitrião pode substituir um ausente por bot, encerrando a sessão dele naquela campanha.

O diretório `.local/` contém dados privados e não entra no Git. Preserve-o ao atualizar a aplicação. Um servidor em hospedagem com disco efêmero precisa de volume persistente para manter esses arquivos entre substituições de máquina. Não execute dois servidores escrevendo no mesmo arquivo.

## Verificar

```sh
npm run build
npm test
npm run simulate:balance
```

Os testes cobrem regras, contratos, independência do frontend, multiplayer, sessão, corrupção/backup e queda real de um processo headless com `SIGKILL`, seguida de recuperação em outro processo.

O simulador executa **200 partidas de seis bots**, com quatro arquétipos e até 40 rodadas. Imprime taxas de vitória e médias de duração, batalhas, recuos, aniquilações e revoltas; retorna erro se alguma vitória ficar fora de 10–45%.

```sh
npx tsx scripts/simulate-balance.ts --output=.local/balance-results.json
```

Com o servidor iniciado e Chromium instalado:

```sh
npm run test:browser
```

Use `CHROMIUM_PATH` para outro executável e `BASE_URL` para outro endereço de teste. O script verifica HUD fixa, modos, câmera, marcha tática, economia, diplomacia, relatórios, reconexão, celular e três contextos de navegador. Capturas ficam em `.local/screenshots/`.

## Arquitetura e guias

| Arquivo                          | Responsabilidade                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `shared/types.ts`                | Ordens, comandos, estado e eventos JSON; compatibilidade com envelopes v1             |
| `shared/map.ts`                  | Dados estáticos, polígonos e terrenos agnósticos do cliente                           |
| `shared/rules.ts`                | Fórmulas e custos puros compartilhados                                                |
| `server/game.ts`                 | Estado inicial, comandos, planejamento, resolução, bots e constantes de balanceamento |
| `server/combat.ts`               | Força, terreno, fortalezas, baixas e recuo                                            |
| `server/diplomacy.ts`            | Pactos, acesso, tributo, embargo, rebeldes e subsídios                                |
| `server/rooms.ts` / `storage.ts` | Transporte, sessões, relógio e persistência atômica                                   |
| `src/`                           | Cliente React com HUD e câmera; substituível por outro cliente                        |

Leia [regras e decisões matemáticas](docs/REGRAS_V2.md), [protocolo e integração headless/Godot](docs/PROTOCOL.md), [resultados de balanceamento](docs/BALANCE.md), [conceito e próximos passos](docs/CONCEITO.md) e [rede sem IPv4 público](docs/REDE.md).

O mapa ainda é um tabuleiro hexagonal esquemático de 32 regiões reais. Geografia, fronteiras e crenças são simplificadas. As simulações medem os bots implementados; equilíbrio e duração com pessoas ainda precisam de partidas reais.
