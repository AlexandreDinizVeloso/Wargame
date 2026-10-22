# Validação e balanceamento · v0.6

## Verificações

- `npm run build`: TypeScript e bundle de produção.
- `npm test`: **184 testes**, incluindo 46 cenários da v0.6, contratos, privacidade, WebSocket, persistência e recuperação headless após SIGKILL.
- `npx tsx scripts/smoke-browser.ts`: três Chromium, edição do próprio nome, escolha e troca de nações entre bots, pacto inicial, estreitos, fretamento pago Portugal–Brasil, foco de câmera, aceitar/recusar propostas sucessivas na mesma rodada, Defesa da Pátria, continuação livre após vitória, salas públicas, cartas privadas, guerra, First-Ready, reconexão, cidades, líderes, doutrinas, cerco, exportações e celular.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, formatação e `git diff --check`.

A migração foi exercitada sobre **cinco salas v0.5, 21 jogadores e seis sessões**. Tesouros, tropas, posições e hashes de sessão foram comparados antes/depois. O servidor gravou snapshot 6 e reiniciou com as mesmas salas/sessões. A cópia `.v5-backup` preserva o arquivo original. Sessões e arquivos humanos brutos ficam fora do Git.

## Diagnóstico da rodada 159

A telemetria v0.5 enviada contém 159 rodadas e uma vitória de bot por Pax com sequência de objetivo 2. A v0.6 bloqueia cartas de bots por padrão e exige três rodadas completas, avisando nas duas primeiras.

Véspera terminou com **4.015,06 ouro**, sem terras legais nem exércitos/frotas, ainda controlando ocupações na França e Itália. Essas cidades tinham infraestrutura — portanto, o arquivo não demonstra literalmente ausência de qualquer construção. O problema confirmado é a continuidade de renda após eliminação, somada a dízimos calculados sobre terras neutras: a receita final de Véspera incluía 13,5 de dízimo, e a inicial já tinha 19,5. Aurélia chegou a 248 tropas terrestres e Verídia a 173.

Na reconstrução de teste, o estado final foi migrado e reaberto na rodada **160**, com semente de teste **123**, identificador sequencial **100000** e cinco resoluções novas. O relatório exportado não contém a semente original; isso valida a continuação sob novas regras, sem reproduzir as decisões aleatórias da partida real.

| Nação   | Tropas antes | Tropas após cinco rodadas | Resultado econômico                                                  |
| ------- | -----------: | ------------------------: | -------------------------------------------------------------------- |
| Véspera |            0 |                         0 | Renda e dízimos zerados; saldo histórico de 4.015,06 preservado      |
| Aurélia |          248 |                        37 | Saldo inicial sob v0.6 de −449,03/rodada; final +44,79 com limite 72 |
| Verídia |          173 |                        28 | Manutenção e deserção reduziram o excesso; limite final 47           |

A continuação permaneceu em planejamento, sem nova vitória secreta de bot. Não houve confisco retroativo de tesouro. O ensaio permite perdas militares por batalha, atrito e deserção; não atribui toda a redução a uma única causa.

## Simulações de partidas novas

Duas séries independentes, **100 partidas cada**, seis bots, alternando mundo e teatros rápidos Europa/Américas/Ásia. Corte interno de **159 rodadas**. Nações e arquétipos variam independentemente; não há resultado artificial por pontuação. Bots não podem vencer por carta nestas duas séries.

| Semente   | Partidas | Dominação | Carta | Sem vencedor no corte | Pico terrestre/nacional | Maior ouro sem melhorias econômicas |
| --------- | -------: | --------: | ----: | --------------------: | ----------------------: | ----------------------------------: |
| 20261022  |      100 |        58 |     0 |                    42 |                      66 |                              147,35 |
| 314159265 |      100 |        64 |     0 |                    36 |                      78 |                              187,03 |

