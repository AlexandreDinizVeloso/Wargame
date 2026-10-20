# Regras e decisões matemáticas — v0.3

As regras seguintes completam os coeficientes e as decisões de resolução que não tinham valores fechados no pedido. São constantes do motor, compartilhadas com a interface quando há prévia de custo. O servidor decide o resultado de todos os comandos.

## Configuração

- 3–8 nações, sem duplicatas; dois territórios iniciais por jogador.
- Rápido: 16 terras, 20 rodadas de 180 segundos. Campanha: 56 terras e 13 mares, 40 rodadas de 450 segundos.
- Tesouro 75, reservas 20, influência 8, prestígio 10. Mercenários não usam reservas.
- `ownerId` é propriedade definitiva; `occupierId` é controle militar temporário. Em uma terra neutra, a conquista incorpora imediatamente; em terra de outro reino, a cessão definitiva depende de paz.
- Não existe tropa guardada no registro da cidade. Toda formação está em `battalions`, com composição, moral, treinamento, rota e dono próprios. Milícias independentes usam o dono especial `NEUTRAL`.

## Ordens e iniciativa

Cada cidade pode ter uma ordem preparada, e cada batalhão pode ter outra. Substituição/cancelamento libera a reserva sem cobrar duas vezes. Mercenários e diplomacia são imediatos e só usam recursos não reservados. Limite de 80 formações por reino.

A resolução recebe tempo e semente explicitamente, sem relógio ou RNG global:

1. Bots decidem acordos, ordens e guerras; formações isoladas tentam retornar.
2. Ordens locais, recrutamento, fusão/divisão e embarque são processados em ordem determinística.
3. Cada formação percorre uma ligação da rota; cada chegada resolve seu combate. Mudança de acesso interrompe uma rota inválida.
4. Guarnições paradas integram territórios; revoltas e dissolução de reinos são processadas.
5. Desgaste, impostos e manutenção são calculados; suprimento causa perdas. Pagamentos e recuperação são aplicados.
6. Guerras, eleição, autoridade, paz mundial e as duas vitórias são avaliadas. O histórico é concluído e salvo antes da divulgação.

Uma formação pode sair inteira de uma província. Divisão e fusão conservam tipos e quantidades, com médias ponderadas de moral e treinamento. Uma divisão deixa ao menos uma unidade em cada formação. Formações de tipos ou contratos diferentes e frotas carregadas não podem ser fundidas. Entrincheirar cancela a rota e dá +15% defesa; mover remove o entrincheiramento. Treinar custa 6 ouro e dá +0,10 treinamento, até 1,50, e +8 moral.

## Recrutamento e cidades

| Unidade         | Ouro regular | Reservas |
| --------------- | -----------: | -------: |
| Infantaria      |            3 |        1 |
| Cavalaria       |            6 |        1 |
| Artilharia      |            8 |        1 |
| Navio de guerra |            9 |        0 |
| Transporte      |            6 |        0 |

Recrutas começam com treinamento 1,00 e moral 60. Mercenários custam o dobro, ou 1,5× para a fé Mercante, são imediatos e exigem capital ou pacificação ≥80. Ideias nacionais podem reduzir os custos terrestres/navais.

| Construção/ação | Ouro             | Efeito                                            |
| --------------- | ---------------- | ------------------------------------------------- |
| Forte           | 18 / 28 / 38     | +0,15 defesa e +3 suprimento por nível, máximo 3  |
| Porto           | 20 / 30 / 40     | Litoral; permite navios e +1,5 comércio por nível |
| Mercado         | 16 / 24 / 32     | +25% imposto/comércio por nível, máximo 3         |
| Pacificar       | 8                | +35 pacificação, −25 revolta                      |
| Converter       | 8 e 2 influência | 100 progresso com Inquisição; 50 com Tolerância   |

O Sínodo Reformado reduz custo de fortes em 25%. Construir e recrutar exige propriedade definitiva e controle da cidade. Pacificação pode integrar uma ocupação.

## Imposto, integração e suprimento

```text
imposto = baseTax × pacification/100 × (mesmaFé ? 1.15 : 0.85)
        × (1 − unrest/200) × (1 + 0.25 × marketLevel)
        × (bloqueada ? 0.5 : 1) × (tolerância ? 0.9 : 1)
comércio = (entreposto ? 2 : 0) + 1.5 × portLevel
comércio *= 1 + 0.25 × marketLevel
```

A fé Mercante amplia imposto/comércio em 25% nas cidades com porto ou mercado. Ideias nacionais comerciais multiplicam comércio. Embargos multiplicam comércio do alvo por 0,85 e do emissor por 0,95; vários embargos acumulam. Dízimos são adicionados à renda bruta. O desgaste reduz essa renda em `warExhaustion × 0.4%`.

