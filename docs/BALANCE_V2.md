# Balanceamento reproduzível — versão 0.2

## Método

O simulador executa o motor real, sem navegador, rede ou relógio global. Cada partida usa seis bots, modo Campanha e limite de 40 rodadas. Os quatro arquétipos são Militarist, Merchant, Theocrat e Diplomat. As posições e os arquétipos repetidos são alternados entre partidas; cada arquétipo ocupa 300 das 1.200 vagas de cada bateria.

As sementes de partida são derivadas da semente da bateria e do índice. Tanto a iniciativa quanto os reagrupamentos usam o gerador determinístico do jogo. Os bots têm prioridades diferentes, mas qualquer um pode vencer por qualquer legado.

Durante cada resolução, o script verifica recursos finitos e não negativos, quantidade e composição de tropas, moral e limites de treinamento. Uma partida que não terminar em até 40 rodadas interrompe a execução. O comando termina com código 1 se houver empate sem vencedor ou condição fora da faixa de 10–45%.

## Resultados finais

Executados em 20/10/2026, com as regras finais desta versão. Cada coluna corresponde a **200 partidas completas**:

| Condição          | Semente 20261020 | Semente adicional 314159265 |
| ----------------- | ---------------: | --------------------------: |
| Supremacia        |   53 · **26,5%** |              57 · **28,5%** |
| Prosperidade      |   52 · **26,0%** |              57 · **28,5%** |
| Concórdia         |   67 · **33,5%** |              64 · **32,0%** |
| Legado espiritual |   28 · **14,0%** |              22 · **11,0%** |
| Sem vencedor      |                0 |                           0 |

Todas as condições ficaram entre 10% e 45% nas duas baterias. A semente adicional foi executada sem reajustar as constantes entre as duas medições finais.

| Média por partida              | 20261020 | 314159265 |
| ------------------------------ | -------: | --------: |
| Rodadas                        |   23,615 |    24,380 |
| Batalhas                       |   89,170 |    91,750 |
| Eventos de recuo               |   46,330 |    47,505 |
| Aniquilações                   |   44,190 |    45,695 |
| Revoltas                       |    2,000 |     1,915 |
| Tropas perdidas por suprimento |    2,715 |     2,905 |

Tentativas bloqueadas por falta de tropas de cerco não contam como batalhas. Recuos contam eventos estruturados, incluindo retorno de formações isoladas e repatriação por tratado; uma batalha pode gerar eventos para mais de uma formação. Aniquilações incluem formações isoladas sem moral e sem saída, além das verificadas durante batalhas. O atrito contabiliza unidades, não quantidade de eventos.

Na primeira bateria, as partidas duraram de 15 a 40 rodadas; uma chegou ao limite. Na segunda, de 15 a 37. A duração é medida em rodadas de bots, não em minutos de pessoas negociando.

### Vitórias por arquétipo

| Arquétipo  | 20261020 | 314159265 |
| ---------- | -------: | --------: |
| Militarist |       81 |        89 |
| Merchant   |       26 |        23 |
| Theocrat   |       34 |        31 |
| Diplomat   |       59 |        57 |

Esses resultados não significam igualdade de força entre estratégias humanas. O militarista permanece o bot mais vitorioso; o critério solicitado foi a distribuição entre **condições de vitória**. Os quatro bots usam heurísticas locais e não simulam negociação humana, blefes ou planejamento de longo prazo.

## Ajustes de constantes

A primeira medição com metas provisórias produziu 97% de vitórias por Supremacia e 3% por Prosperidade, sem vitórias nos outros caminhos. A calibração alterou metas e pesos de pontuação, preservando as fórmulas pedidas de imposto, suprimento, manutenção, poderes de combate e hegemonia.

As constantes estão em `BALANCE`, em `server/game.ts`:

| Constante                                                          | Valor final       |
| ------------------------------------------------------------------ | ----------------- |
| Metas Campanha: Supremacia / Prosperidade / Concórdia / Espiritual | 30 / 35 / 14 / 16 |
| Metas Rápido                                                       | 22 / 26 / 11 / 14 |
| Manutenção base / tesouro inicial                                  | 0,35 / 50         |
| Supremacia por batalha vencida                                     | 0,35              |
| Divisor de comércio acumulado em Prosperidade                      | 18                |
| Espiritual por província estável / conversão                       | 1,5 / 1,2         |
| Concórdia por rodada de paz / aliança ativa                        | 0,6 / 1,5         |

As duas baterias medem Campanha, conforme o cenário de até 40 rodadas solicitado. O modo Rápido e sessões humanas precisam de suas próprias medições antes de concluir que têm o mesmo equilíbrio. A regra dos 75% permite reação à liderança, mas sua utilidade em negociação depende de partidas com pessoas.

## Reproduzir

```sh
npm run build
npm test
npx tsx scripts/simulate-balance.ts --output=.local/balance-main.json
npx tsx scripts/simulate-balance.ts --seed=314159265 --output=.local/balance-additional.json
```

Sem argumentos, o simulador executa as 200 partidas pedidas. `--games=` permite outra quantidade e `--seed=` permite repetir ou explorar sementes. O teste automatizado também compara duas execuções completas de oito partidas para detectar perda de determinismo.

Os resultados completos, com constantes, sementes individuais, vencedores e métricas de cada partida, estão em [seed-20261020.json](balance/seed-20261020.json) e [seed-314159265.json](balance/seed-314159265.json). As fórmulas e as escolhas de arredondamento estão em [REGRAS_V2.md](REGRAS_V2.md).