Total: **122 vitórias por dominação**, **zero por carta de bot** e **78 partidas sem vencedor no corte**. Foram concluídos **28.538 cercos**, desbloqueadas **12.269 doutrinas** e registradas **10.409 deserções**, **3.071 ocorrências de cercamento** e **28.263 travessias marítimas**, incluindo pontes gratuitas e fretamentos.

“Sem melhorias econômicas” significa não controlar mercado, fundição nem porto acima do nível 1; o porto inicial não é contado como investimento novo. O simulador interrompe com erro caso observe **200 tropas terrestres por nação** ou **1.000 ouro sem essas melhorias**. São verificações desta amostra, não tetos ocultos nas partidas humanas. O limite militar é econômico: o maior excesso observado foi 26 unidades terrestres acima da capacidade, cobrado com manutenção ampliada.

Uma terceira série de **20 campanhas mundiais**, semente **159352879**, corte 159 e `--allow-bot-secrets`, terminou com sete dominações e 13 partidas sem vencedor. Não ocorreu vitória secreta nessa amostra; um teste determinístico comprova que a mesma condição válida de carta é bloqueada com a opção desligada e aceita com ela ligada. Pico de 48 tropas e 142,68 ouro sem melhorias econômicas.

Cada rodada verifica estado persistível, reservas limitadas, composição, slots, capacidade/carga naval, ausência de terrestres soltos no mar, modificadores navais neutros e guerras formais. A exportação deve conter todo o histórico coletado.

## Limites observados

Das 100 campanhas mundiais das duas séries principais, **34 terminaram por dominação**; 66 continuavam no corte. O mapa grande ainda produz campanhas longas, e estes dados não medem duração em minutos. As 100 partidas rápidas tiveram 88 vitórias no corte.

| Nação         | Participações | Vitórias | Vitórias / participações |
| ------------- | ------------: | -------: | -----------------------: |
| `aurelia`     |           148 |        8 |                     5.4% |
| `ferro_norte` |           148 |       39 |                    26.4% |
| `vespera`     |           150 |       22 |                    14.7% |
| `sol_invicto` |           152 |       12 |                     7.9% |
| `kaldor`      |           152 |        9 |                     5.9% |
| `turan`       |           152 |        9 |                     5.9% |
| `sapiencia`   |           150 |       13 |                     8.7% |
| `veridia`     |           148 |       12 |                     8.1% |

Ferro-Norte continua com a maior taxa de vitória; Aurélia, Sol e Kaldor precisam de acompanhamento em mesas humanas. Heurísticas dos bots não demonstram equilíbrio entre nações ou qualidade da negociação humana. Poupar legitimamente durante uma campanha longa continua possível: os ajustes removem renda indevida e cobram exércitos, sem limitar artificialmente o tesouro.

As posições iniciais seguem os oito pares explícitos do pedido; isso não equivale a dois reinos em cada macro-região. O modo rápido maximiza a distância possível no tabuleiro existente. A economia inicial calibra o imposto visível da capital para saldo próximo de +10; campanhas antigas não são recalibradas. Veja as [regras completas](REGRAS_V6.md).

## Reprodução

```sh
npx tsx scripts/simulate-balance.ts --games=100 --seed=20261022 --mode=mixed --max-turns=159 --output=.local/v6-main.json
npx tsx scripts/simulate-balance.ts --games=100 --seed=314159265 --mode=mixed --max-turns=159 --output=.local/v6-holdout.json
npx tsx scripts/simulate-balance.ts --games=20 --seed=159352879 --mode=campaign --max-turns=159 --allow-bot-secrets --output=.local/v6-optin.json
```

Dados: [semente principal](balance/v6-seed-20261022.json), [segunda semente](balance/v6-seed-314159265.json), [opção avançada](balance/v6-optin-seed-159352879.json). Histórico: [v0.5](BALANCE_V5.md), [v0.4](BALANCE_V4.md), [v0.3](BALANCE_V3.md), [v0.2](BALANCE_V2.md).
