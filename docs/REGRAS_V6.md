# Regras da v0.6

As regras abaixo substituem as seções correspondentes da [v0.5](REGRAS_V5.md). Nações, cerco, comandantes, doutrinas, edifícios e tratados continuam seguindo as regras anteriores quando não há alteração aqui.

## Posições iniciais e abertura

| Nação       | Capital        | Segunda terra   |
| ----------- | -------------- | --------------- |
| Véspera     | Portugal       | Castela         |
| Ferro-Norte | Escandinávia   | Moscóvia        |
| Aurélia     | Nilo           | Magrebe         |
| Sol Invicto | Arábia         | Pérsia          |
| Kaldor      | África Austral | África Oriental |
| Turan       | Mongólia       | Sibéria         |
| Sapiência   | China Oriental | Indochina       |
| Verídia     | Amazônia       | Colômbia        |

São os pares explícitos do pedido. A lista coloca três nações na África/Oriente Médio e uma nas Américas; não é uma divisão literal de duas nações por macro-região. No rápido, as capitais ficam no teatro escolhido, com seleção pela maior distância possível. Em teatros de 16 terras com oito participantes, capitais adjacentes podem ser inevitáveis.

Nas rodadas **1 e 2**, não é possível declarar guerra contra outra nação principal. Terras neutras continuam disponíveis para expansão por batalha e cerco. Guerra entre nações é liberada na rodada 3.

Cada nação começa com 18 reservas humanas. A base tributária da capital é calibrada na criação da campanha para saldo inicial próximo de **+10 ouro/rodada**, considerando exército e bônus da nação. Isso é imposto visível da capital, não uma transferência recorrente. A calibração e os novos spawns não alteram campanhas migradas.

## Estreitos e travessias

Linhas tracejadas representam ligações terrestres de uma rodada, sem embarque: Portugal/Castela–Magrebe, França–Grã-Bretanha, Escandinávia–Alemanha/Países Baixos, Itália–Magrebe/Bálcãs/Grécia, Grécia/Bálcãs–Anatólia, Nilo–Arábia, Arábia–Chifre da África, Malaia–Arquipélago, Coreia–Japão, Alasca–Sibéria e Caribe–América Central/Costa Leste dos EUA/Colômbia. Florestas não acrescentam uma rodada à passagem de estreito. Navios de guerra de uma nação em guerra na zona correspondente bloqueiam a passagem; restrições de acesso e zonas de controle continuam valendo.

Ao selecionar uma formação terrestre costeira, o mapa também oferece costas ligadas pela mesma zona marítima ou por duas zonas adjacentes. A rota deve estar livre de navios de guerra hostis:

- **Grátis:** frota própria estacionada em uma das zonas da rota, com capacidade livre de quatro tropas por transporte. A capacidade é reservada entre travessias; frota com carga ou movimento não serve de ponte.
- **15 ouro:** sem ponte disponível, o reino precisa controlar um porto em terra legal própria ou uma capital costeira própria. O servidor reserva o valor e cobra somente se a travessia for executada.

A formação vai diretamente de terra a terra depois dos combates navais. A chegada custa seis de moral e ainda permite batalha e cerco no destino. Se a frota for perdida/deslocada ou a rota bloqueada, a ordem é cancelada, sem converter silenciosamente uma ponte grátis em fretamento pago. Embarque explícito e a ponte naval antiga continuam disponíveis.

## Economia e forças armadas

Impostos e comércio **base** recebem multiplicador **0,55**. Melhorias de mercado/porto e indústria continuam acrescentando suas receitas. Não existe teto artificial de tesouro: uma nação pode poupar ao longo de uma campanha; o objetivo é remover receitas indevidas e tornar manutenção e investimentos relevantes.

Dízimo é recebido pelo controlador ativo da cidade sagrada. Conta somente terras legais de nações ativas, cuja fé estatal e religião provincial correspondem à cidade: **0,5 ouro por terra**. Neutros não contam. O total nacional é limitado a **6**, ou **12** se uma cidade sagrada controlada tiver templo. Sem nenhuma terra legal, a nação não recebe impostos, comércio, dízimos ou saque naval por ocupações remanescentes. Ocupações cujo controlador já foi eliminado são liberadas na resolução.

```text
armyCap = 12 + floor(terras controladas × 1,5) + níveis de quartel × 5
manpowerCap = 18 + terras próprias pacificadas × 1,5 + níveis de quartel × 8
manpowerGain = 1 + floor(terras próprias pacificadas × 0,25) + níveis de quartel × 1,5
```

Terra pacificada exige propriedade legal, controle próprio, pacificação ≥80 e revolta <50. Desgaste de guerra ≥25 multiplica a recuperação de reservas por 0,7. As reservas nunca excedem o teto. Mercado não aplica mais a antiga penalidade de reservas locais: vale a nova fórmula nacional. Quartéis acrescentam +5 de capacidade militar, +8 de reservas máximas e +1,5 de recuperação por nível.

| Unidade         | Manutenção por rodada |
| --------------- | --------------------: |
| Infantaria      |                  0,75 |
| Cavalaria       |                  1,35 |
| Artilharia      |                  2,00 |
| Navio de guerra |                  1,50 |
| Transporte      |                  0,50 |

O limite conta todas as unidades militares, incluindo navios e transportes. A parcela acima do limite custa **três vezes** a média de manutenção da composição: multiplicador nacional `1 + 2 × max(0, total − limite) / total`. Mercenários, Intendente e coalizões continuam aplicando seus modificadores. O limite é econômico; tratados de desarmamento impõem separadamente o teto obrigatório de oito unidades.

