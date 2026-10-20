# Regras matemáticas — versão 0.2

## Ordem da resolução

1. Bots preparam ordens; eventos diplomáticos imediatos entram no relatório.
2. Formações isoladas tentam encontrar uma rota de retorno.
3. Ações locais e saídas de tropas acontecem antes de qualquer chegada. A ordem de processamento é determinística a partir da semente do servidor.
4. Marchas chegam segundo iniciativa determinística, sem depender da velocidade de envio dos clientes. Batalhas são resolvidas por chegada.
5. Guarnições paradas pacificam; territórios sem controle podem se rebelar. Destacamentos sem acesso são repatriados.
6. Calcula-se a economia, cobrando manutenção pelo exército completo antes de sofrer atrito. As perdas de suprimento são aplicadas.
7. Impostos, comércio, manutenção, reservas, influência, moral e pagamentos de tributo são atualizados.
8. Os quatro legados são avaliados, a hegemonia é atualizada e a partida termina ou avança. O relatório é retido e o transporte salva o estado antes de divulgá-lo.

Uma província própria mantém pelo menos uma tropa ao marchar. Um destacamento em território estrangeiro pode sair por inteiro. Tropas estrangeiras preservam seu dono e não são doadas ao anfitrião.

## Pacificação e impostos

Conquista militar define pacificação como **20** com a mesma religião estatal ou **0** com religião diferente e acrescenta **30 de revolta**, limitado a 100.

```text
effectiveTax = baseTax × (pacification / 100)
             × (mesmaReligião ? 1.15 : 0.85)
             × (1 − unrest / 200)
```

A renda de imposto pode ser zero em uma conquista sem pacificação. O imposto base permanece dado estático. Desenvolvimento acrescenta renda comercial, preservando essa fórmula.

- Guarnição própria parada com pelo menos 3 tropas: +15 pacificação e −10 revolta.
- `PACIFY`: custa 8 ouro, acrescenta 35 pacificação e reduz 25 revolta. Acumula com a guarnição.
- Com pacificação abaixo de 50 e menos de 2 tropas: +15 revolta.
- Ao alcançar 100 de revolta: controle local neutro, pelo menos 2 rebeldes, pacificação 0 e revolta 40.

Uma força que acabou de marchar, chegar, conquistar ou recuar não conta como guarnição parada naquela rodada. Formação estrangeira não pacifica automaticamente o território de seu anfitrião. Valores são limitados ao intervalo 0–100.

## Suprimento e manutenção

```text
supplyLimit = baseSupplyLimit + fortLevel × 3 + (pacification >= 80 ? 2 : 0)
attritionLoss = troops > supplyLimit ? ceil((troops − supplyLimit) × 0.15) : 0
```

O mínimo de atrito ao exceder o limite é 1 tropa. Todas as forças presentes compartilham o limite local. Dividir um exército entre aliados não cria suprimento extra.

Com `baseUpkeep = 0.35`, o custo de uma formação regular é:

```text
excess = max(0, troops − supplyLimit)
upkeep = baseUpkeep × (min(troops, supplyLimit) + excess ^ 1.25)
```

Mercenários custam 2,2 vezes a manutenção normal. Num grupo misto, o multiplicador é `1 + 1.2 × mercenaries/troops`. Em província com forças de vários donos, calcula-se primeiro o custo progressivo do exército combinado e distribui-se pelo número e tipo de tropas de cada dono. A cobrança precede o atrito.

## Tropas e fortificações

| Ordem                | Custo e efeito                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Recrutar             | 3 ouro e 1 reserva por unidade; treinamento 1,00 e moral 60; ocorre na resolução                          |
| Contratar mercenário | 6 ouro por unidade, sem reserva; treinamento 1,00 e moral 60; instantâneo, em capital ou pacificação ≥ 80 |
| Treinar              | 6 ouro, +0,10 treinamento até 1,50 e +8 moral                                                             |
| Construir forte      | 18 / 28 / 38 ouro para níveis 1 / 2 / 3                                                                   |
| Desenvolver comércio | 16 / 24 / 32 ouro para níveis 1 / 2 / 3; +1,5 de comércio por nível                                       |

Guarnições começam com treinamento 1,20; forças locais, 1,05. Juntar tropas usa média ponderada de treinamento e moral. Uma marcha custa 6 de moral à parte que se desloca. Tropas paradas recuperam 4 de moral, enquanto falta de ouro reduz 12.

Cada nível de forte acrescenta 0,15 ao multiplicador defensivo e exige **3 tropas por nível** para iniciar um cerco. Se o forte crescer depois do planejamento, uma marcha insuficiente é interrompida e as tropas retornam, sem tratar a tentativa como massacre.

## Combate, moral e recuo

| Terreno   | Multiplicador defensivo |
| --------- | ----------------------- |
| Planícies | 1,00                    |
| Litoral   | 1,05                    |
| Floresta  | 1,15                    |
| Colinas   | 1,20                    |
| Montanhas | 1,35                    |

```text
attackPower = attackerTroops × attackerTraining
            × (0.5 + 0.5 × attackerMorale/100) × holyWarBonus
defensePower = defenderTroops × defenderTraining × terrainDefenseBonus
             × (1 + fortLevel × 0.15) × (0.5 + 0.5 × defenderMorale/100)
ratio = attackPower / max(1, defensePower)
```