Conquista define pacificação 20 se a fé local coincide com a estatal, ou 0 se diverge, e +30 revolta. Guarnições paradas com pelo menos três unidades terrestres dão +15 pacificação e −10 revolta. Unidades que acabaram de chegar/recuar não contam como paradas. Se pacificação <50 e menos de duas tropas, +15 revolta. Tradição Ancestral amplia a pacificação em 15%; ideias nacionais também multiplicam essa velocidade.

Com revolta 100, a terra fica neutra, pacificação 0 e revolta 40, com duas unidades rebeldes. Formações do controlador são evacuadas, preservando sua composição. Perder todas as terras dissolve o reino: suas formações são desmobilizadas e guerras sem participantes vivos de um dos lados terminam. Isso não é uma aniquilação de batalha.

```text
supplyLimit = baseSupplyLimit + 3 × fortLevel + (pacification >= 80 ? 2 : 0)
perda = tropas > supplyLimit ? ceil((tropas − supplyLimit) × 0.15) : 0
excesso = max(0, tropas − supplyLimit)
manutenção = 0.35 × (min(tropas, supplyLimit) + excesso^1.25)
```

Todas as formações locais compartilham suprimento; separá-las não reduz o custo progressivo. O custo é calculado antes das perdas e distribuído por unidades. Mercenários pagam 2,2×; defesa de retaliação imperial paga 0,75×. Formações embarcadas pagam manutenção junto da frota e dependem da capacidade de transporte.

## Combate e recuo

- Infantaria: ataque 1, defesa 1,2.
- Cavalaria: base 1; ataque ×1,4 em planícies/litoral e ×0,8 em montanhas/florestas.
- Artilharia: ataque 2,2, defesa 0,6; cada peça neutraliza um nível de forte e amplia em 30% o dano à moral.
- Se uma formação tem menos infantaria que artilharia, as baixas calculadas de artilharia são multiplicadas por 1,75.
- Navio de guerra: poder 3; transporte: 0,5. Combate naval enfrenta frotas; navios não ocupam cidades.

```text
poder de formação = soma dos poderes por tipo × treinamento
                  × (0.5 + 0.5 × moralEfetiva/100)
defesa = soma das formações × terreno × (1 + 0.15 × fortesRestantes)
       × (bloqueio ? 0.8 : 1)
```

Moral efetiva pode receber +20% de retaliação imperial ou +15% temporário de humilhação, com teto 100. Bônus nacionais e religiosos entram nos respectivos tipos. Tradição Ancestral dá +20% defesa em propriedade própria; entrincheiramento dá +15%. Uma pretensão de conversão estrangeira dá +15% ataque ao emissor. O terreno mantém 1,00 / 1,05 / 1,15 / 1,20 / 1,35 para planície / litoral / floresta / colina / montanha.

O empate favorece a defesa. Forte restante exige três unidades por nível para começar um cerco, mesmo se não há guarnição. Uma marcha sem força suficiente é interrompida e volta à origem.

Para razão do vencedor `R`:

- Baixas do vencedor: `ceil(unidades × min(0.25, 0.12/sqrt(max(1,R))))`.
- Baixas do perdedor: `ceil(unidades × min(0.65, 0.25 + 0.12×R))`.
- Preserva-se ao menos uma unidade antes de verificar aniquilação; artilharia exposta tem seu adicional de perdas.
- Dano básico de moral: vencedor `8 + 20×fraçãoDeBaixas`; derrotado `45×min(1.5,R)`. Artilharia amplia esse dano.

Aniquilação exige `R ≥ 2.5` ou moral zero sem vizinha própria/aliada segura. Caso contrário, a formação reagrupa aproximadamente 55–70% dos sobreviventes com moral 15. Quantidades inteiras usam arredondamento com mínimo um; cavalaria vencedora aumenta em 25% as perdas da perseguição. Sem rota, o grupo fica isolado, tenta retornar e pode alcançar moral zero. Repatriação por tratado é administrativa e preserva tropas. O relatório distingue esses motivos, perdas por tipo e por reino.

## Marinha

Portos de nível ≥1 constroem navios. Uma frota carrega um batalhão por vez e cada transporte tem capacidade para quatro unidades. Embarque exige porto e frota no local ou mar adjacente. O batalhão acompanha a posição da frota e recebe ordens de desembarque. Costa inimiga exige guerra formal. Frotas não atracam em porto hostil; combatem em mares e bloqueiam litorais adjacentes.

Perder transportes reduz a capacidade; unidades excedentes embarcadas são perdidas e registradas na crônica. A destruição da frota perde sua carga. Suprimento marítimo usa capacidade local das zonas; tropas transportadas não navegam por conta própria.

Uma frota inimiga com ao menos um navio de guerra em zona adjacente aplica −50% imposto e −20% defesa de cerco, sem acumular vários bloqueios na mesma cidade.

## Guerra formal e tratados

Declaração exige Conquista, Banimento Imperial, Guerra Santa ou Humilhação. Trégua e aliança impedem a declaração. Guerra Santa exige outra fé; a fé Solar evita a perda padrão de cinco pontos de estabilidade. Banimento exige alvo banido e também dispensa essa perda.

