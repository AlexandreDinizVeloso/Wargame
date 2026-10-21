# Validação e balanceamento · v0.5

## Verificações

- `npm run build`: TypeScript e bundle de produção.
- `npm test`: 138 testes, com 44 cenários da v0.5, além de contratos, privacidade, três clientes WebSocket, migração e recuperação headless após SIGKILL.
- `npx tsx scripts/smoke-browser.ts`: três Chromium, fusão/divisão instantâneas e nova marcha no mesmo planejamento, troca de líder, seis cartões de edifício, construção de quartel, pesquisa de doutrina, cerco sem ocupação na chegada e conclusão na rodada seguinte. Também verifica salas públicas, cartas privadas, guerra, timer, reconexão, mapas, downloads e celular.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, formatação e `git diff --check`.

A migração foi exercitada sobre sete salas locais v0.4, com 27 jogadores e dez sessões. A cópia `.v4-backup` é criada antes de qualquer gravação v0.5. Arquivos de sessões e telemetria humana ficam fora do Git.

## Telemetria fornecida: rodada 19

O JSON tem 19 rodadas. A batalha naval no Báltico, rodada 7, registra `cavalryModifier:1.4`, apesar de `naval:true`. A v0.5 passa a validar fórmula e relatório navais, com modificadores terrestres sempre neutros. Esse campo incorreto no relatório antigo, isoladamente, não prova que a fórmula v0.4 multiplicou o poder por cavalaria.

O estado final não contém terrestre solto em zona marítima. As duas movimentações terrestres para o Mediterrâneo nas rodadas 12/14 podem corresponder a embarque; o histórico não guarda posições/vínculos de todos os batalhões a cada rodada e não permite afirmar que foram travessias ilegais. A v0.5 rejeita terrestres sem vínculo/capacidade naval e recuos terrestres para o mar independentemente desse diagnóstico.

O maior batalhão final tem 11 unidades e o maior tesouro final é 202,15. Esse arquivo não sustenta uma alegação de 70 tropas numa única formação ou de milhares de ouro. Testes de economia usam cenários sintéticos; os números abaixo vêm de novas simulações.

## Simulações

300 partidas, seis bots, alternando mapa mundial e Europa/Américas/Ásia. Arquétipos e nações variam independentemente. O corte encerra apenas a coleta; partidas humanas continuam sem limite ou resultado artificial.

| Semente   | Partidas | Corte | Dominação | Carta | Sem vencedor no corte |
| --------- | -------: | ----: | --------: | ----: | --------------------: |
| 20261021  |      200 |    60 |        48 |    19 |                   133 |
| 314159265 |      100 |    80 |        34 |    17 |                    49 |

Total: **82 por dominação**, **36 por carta** e **182 sem vencedor no corte**. Foram concluídos 40.746 cercos e desbloqueadas 19.440 doutrinas.

Toda rodada verifica snapshots, slots, composição, carga e capacidade naval, modificadores de batalhas navais, guerras formais e exportação integral. Os bots pesquisam doutrinas e preservam sítios em andamento. A negociação busca cessões; Aurélia pode buscar súditos elegíveis para Pax.

## Limites observados

**O balanceamento ainda exige ajustes.** Os custos e percentuais solicitados foram implementados; eles não garantem o teto de 70 tropas até a rodada 15. O pico por nação (somando formações) foi ≥70 em 60 das 300 partidas; máximo 102. Não foi introduzido um limite oculto de tropas. A renda de saque de Ferro-Norte e a distribuição de exércitos por várias cidades ainda favorecem crescimento.

O mapa mundial teve apenas 9 vitórias em 150 partidas nos cortes. Cercos, requisitos proporcionais e controle direto prolongaram essas campanhas. Estes cortes não medem duração em minutos de partidas humanas.

| Nação         | Participações | Vitórias | Vitórias / participações |
| ------------- | ------------: | -------: | -----------------------: |
| `aurelia`     |           224 |        3 |                     1.3% |
| `ferro_norte` |           224 |       67 |                    29.9% |
| `vespera`     |           225 |       25 |                    11.1% |
| `sol_invicto` |           226 |        5 |                     2.2% |
| `kaldor`      |           226 |        4 |                     1.8% |
| `turan`       |           226 |        1 |                     0.4% |
| `sapiencia`   |           225 |        6 |                     2.7% |
| `veridia`     |           224 |        7 |                     3.1% |

Ferro-Norte continua concentrando vitórias; as heurísticas dos bots também limitam nações que dependem de diplomacia ou composição especializada. Esses dados validam execução e registram desequilíbrios, sem demonstrar equilíbrio para humanos.

## Reprodução

```sh
npx tsx scripts/simulate-balance.ts --games=200 --seed=20261021 --max-turns=60 --output=.local/v5-main.json
npx tsx scripts/simulate-balance.ts --games=100 --seed=314159265 --max-turns=80 --output=.local/v5-holdout.json
```

Dados completos: [semente principal](balance/v5-seed-20261021.json) e [segunda semente](balance/v5-seed-314159265.json). Comparação histórica: [v0.4](BALANCE_V4.md), [v0.3](BALANCE_V3.md), [v0.2](BALANCE_V2.md).
