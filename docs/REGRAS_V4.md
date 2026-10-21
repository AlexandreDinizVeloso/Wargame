# Regras v0.4

## Configuração

3–8 nações únicas; teatro continental (16 terras) ou mundial (56 terras). Escolha de nação no lobby, objetivos secretos ligados por padrão, sala pública ou privada e timer de 15–600 segundos. Não há cartas táticas de comando.

A primeira confirmação humana dispara o relógio. A resolução é simultânea e usa apenas o estado autoritativo. Mudanças diplomáticas são imediatas; ordens de cidades e batalhões são independentes. Declaração com marcha valida e aplica as duas ações juntas, sem alteração parcial se rejeitada.

## Economia e logística

Impostos variam por pacificação, religião, revolta, mercados, tolerância, bloqueio e desgaste. Portos geram comércio; cidades sagradas recebem dízimos. Manutenção cresce quando a guarnição excede o suprimento. Mercenários não usam reservas humanas e custam 2,2× manutenção. Descontos de religião, nação, recurso e crise se multiplicam; custos são arredondados a centavos e todas as ordens reservadas são consideradas.

| Recurso      | Efeito                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Trigo        | +6 suprimento local e +2 nacional por província controlada                                          |
| Ferro        | +8% ataque de infantaria por fonte, até +24%; −15% custo local de infantaria/artilharia             |
| Cavalos      | +10% ataque de cavalaria por fonte, até +30%; −20% custo de cavalaria se o reino controla uma fonte |
| Mina de Ouro | +5 imposto base, já incorporado ao `baseTax`                                                        |
| Relíquia     | +3 ouro e +10% recuperação nacional de moral por fonte                                              |

## Nações

- **Aurélia:** pode oferecer vassalagem em paz; o outro jogador precisa aceitar. Tratados também impõem submissão por warscore. Cada vassalo paga 25% da renda bruta ao soberano de Aurélia, limitado pelo tesouro disponível. Visão dos súditos e terras de vassalos contam para dominação.
- **Ferro-Norte:** +8 ouro por unidade inimiga eliminada no combate, incluindo destruição na retirada. Saquear uma conquista costeira/fronteiriça recupera +20 moral; arrasar recupera +25. Não sofre redução de suprimento/navegação ou atrito extra do inverno; floresta não encarece movimento nem reduz a capacidade básica abaixo da planície.
- **Véspera:** mercenários instantâneos em cidade própria com porto ou mercado, sem reservas; −35% contratação. Receita de cidades com essas construções ganha +30%. Visão total comprada custa ao menos 20 ouro e dura a rodada atual e as duas seguintes. Suborno eleva revolta em 60, contra 30 padrão. O identificador de protocolo `BUY_VISION_OR_BRIHC` é mantido conforme a especificação.
- **Sol Invicto:** conversão concluída rende +25 ouro e +10 Fervor. Guerra entre religiões concede +20% ataque e moral; cada combate ofensivo religioso tem chance determinística de 20% de provocar revolta imediata por província rival adjacente. A crise de Cruzada concede mais +10% ataque religioso.
- **Kaldor:** fortes −30% até nível 4 (outros até 3), acumulando desconto de religião. Sitiantes inimigos perdem 15% das tropas, arredondados para cima, uma vez por província/rodada antes do combate. Artilharia custa −25% e tem +25% poder.
- **Turan:** cavalaria pura pode percorrer duas ligações por turno em planícies/costas; combate interrompe o avanço adicional. Arrasar conquista recente com pacificação ≤35 e ainda não saqueada rende 80 ouro, +40 revolta e zera pacificação. Cada província só pode ser arrasada uma vez; Ferro-Norte também tem essa ação.
- **Sapiência:** todas as formações recrutadas começam com treinamento mínimo 1,20×. Recebe caminhos/ordens de marcha rivais em províncias adjacentes às próprias e vê setas violetas antes da resolução.
- **Verídia:** formações terrestres em floresta/colinas próprias controladas ficam fora da visão adversária, exceto visão compartilhada/comprada. Defendendo essas terras, têm +50% poder de emboscada. Relatórios preservam batalhas já observadas.

## Estaçōes e crises

Primavera +10% recuperação de moral; verão sem penalidade; outono +15% receita em terras com trigo; inverno −25% suprimento e velocidade naval, com atrito hostil dobrado. A navegação acumula 0,75 ponto por rodada no inverno; ligações custam 1. Florestas custam 1,5 para marcha terrestre normal, acumulando progresso entre rodadas.

A cada quatro rodadas, o servidor sorteia uma crise determinística, visível antes do planejamento, válida por duas rodadas:

- Corrida do Ouro: +50% renda de minas.
- Inverno Rigoroso: efeitos de inverno fora da estação.
- Fervor de Cruzada: +10% ataque religioso.
- Crise Mercenária: −40% contratação.
- Agitadores Rebeldes: +12 revolta em terras com pacificação inferior a 80 por rodada.

A semente e o gerador ficam exclusivamente no servidor.

## Ameaça e coalizões

Conquista formal custa +20 ameaça; humilhação +10; Guerra Santa válida e contenção não geram ameaça de declaração. Incorporar terra neutra gera +4 e cessão em tratado +12 por província. Paz reduz ameaça em 8 por rodada; faixa 0–100.

Um reino com ameaça ≥60 ou 40% das terras pode ser alvo de coalizão. Membros independentes entram juntos em Guerra de Contenção, com +20% moral e −25% manutenção. Alianças/tréguas com o alvo e guerras incompatíveis impedem a declaração; a paz usa o mesmo sistema de tratados e warscore das guerras comuns.

## Vitórias

1. **Dominação/Hegemonia:** 60% das terras sob controle direto ou dos vassalos, ou todos os rivais eliminados/subjugados. Um vassalo não disputa vitória independente.
2. **Objetivo secreto**, quando habilitado: cumprir todos os requisitos de uma carta escolhida ao fim da rodada.

Cada jogador recebe duas cartas únicas e compatíveis com seu mapa; uma é favorecida pelo estilo da nação. O jogador escolhe no primeiro turno antes de confirmar. Sem escolha, a primeira é adotada ao resolver. Cartas são privadas durante a partida e reveladas ao terminar.

| Carta                        | Requisitos                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Senhor das Riquezas          | Até 12 terras (50% do teatro menor), até 3 minas/relíquias disponíveis, 800 ouro, todas as terras pacificadas ≥80 e revolta <50 |
| Império dos Mares            | Até 10 costas (65% das costas do teatro menor), até 5 portos conforme mapa e maior frota sem empate                             |
| Rivalidade Mortal & Expansão | Capital original do rival ou rival com ≤2 terras, mais 35% do mapa                                                              |
| Pax Hegemônica               | Dois vassalos/aliados firmes (confiança ≥30), 35% do mapa e três rodadas com maior exército sem empate e sem rebelião própria   |

A vitória de dominação tem precedência se duas condições forem atingidas na mesma resolução. Não há vitória por pontuação nem limite de rodadas. Somente o simulador usa corte interno; uma partida ainda em andamento nesse corte é registrada como sem vencedor.

A Dieta Imperial da v0.3 foi aposentada. Campos `diet`/`dietHistory` permanecem para leitura de arquivos antigos; nenhuma ação da Dieta é aceita no protocolo 4 e não existe vitória por paz passiva.
