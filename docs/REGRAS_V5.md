# Regras da v0.5

A v0.5 mantém as [nações, recursos e política da v0.4](REGRAS_V4.md), com as alterações abaixo. As regras deste arquivo prevalecem sobre os documentos históricos.

## Planejamento e formações

Fusão/divisão e atribuição de comandante são imediatas, sem custo de movimento ou rodada. Um jogador confirmado precisa reabrir as ordens. As rotas e ordens das formações reorganizadas são canceladas; treinamento, moral, equipamento e composição são preservados por média ponderada na fusão. O crédito de movimento combinado usa o menor crédito das duas formações. A divisão copia o crédito da origem e deixa o comandante nela. Formações com `autoMerge` se fundem ao terminar juntas, desde que sejam do mesmo dono, tipo e contrato, sem carga ou isolamento. Ordens da cidade continuam independentes.

## Cerco e fortes

Uma vitória campal permite iniciar um cerco; terras sem guarda também têm guarnição local. A chegada inicia **1 ponto**, sem alterar propriedade/ocupação. Resistência: **2 + 2 × nível do forte**. Nenhum cerco termina na rodada de chegada.

Nas rodadas seguintes: +1 base; artilharia +1, ou +2 com pelo menos três canhões ou Bombardas; Bombardas acrescenta mais +1 quando há artilharia; Mestre de Cerco +1; bloqueio naval aliado +1. Bombardas destrói um nível de forte na conclusão. A saída, derrota ou paz do sitiante cancela seu progresso. Assaltar soma +3 ao resolver a ordem, remove `ceil(infantaria × (0,15 + 0,10 × forte))` e reduz moral em 25. A ocupação ocorre somente após a resolução campal, se ainda houver sitiantes.

Um forte hostil não ocupado bloqueia marcha para outras terras hostis, inclusive por ponte naval. É possível recuar para terra própria, aliada ou já ocupada. **Máximo de forte 2; Kaldor 3**: segue a seção de edifícios do pedido, que substitui o exemplo anterior de Kaldor 4.

## Comandantes e doutrinas

Cada nação começa com general na formação principal. Recrutar custa 60 ouro e 15 influência, até três líderes por nação. Atribuição é imediata; general comanda terra e almirante comanda frota. Um comandante só ocupa uma formação. A derrota da formação deixa o líder disponível para atribuição posterior.

| Traço                | Efeito                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| Mestre de Cerco      | +1 cerco e ignora um nível de forte na batalha                                   |
| Vanguarda Relâmpago  | +15% ataque na invasão inicial; ignora custo adicional de floresta               |
| Bastião de Ferro     | +20% defesa, +15 recuperação de moral; primeira derrota protegida de aniquilação |
| Mestre da Emboscada  | +30% ataque/defesa em floresta, colinas e montanhas                              |
| Intendente Logístico | −30% manutenção, +6 suprimento local e imunidade a atrito                        |
| Lobo do Mar          | +25% ataque naval e 35% de capturar um navio de guerra derrotado                 |

O líder ganha 20 XP por batalha e 5 por rodada subsequente de cerco. Duas estrelas em 40 XP; três em 100. Cada estrela além da primeira acrescenta 5% de poder. Esses valores completam a especificação, que não fixava os limiares de veterania.

A nação ganha 10 XP militar por rodada, 15 por batalha e 8 por ordem de treinamento. Cada árvore tem nível 1 (25 XP), escolha exclusiva 2A/2B (45) e nível 3 (70). Não há compra dos dois ramos de nível 2 nem acesso sem pré-requisitos.

| Árvore     | Nível 1                     | Nível 2A ou 2B                                                                                                  | Nível 3                                                           |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Infantaria | +12% defesa                 | Piques: +30% contra cavalaria e anula choque; Mosqueteiros: +20% ataque                                         | −25% baixas campais letais de infantaria e +10 moral após combate |
| Cavalaria  | +12% ataque                 | Hussardos: +30% ataque em planície/costa e −10 moral inimiga; Dragões: sem penalidade difícil e +15% defesa     | Com ≥50% cavalaria: +1 movimento e +35% baixas na perseguição     |
| Artilharia | +15% ataque                 | Bombardas: bônus de cerco e destruição de forte; Bateria: +25% eficiência campal e remove vulnerabilidade extra | −12 moral inimiga antes do choque                                 |
| Marinha    | +20% defesa e moral efetiva | Corsários: 35% da renda local bloqueada; Galeões: +25% ataque de navios de guerra e +15% apoio costeiro         | Duas zonas por rodada e imunidade a atrito para frota/carga       |