**Insolvência:** manutenção sem cobertura causa deserção por formação, de `ceil(tropas × min(0,25, déficit/manutenção))`. Esta regra completa a cobrança: chegar a zero ouro não permite manter tropas gratuitamente. Cargas são ajustadas à capacidade dos transportes restantes. O relatório registra as perdas e a nação recebe aviso.

### Recrutamento local

| Infraestrutura        | Máximo por cidade/rodada | Composição                                |
| --------------------- | -----------------------: | ----------------------------------------- |
| Sem quartel/fundição  |                        2 | Infantaria; navios ainda exigem porto     |
| Quartel 1             |                        4 | Infantaria, cavalaria e artilharia básica |
| Quartel 2 ou fundição |                        7 | Todas, com treinamento adicional de 0,10  |

Quartel acrescenta 0,10 de treinamento por nível; o bônus do último nível/fundição acumula e respeita o máximo de 1,5. A fundição mantém seus bônus de equipamento. O contador local soma recrutamento normal e mercenário, reforços e navios: cancelar e reenviar uma ordem ou contratar mercenários não contorna a capacidade já usada. Ordens regulares ainda consomem reservas, dinheiro e a ação da cidade.

## Moral, combate e logística

Recuperação de formação estacionada, sem mover ou combater:

| Local                                | Moral por rodada |
| ------------------------------------ | ---------------: |
| Terra própria pacificada             |              +35 |
| Terra própria pacificada com quartel |              +45 |
| Terra aliada ou ocupada pela nação   |              +20 |
| Cerco em terra inimiga               |               +8 |

Os bônus de comandante continuam aplicáveis. Moral é limitada a 100; defensores que lutaram não recebem recuperação estacionária na mesma rodada. Concluir a ocupação não pacifica imediatamente a cidade.

As taxas campais de baixas aumentam em 65%. Vantagem de poder ≥2 ou moral quebrada (≤25) permite +25% de baixas de perseguição. As regras existentes de cavalaria, retirada e aniquilação continuam valendo.

Ao final da rodada, uma formação em terra inimiga precisa alcançar qualquer terra legal própria não ocupada. O caminho passa por controle próprio, aliado, mesmo lado da guerra ou súdito; mares exigem frota ou porto amigo e não podem conter navios de guerra hostis. Sem caminho, fica **cercada**, perde **20 moral** e **ceil(15% das tropas)** por atrito. Intendente evita o atrito, mas não a penalidade de moral. A verificação inclui ocupações ainda pertencentes legalmente ao adversário.

### Defesa da Pátria

Decisão imediata em planejamento aberto: guerra defensiva ativa e pelo menos uma terra perdida, ocupada ou sitiada. Custa **50 ouro e 15 estabilidade**, respeitando dinheiro reservado, e tem recarga de **oito rodadas**. Cria **cinco infantarias com moral 90** na capital segura ou em outra terra legal própria livre de inimigos. Concede **+15% defesa em terra legal própria**, na rodada atual e na seguinte. Exige local seguro; não ignora ocupação da capital.

## Vitória e continuação

Bots não encerram por carta, salvo opção avançada **`allowBotSecretVictory`**, desativada por padrão. Continuam podendo vencer por dominação. Pax e Rivalidade exigem **55% de controle direto** das terras. Todas as cartas exigem **três rodadas consecutivas** de condição completa, com alertas públicos nas duas primeiras. Pax mantém também sua própria sequência de três rodadas de liderança militar/estabilidade: a primeira vitória possível ocorre na quinta rodada qualificante.

Após uma vitória, é possível encerrar/exportar ou o anfitrião escolher **Continuar Jogando (Modo Dominação Livre)**. O resultado original fica em `victoryRecord`; o planejamento reabre e novas condições de vitória não interrompem a campanha. Dominação continua em 75% com peso de 50% para súditos.

## Alertas pessoais

Declaração de guerra, chamado às armas, início de cerco, proposta de paz, aniquilação e aviso de vitória geram alertas críticos para os envolvidos. Os cartões têm som próprio, foco na província e resposta imediata quando há oferta pendente. Uma nova oferta na mesma rodada gera seu próprio aviso, mesmo com texto idêntico ao de uma proposta recusada.

A central abre em **Comunique-se / Minha Nação**, com contador de não lidos; **Jornal do Mundo** reúne eventos públicos. Leituras são individuais e persistidas. A lista de trabalho mantém os 250 avisos mais recentes; relatórios e histórico exportado preservam os eventos da rodada. As cartas adversárias continuam privadas durante a partida.

## Personalização da mesa

Cada participante muda **seu próprio nome** (até 30 caracteres) no lobby ou em **Conselho da nação → Seu nome → Salvar nome**, inclusive durante a campanha. A mudança não troca a credencial de reconexão nem desfaz ordens.

O anfitrião escolhe a **nação de cada bot** no seletor abaixo do nome dele no lobby. Nações humanas ficam indisponíveis; escolher uma nação de outro bot troca as duas, inclusive quando os oito lugares estão ocupados. Após iniciar, as nações ficam fixas.

Os atalhos antigos China–Japão e Países Baixos–Grã-Bretanha foram removidos: não são passagens terrestres. Use transporte ou alcance um estreito explícito por terra. Isso também vale para salas carregadas do disco.
