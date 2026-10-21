# Validação e balanceamento — v0.3

> Arquivo histórico da v0.3. Para a versão atual, consulte [regras v0.4](REGRAS_V4.md) e [validação v0.4](BALANCE.md).

## O que foi executado

Duas baterias finais de **200 partidas completas**, seis bots por partida, com as regras finais da v0.3. O cenário padrão alterna 100 teatros rápidos, com até 20 rodadas, e 100 campanhas mundiais, com até 40. Os teatros rápidos se alternam entre Europa, Américas e Ásia.

Militarist, Merchant, Theocrat e Diplomat têm prioridades distintas. A composição de seis vagas é rotacionada entre partidas, assim como as oito nações. Em cada bateria, cada arquétipo ocupa 300 das 1.200 vagas; cada nação ocupa 150.

As sementes individuais derivam da semente da bateria e do índice. O simulador usa o motor real, sem navegador, rede ou relógio global. Verifica recursos e formações válidos, reciprocidade/capacidade de transporte, existência de guerra formal em cada batalha contra outro reino e integridade do histórico exportável.

## Resultados finais

Medições em 20/10/2026, após as correções e os testes de regressão da v0.3:

| Resultado                     | Semente 20261020 | Semente 314159265 |
| ----------------------------- | ---------------: | ----------------: |
| Dominação Total               |     0 · **0,0%** |      3 · **1,5%** |
| Pacificação Imperial          |  114 · **57,0%** |   129 · **64,5%** |
| Limite sem vencedor           |   86 · **43,0%** |    68 · **34,0%** |
| Dissolução de todos os reinos |                0 |                 0 |

**Essas distribuições não demonstram equilíbrio entre as duas vitórias.** A pacificação imperial predomina, a dominação é rara e há muitas campanhas sem vencedor no limite. Os resultados foram preservados; não se atribuiu vitória por pontuação a uma campanha inconclusa e não se alteraram os limiares de 75%/15%, 60% ou cinco rodadas para produzir uma tabela mais uniforme.

A faixa de 10–45% da v0.2 se referia aos quatro legados antigos. Ela não foi reutilizada como critério para as duas condições novas. Os dados históricos permanecem em [BALANCE_V2.md](BALANCE_V2.md).

| Média por partida                | 20261020 | 314159265 |
| -------------------------------- | -------: | --------: |
| Rodadas                          |   20,875 |    20,145 |
| Batalhas                         |   67,970 |    68,290 |
| Recuos e repatriações            |   63,940 |    62,960 |
| Aniquilações                     |   47,015 |    46,715 |
| Revoltas                         |   34,685 |    35,290 |
| Guerras declaradas               |    5,925 |     5,795 |
| Tratados efetivamente concluídos |    5,335 |     5,205 |
| Batalhas navais                  |    1,105 |     1,285 |
| Movimentos de formações          |  170,515 |   168,525 |
| Unidades perdidas por suprimento |   27,030 |    25,700 |

Recuos contam eventos, incluindo reagrupamento de isolados e repatriação por tratado/revolta. Batalhas excluem cercos interrompidos. Aniquilações incluem grupos sem moral e sem rota de fuga. Tratados contam eventos `PEACE`; uma guerra encerrada pela dissolução de um lado não é contada como tratado. Suprimento contabiliza unidades perdidas.

### Escopo e arquétipos

| Partidas com vencedor | 20261020 | 314159265 |
| --------------------- | -------: | --------: |
| Rápido, de 100        |       51 |        67 |
| Mundial, de 100       |       63 |        65 |

| Arquétipo vencedor | 20261020 | 314159265 |
| ------------------ | -------: | --------: |
| Militarist         |        0 |         2 |
| Merchant           |       30 |        35 |
| Theocrat           |        0 |         5 |
| Diplomat           |       84 |        90 |

Essas heurísticas não reproduzem negociação humana. Os bots diplomáticos tendem a formar a Dieta, enquanto os militares têm dificuldade de sustentar ocupações e campanhas de vários continentes. A média de revoltas também evidencia o peso de desgaste e integração sobre uma estratégia agressiva. É necessário medir partidas com pessoas e estudar decisões dos bots antes de concluir que os caminhos têm força comparável.

## Regressões detectadas e corrigidas

As baterias exploratórias e os testes adicionais identificaram:

- Guerras que continuavam ativas depois da dissolução de um lado, bloqueando a paz mundial.
- Desarmamento que podia deixar formações vazias, incompatíveis com um snapshot válido.
- Frotas/forças já estacionadas na mesma região sem iniciar seu combate após uma declaração.
- Recuados que recebiam recuperação de moral como se estivessem parados.
- Reagrupamento de frota isolada que não atualizava a posição do batalhão embarcado.

Cada caso recebeu teste. A semente `3027052489`, partida de índice 60 na primeira bateria, reproduziu o problema da carga naval na rodada 15; a execução final passou com o vínculo e a posição preservados.

## Duas vitórias verificadas

Além da amostra, testes determinísticos verificam os limites de dominação, inclusive um rival acima de 15%, submissão de todos os rivais e encerramento real com estado exportável. A validação do navegador joga uma sala com três participantes até uma vitória imperial na quinta rodada, confirma o vencedor e baixa os relatórios finais JSON/TXT.

A suíte também cobre composição, moral, artilharia exposta, cerco, marinha, bloqueio, desgaste, paz, religião, eleição, Édito, privacidade, migração v2 e recuperação após `SIGKILL` em um processo separado.

## Reproduzir

```sh
npm run build
npm test
npx tsx scripts/simulate-balance.ts --output=.local/v3-main.json
npx tsx scripts/simulate-balance.ts --seed=314159265 --output=.local/v3-additional.json
```

`--mode=quick`, `--mode=campaign` e `--games=` permitem medir escopos separados. A ausência de vencedor é um resultado válido; o script retorna erro para invariantes quebradas, não para uma taxa desfavorável. O teste do simulador compara duas execuções da mesma semente para verificar determinismo.

Os resumos completos, constantes e todas as sementes/vencedores/métricas individuais estão em [v3-seed-20261020.json](balance/v3-seed-20261020.json) e [v3-seed-314159265.json](balance/v3-seed-314159265.json). Fórmulas e escolhas de implementação: [REGRAS_V3.md](REGRAS_V3.md).
