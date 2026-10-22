# Validação e balanceamento · v0.7

## Revisão funcional

- Build de produção, verificação de tipos e ausência de imports/variáveis não usados.
- **199 testes do motor**, incluindo 15 novos cenários de moral, treino/descanso, revalidação de marcha, divisão/fusão, atrito agregado, crescimento neutro, comércio, bombardeio e migração v6.
- Fluxo multiplayer clássico em três Chromium: lobby, personalização, guerra, cerco, doutrinas, cidades, transporte, alertas, objetivos privados, reconexão, exportações e sandbox.
- Revisão cartográfica: arrastar, redimensionar, minimizar/restaurar, janelas simultâneas sem backdrop, mapa interativo, Esc, geometria persistida e viewport móvel.
- Formatação e `git diff --check`.

Os testes usam salas temporárias. O servidor publicado gravou snapshot 7 e recarregou **cinco salas, seis sessões e 21 jogadores**. A comparação preservou hashes de sessão, dinheiro, reservas, turnos, posições e tropas. O backup `.v6-backup` mantém a origem; campos e ordens afetados estão em [REGRAS_V7.md](REGRAS_V7.md). Health HTTP foi conferido em IPv4 e IPv6.

## Amostra inicial de regras

**40 partidas**, semente **20261022**, seis bots, alternando campanha mundial e teatros rápidos Europa/Américas/Ásia, corte interno de **100 rodadas**. Bots não vencem por carta nesta série. Cada rodada valida estado persistível, slots, reservas, composição/carga, modificadores navais, guerra formal e histórico exportável.

| Medida                                | Resultado |
| ------------------------------------- | --------: |
| Vitórias por dominação                |        15 |
| Vitórias por carta                    |         0 |
| Sem vencedor no corte                 |        25 |
| Pico de tropas terrestres por nação   |       101 |
| Maior ouro sem investimento econômico |        93 |
| Comércio marítimo total recebido      |    31.664 |
| Bombardeios resolvidos                |        25 |
| Travessias marítimas                  |     4.758 |
| Deserções (unidades)                  |     2.306 |

A média foi 82,325 rodadas coletadas e 162,975 batalhas por partida. Foram registrados 13.645 processamentos de ondas em cidades independentes, incluindo reposição no nível máximo. As séries históricas v0.6 tinham corte 159; estes totais não são comparação controlada entre versões.

“Sem investimento econômico” exclui mercados, fundições, portos acima do nível inicial e nações que já receberam comércio marítimo. O simulador continua interrompendo ao observar 200 tropas terrestres por nação ou 1.000 ouro sem investimento; esses valores são verificações da amostra, não tetos nas partidas humanas. Maior excesso militar observado: 49 unidades acima da capacidade, sujeito à manutenção ampliada.

## O que ainda medir jogando

A amostra confirma execução das novas regras e uso de comércio/bombardeio pelos bots. **25 de 40 partidas continuam sem vencedor no corte**; não demonstra partidas rápidas de 60 minutos. Reorganização, revoltas e defesa neutra podem prolongar campanhas. A negociação humana e o equilíbrio entre nações ainda precisam de partidas reais, especialmente antes de aumentar receitas ou reduzir exigências de descanso.

As decisões iniciais são: moral mínima 25, atrito de 25% do excedente com −20 moral, neutros a cada quatro rodadas até 12 guardas/forte 2, nós de 3–6 ouro com teto 12 e bombardeio por seis ouro com três navios. Veja os detalhes e a ordem da resolução nas [regras](REGRAS_V7.md).

## Reprodução

```sh
npx tsx scripts/simulate-balance.ts --games=40 --seed=20261022 --mode=mixed --max-turns=100 --output=.local/v7-main.json
```

Dados: [amostra v0.7](balance/v7-seed-20261022.json). Histórico de validação: [v0.6](BALANCE_V6.md), [v0.5](BALANCE_V5.md), [v0.4](BALANCE_V4.md), [v0.3](BALANCE_V3.md), [v0.2](BALANCE_V2.md).
