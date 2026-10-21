# Validação e balanceamento · v0.4

## Verificações

- `npm run build`: TypeScript e bundle de produção.
- `npm test`: 94 testes, incluindo as oito nações, recursos, logística sazonal, objetivos, privacidade, First-Ready, listagem de salas, persistência e reinício headless real.
- `npx tsx scripts/smoke-browser.ts`: três navegadores Chromium, fluxo de lobby público, cartas privadas, três entradas para declarar guerra, marcha por clique esquerdo/direito, cancelamento de seta/HUD, timer, reconexão, mapas, exportações, áudio sintetizado e viewport de celular.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` e formatação.

O smoke inicia seu próprio servidor em porta livre; os screenshots e downloads de diagnóstico ficam em `.local/`.

## Simulações

Duas sementes independentes, **100 partidas de seis bots por semente**, alternando mundo e teatros Europa/Américas/Ásia. Os arquétipos são distribuídos independentemente das nações para evitar vincular uma facção sempre à mesma personalidade. O corte interno é **60 rodadas**. Ele encerra apenas a coleta do simulador; partidas humanas não recebem limite nem vencedor artificial.

| Semente   | Dominação | Objetivo secreto | Sem vencedor no corte |
| --------- | --------: | ---------------: | --------------------: |
| 20261020  |        37 |               46 |                    17 |
| 314159265 |        35 |               49 |                    16 |

Total: **72 vitórias por dominação**, **95 por carta secreta** e **33 campanhas ainda sem vencedor no corte**.

Todas as rodadas validam integridade de batalhões, transporte/carga, guerras formais e exportação completa. Recursos, estações, crises e coalizões estão ativos no mesmo motor usado por humanos.

## Resultados por nação

| Nação         | Participações | Vitórias | Vitórias / participações |
| ------------- | ------------: | -------: | -----------------------: |
| `aurelia`     |           148 |        6 |                     4.1% |
| `ferro_norte` |           148 |       88 |                    59.5% |
| `vespera`     |           150 |       32 |                    21.3% |
| `sol_invicto` |           152 |        2 |                     1.3% |
| `kaldor`      |           152 |       10 |                     6.6% |
| `turan`       |           152 |        4 |                     2.6% |
| `sapiencia`   |           150 |       10 |                     6.7% |
| `veridia`     |           148 |       15 |                    10.1% |

**Ferro-Norte concentrou 88 das 167 vitórias (52,7%)**, um desequilíbrio observado que merece revisão em partidas humanas e futuras iterações de regras.

A taxa usa participações como denominador: cada partida tem seis competidores. Estes resultados não demonstram equilíbrio para jogadores humanos. Os bots têm heurísticas simplificadas e não reproduzem negociação, uso humano de informação oculta ou todas as estratégias especializadas. As constantes numéricas pedidas para as facções foram preservadas; as tabelas registram os resultados observados sem corrigir vencedores depois da resolução.

## Reprodução

```sh
npx tsx scripts/simulate-balance.ts --games=100 --seed=20261020 --max-turns=60 --output=.local/v4-main.json
npx tsx scripts/simulate-balance.ts --games=100 --seed=314159265 --max-turns=60 --output=.local/v4-holdout.json
```

Dados completos: [semente principal](balance/v4-seed-20261020.json) e [segunda semente](balance/v4-seed-314159265.json). Os resultados da [v0.3](BALANCE_V3.md) e [v0.2](BALANCE_V2.md) são históricos, com outras facções e condições de vitória.
