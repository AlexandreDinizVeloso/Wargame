# Concórdia — Atlas de Impérios

Protótipo multiplayer de estratégia para **3–8 jogadores**, inspirado na acessibilidade de Risk/War e nas decisões de economia, diplomacia e religião de Europa Universalis. Interface em português, cenário europeu por volta de 1550 e ordens simultâneas.

**Rápido:** até 20 rodadas de 3 minutos, com alvo de aproximadamente 60 minutos. **Campanha:** até 40 rodadas de 6 minutos, alvo de 3–5 horas, com suprimento e desgaste de guerra. Essas durações são metas; confirmar ordens adianta rodadas e uma vitória pode encerrar a partida antes. Equilíbrio e duração ainda precisam de testes com pessoas.

## Começar

Requisito: Node.js 22.12 ou superior; Node 24 foi usado no desenvolvimento. Os comandos abaixo funcionam em Linux, macOS e Windows.

```sh
npm ci
npm run dev
```

O servidor escuta na porta **3000** em todas as interfaces IPv4. Abra o endereço do computador anfitrião nessa porta. Na tela inicial, use **Jogar demonstração** para testar contra três bots ou **Criar uma sala** para convidar outras pessoas. Cada sala precisa de 3 participantes, somando pessoas e bots, e comporta até 8.

Todos precisam abrir **o mesmo servidor**. O código da sala só identifica a partida dentro desse servidor. Cada aba mantém sua própria sessão e pode reconectar após recarregar.

Para servir a versão compilada:

```sh
npm run build
npm start
```

Cliente e WebSocket compartilham a porta 3000. Não há serviço de banco, chave de API ou cadastro obrigatório. `PORT` e `HOST` são configurações opcionais; por padrão são `3000` e `0.0.0.0`.

No ambiente cloud com cache pessoal não gravável:

```sh
npm ci --include=dev --cache /workspace/.cache/npm --no-audit --no-fund
```

## Como experimentar

1. Abra a demonstração, selecione Porto e prepare um treinamento.
2. Selecione Lisboa e prepare outra ordem, se houver recursos. Uma província recebe uma ordem por rodada; substituir a ordem libera a reserva anterior.
3. Confirme as ordens. Os bots planejam e a rodada resolve no servidor.
4. Em **Diplomacia**, proponha uma aliança e use o conselho público para conversar.
5. Em **Crônica e legados**, acompanhe batalhas e pontuações. O manual **Como jogar** detalha os custos e fórmulas usados.

Na demonstração não há cronômetro: você escolhe quando resolver. Nas salas normais, a rodada resolve quando todos confirmam ou o tempo acaba; ordens já preparadas são executadas mesmo se o jogador não confirmar a tempo. Sem ordens, suas tropas permanecem onde estão.

## O que já funciona

- Sala de 3–8 participantes, bots, identidade por aba, reconexão com token e substituição de ausentes pelo anfitrião.
- Mapa SVG de 32 regiões com seleção, camadas política/religiosa, zoom e rotas de marcha.
- Recrutamento, reservas humanas, moral, treinamento, guarnições e combate com defesa favorecida.
- Economia por província, manutenção, desenvolvimento e orçamento reservado por ordens.
- Alianças aceitas pelos dois lados, confiança, rompimento, penalidade e trégua.
- Crenças locais, política tolerante/confessional, missões, pacificação e rebelião.
- Vitória por supremacia, prosperidade, concórdia ou legado espiritual.
- Campanha com capacidade de suprimento e desgaste; chat e crônica compartilhados.

## Limites deste protótipo

O mapa usa nomes reais e uma grade hexagonal **esquemática**; fronteiras e vizinhanças não são geograficamente fiéis. Reinos e crenças estão simplificados para explorar as regras. Há assimetrias e a pontuação dos objetivos ainda não foi balanceada. Os bots são heurísticos e não constituem um adversário estratégico completo.

**Partidas ficam na memória do servidor. Reiniciá-lo perde salas e sessões.** Não há salvamento de campanha, contas, partidas ranqueadas, navegação naval ou tratados comerciais. Estes dois primeiros pontos — mapa geográfico e salvamento — são prioridades antes de campanhas longas com amigos. Quem perde todas as províncias acompanha como espectador; uma regra de vassalagem é uma decisão aberta no brainstorm.

Os clientes não escolhem resultados, não podem emitir ordens por outro reino e não recebem ordens adversárias antes da resolução. O protótipo foi pensado para partidas privadas; uma versão pública também precisará de hospedagem com HTTPS, persistência e gestão de contas/salas.

## Validação

```sh
npm run build
npm test
```

O conjunto de testes cobre regras, sigilo das ordens, custos, alianças, religião, resolução, uma partida completa com 8 bots e uma partida por WebSocket com 3 clientes e reconexão.

Há também uma verificação funcional no Chromium. Com o servidor iniciado:

```sh
npm run test:browser
```

Ela usa o Chromium instalado em `/usr/bin/chromium`. Defina `CHROMIUM_PATH` para outro executável e `BASE_URL` para outro endereço. Verifica ações pela interface, reconexão, chat, diplomacia, largura de celular e três contextos de navegador jogando juntos; salva capturas em `.local/screenshots/`. Chromium é opcional para desenvolver e jogar.

## Organização

| Caminho           | Responsabilidade                                 |
| ----------------- | ------------------------------------------------ |
| `shared/types.ts` | Contratos, ações, custos, economia e objetivos   |
| `shared/map.ts`   | Regiões e grafo de vizinhanças                   |
| `server/game.ts`  | Regras e resolução das rodadas                   |
| `server/rooms.ts` | Salas, sessões, WebSocket e ordens privadas      |
| `server/index.ts` | HTTP, arquivos de produção e integração com Vite |
| `src/`            | Interface React, mapa SVG e conexão              |
| `tests/`          | Regras e integração multiplayer                  |

Leia o [brainstorm e proposta de jogo](docs/CONCEITO.md) e o [guia para jogar sem IPv4 público](docs/REDE.md).

Documentação das ferramentas: [React](https://react.dev/learn), [TypeScript](https://www.typescriptlang.org/docs/), [Vite](https://vite.dev/guide/), [Node.js](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) e [ws](https://github.com/websockets/ws).