Baixas são inteiras: a Guarda recupera `floor(baixas de infantaria × 0,25)`. Ela não evita aniquilação por força esmagadora. Moral efetiva de frota continua limitada a 100. Apoio de Galeões exige navios de guerra em zona marítima adjacente.

## Cidades e economia

Terra comum tem **dois slots**; capital, mina de ouro ou relíquia tem **três**. Melhorar mantém o slot. Cada cidade tem uma ordem por rodada, inclusive demolição; demolir remove o edifício inteiro e não devolve ouro. Construção exige propriedade legal e ausência de ocupação.

| Edifício | Custo base | Efeito por nível                                                                                     |
| -------- | ---------: | ---------------------------------------------------------------------------------------------------- |
| Mercado  |         20 | +3 comércio, −1 geração local de reservas                                                            |
| Quartel  |         24 | +3 regeneração/capacidade de reservas; recrutas +0,10 treinamento; desconto local de 15%             |
| Forte    |         24 | +15% defesa, +2 resistência de cerco e zona de controle                                              |
| Arsenal  |         30 | +10% equipamento de recrutas de infantaria/artilharia; +2 indústria; manutenção 1,5, isenta em ferro |
| Templo   |         22 | −15 revolta, +25% pacificação e +2 fervor/estabilidade                                               |
| Porto    |         28 | Apenas litoral: recruta frotas, +2,5 comércio e +4 suprimento                                        |

Máximo nível 2, exceto forte de Kaldor 3. Custo = base × próximo nível × inflação, acumulando descontos aplicáveis. Inflação = `1 + 0,12 × max(0, terras controladas − 6)`. Corrupção incide somente nos impostos acima de 50: taxa `min(30%, 15% + 1% × max(0, terras − 6))`. Comércio, saque e tributo não são impostos. Desconto de quartel é 15% na cidade, independentemente do nível; os demais efeitos por nível acumulam. Treinamento máximo continua 1,5.

## Terra e mar

Terrestres só usam terra ou carga formal de frota, com vínculos recíprocos e capacidade de quatro tropas por transporte. Recuos terrestres só usam terra; frotas recuam para mares sem inimigos ou portos autorizados. Perder transportes pode causar perda de carga excedente; perder a frota destrói sua carga.

Poder naval base: `(3 × navios de guerra + 0,5 × transportes) × treinamento × (0,5 + 0,5 × moral/100)`, multiplicado por comandante, veterania, doutrinas e modificadores navais da nação/coalizão. Religião, cavalaria, artilharia, forte e terreno terrestre não entram. Relatórios mostram modificadores terrestres neutros.

**Ponte naval:** frota própria estacionada no mar, com capacidade livre, liga duas costas adjacentes à mesma zona. A ordem move o exército diretamente entre terras em uma rodada, depois dos combates navais. A capacidade é reservada entre travessias; a frota não pode também marchar. Perda/retirada da frota ou presença inimiga no mar cancela a travessia. O defensor costeiro ainda pode combater e resistir por cerco.

## Vitória e diplomacia

Dominação exige **75%** das terras do teatro. Controle direto conta 1; terras de súditos contam 0,5. Submeter todos os rivais não encerra automaticamente. Eliminar fisicamente os demais reinos continua vencendo.

Subjugação custa **85** de pontuação e exige defensor com até três terras legais, ou capital e pelo menos 75% das terras legais ocupadas pelo proponente. A condição também vale para oferta voluntária de Aurélia. Ocupação por terceiro não conta para o proponente.

| Carta      | Condição completa                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mares      | `max(4, ceil(45% das costas))` costas; `max(3, ceil(30% das costas))` portos; maior frota sem empate e seis navios de guerra                                               |
| Riquezas   | `max(5, ceil(40% das terras))` terras; `min(2, max(1, minas/relíquias disponíveis − 1))` recursos; 450 ouro no rápido ou 900 no mundo; todas pacificadas ≥80 e revolta <50 |
| Rivalidade | Capital original do rival ocupada/anexada e 45% de controle direto do mapa                                                                                                 |
| Pax        | Dois aliados de confiança ≥30 ou súditos; 45% de controle direto; maior exército sem empate e estabilidade ≥85 por três rodadas                                            |

**Todas exigem duas rodadas consecutivas com a condição completa**, com alerta público na primeira. Pax usa `paxStreak` para suas três rodadas militares e `objectiveStreak` para as duas rodadas da carta: a primeira vitória possível é a quarta rodada de superioridade, mantendo as demais condições. Perder uma condição zera a sustentação correspondente. O alerta não revela qual carta o jogador possui. Tributos são liquidados antes de verificar o tesouro da carta.