Recuos podem buscar abrigo aliado mesmo sem um acesso militar previamente negociado; o dono da formação é preservado.

Aliados defensivos são convocados e entram na defesa enquanto decidem. Recusar remove sua participação, rompe a aliança e custa 15 prestígio e cinco autoridade imperial. Aliados ofensivos precisam aceitar; bots atendem o chamado automaticamente. Omissão de resposta defensiva por uma rodada confirma a participação.

Desgaste por rodada em guerra: `+4 + 10 × unidadesPerdidas / max(1, exércitoInicialDaRodada)`, limitado a 100. Em paz, −12. Perdas incluem dispersão de combate, atribuídas a cada reino. Recuperação parada de moral é `max(0, 4 − desgaste×0.04)`; falência causa −12. Cada província controlada recebe `desgaste×0.25` de revolta.

Pontuação de guerra é positiva para o atacante e negativa para a defesa, limitada a ±100. Batalha vale `5 + 0.5×baixasTotais`, ocupação vale `3×baseTax` e bloqueio vale dois por cidade/rodada, até 40 acumulados. Ocupar todas as terras do líder de um lado equivale a capitulação e leva a pontuação a ±100.

| Termo                 | Custo em pontuação          | Consequência                                                                                                                                   |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cessão                | 12 + imposto base por terra | Só terras inimigas ocupadas; propriedade definitiva do proponente                                                                              |
| Reparações            | 20                          | Tributo imediato de 0–100, até o ouro disponível; +25% renda bruta por cinco rodadas incluindo a atual                                         |
| Humilhar/desarmar     | 25                          | Vencedor +20 prestígio, +20 autoridade se Imperador e +15% moral por quatro rodadas; derrotado até oito unidades terrestres por quatro rodadas |
| Forçar Dieta/religião | 30                          | Ingresso na Dieta ou adoção da fé estatal do vencedor                                                                                          |
| Subjugar              | 70                          | Reino passa a súdito e não pode declarar guerra                                                                                                |

Somente líderes negociam a guerra. Termos não podem exceder a pontuação favorável; a pontuação 100 permite imposição. Propostas sem exigências podem ser enviadas por qualquer líder e dependem de aceite. Os demais territórios ocupados são restituídos e surge trégua por duas rodadas seguintes. Formações sem acesso são repatriadas. Reparações e humilhação não criam uma terceira condição de vitória.

Alianças, acesso, tributo, embargo, financiamento de rebeldes e subsídio continuam disponíveis. Há até três alianças por reino. Financiar rebeldes custa ao menos 12 ouro, gera +30 revolta imediatamente e tem autoria ocultada para os demais. Subsídio melhora confiança em 10. Embargo imposto reduz confiança em 25.

## Religiões e Dieta

| Fé                 | Doutrina                                                          | Cidade mundial |
| ------------------ | ----------------------------------------------------------------- | -------------- |
| Sol Invictus       | +15% ataque de infantaria; Guerra Santa sem custo de estabilidade | Itália         |
| Conclave Mercante  | +25% receita com porto/mercado; −25% contratação de mercenários   | Portugal       |
| Sínodo Reformado   | +20% artilharia; −25% custo de fortes                             | Germânia       |
| Tradição Ancestral | +20% defesa em propriedade própria; +15% pacificação              | Japão          |

Cada teatro tem cidades locais fixadas no contrato do mapa para preservar as quatro doutrinas. O controlador da Cidade Sagrada recebe **1,5 ouro por terra daquela fé no mapa**, independentemente do dono ou da fé do controlador.

Inquisição completa conversão em uma missão e adiciona +6 revolta/rodada às províncias de outra fé. Tolerância remove esse acréscimo religioso e reduz imposto em 10%; conversão requer duas missões. Missões estrangeiras exigem adjacência, não podem visar aliados, geram +20 revolta e registram pretensão religiosa para uma invasão.

Membros votam em membros. Maior contagem de votos, depois prestígio e ID determinístico elegem o Imperador. Troca de Imperador desativa um Édito anterior. Autoridade começa em 30 e, em paz, cresce dois por membro/rodada, multiplicado por ideias nacionais; guerra reduz dois por rodada.

O Imperador gasta 25 ouro livre e 25 autoridade para emitir o Édito de Paz. Qualquer nova declaração, mesmo fora da Dieta, convoca todos os membros contra o agressor, aplica banimento e concede +20% moral / −25% manutenção defensiva. Um agressor membro perde seu assento. O Édito permanece até a troca de Imperador.

Somente existem as condições `DOMINATION` e `IMPERIAL_PACIFICATION`. O contador imperial só avança quando **não existe guerra ativa no mundo**; qualquer declaração o zera. Vitória é verificada ao final da rodada. O limite não compara pontuações: preserva empate sem vencedor.