O bônus de coalizão multiplica por 1,10 o lado elegível. Não há sorte adicional nos poderes. Empate de força favorece a defesa.

As escolhas seguintes completam os pontos que não tinham coeficientes exatos no pedido:

- Razão do vencedor `R`: poder vencedor dividido pelo máximo entre 1 e o poder derrotado.
- Fração de baixas do vencedor: `min(0.25, 0.12 / sqrt(max(1, R)))`.
- Fração do derrotado: `min(0.65, 0.25 + 0.12 × R)`.
- Baixas são arredondadas para cima e preservam pelo menos um sobrevivente por lado antes da verificação de aniquilação. Aliados que podem enfrentar o atacante compõem a força defensiva e compartilham baixas proporcionalmente.
- Dano de moral do vencedor: `8 + proporçãoDeBaixas × 20`.
- Dano de moral do derrotado: `45 × min(1.5, max(1, R))`.

**Aniquilação** ocorre somente com `R >= 2.5` ou moral derrotada igual a zero sem província vizinha própria/aliada disponível. Na vitória defensiva, usa-se a razão do defensor como vencedor.

Sem aniquilação, o derrotado tenta recuar para a vizinha própria ou aliada mais segura, combinando terreno, forte, apoio militar e folga de suprimento. A proporção de reagrupamento, determinada pela semente, fica entre **55% e 70% dos sobreviventes**, com moral 15. Quantidades são inteiras: usa-se arredondamento dentro da faixa quando existe solução inteira; grupos muito pequenos usam a quantidade inteira mais próxima, com mínimo 1. Os demais sobreviventes se dispersam e são registrados separadamente das baixas de combate.

Se não há rota e a moral ainda é positiva, a formação fica isolada, preservada em `displacedArmies`. Na rodada seguinte tenta reagrupar; se continuar cercada, sua moral chega a zero. Uma verificação posterior de moral zero sem saída pode aniquilá-la. Assim, ausência de rota sozinha não causa morte imediata fora da condição estabelecida.

Perder acesso militar causa repatriação administrativa com preservação das tropas, registrada com motivo `repatriation`. É uma retirada por tratado, distinta do reagrupamento após derrota em batalha.

## Religião e diplomacia

Missões custam 8 ouro e 2 influência, avançando 50 pontos para a crença do emissor. Duas missões concluem a conversão. Uma missão pode visar província própria ou território estrangeiro adjacente a uma província própria; aliados não podem ser alvo de missão hostil.

Uma conversão estrangeira concluída acrescenta 20 revolta e registra o emissor como pretendente religioso: sua invasão recebe `holyWarBonus = 1.15` enquanto a pretensão existir. Outra conversão substitui essa pretensão; uma conquista a encerra.

| Ação diplomática   | Regra                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Aliança            | Exige aceite; máximo de duas por reino; bloqueia ataques mútuos e cancela ordens contraditórias              |
| Romper aliança     | −4 influência, −10 moral, perda de confiança e trégua na rodada atual e seguinte                             |
| Acesso militar     | Exige aceite; permite atravessar sem trocar o dono do território                                             |
| Exigir tributo     | Oferta aceita pelo alvo, de 1–30 ouro por rodada durante 5 rodadas; paga o que houver disponível             |
| Embargo            | Comércio do alvo ×0,85, comércio próprio ×0,95 e −25 confiança ao impor; clicar novamente o retira           |
| Financiar rebeldes | Mínimo de 12 ouro livre; +30 revolta imediata na província rival; autoria ocultada dos outros nos relatórios |
| Subsídio           | Transfere ouro livre imediatamente e melhora confiança em 10                                                 |

Embargos de vários reinos acumulam multiplicativamente. Comércio base é 2 em entreposto e +1,5 por desenvolvimento. Impostos não são reduzidos pelo embargo. Diplomacia usa apenas ouro não reservado por ordens; a contratação instantânea segue a mesma regra.

## Legados e hegemonia

| Legado       | Pontos                                                                     | Rápido | Campanha |
| ------------ | -------------------------------------------------------------------------- | ------ | -------- |
| Supremacia   | Províncias + 0,35 por batalha vencida                                      | 22     | 30       |
| Prosperidade | 2 por desenvolvimento + ouro/30 + comércio acumulado/18                    | 26     | 35       |
| Concórdia    | Províncias estáveis + 0,6 por rodada de paz, até 8 + 1,5 por aliança ativa | 11     | 14       |
| Espiritual   | 1,5 por província estável da fé estatal + 1,2 por conversão                | 14     | 16       |

Província estável: pacificação ≥ 80 e revolta ≤ 25. Uma aliança só pontua se o aliado ainda tem território. Qualquer reino pode vencer por qualquer legado; a preferência do lobby não o restringe.

Ao final de cada resolução, `progresso = clamp(pontos/meta × 100, 0, 100)`. A partir de 75%, o maior progresso seleciona um único hegêmona; empates usam a semente de forma determinística. Os demais recebem +10% de força contra ele. Romper aliança com o hegêmona não cobra influência ou moral nem cria trégua, preservando a repercussão nas relações.

Vitória é verificada após a resolução. No limite de rodadas, vence o maior progresso normalizado; empates usam território, ouro e identificador do jogador. Eliminar todos os outros reinos vence por Supremacia. Formações estrangeiras e em recuo não trocam automaticamente o dono das províncias.
