# Regras da v0.7

Complementa a [v0.6](REGRAS_V6.md). Estreitos, fretamento, economia base, recrutamento, diplomacia, objetivos e personalização seguem aquelas regras.

## Moral e reorganização

Exércitos com moral **abaixo de 25** ficam desorganizados. Não podem entrar ofensivamente em terras neutras/inimigas, atravessar para atacá-las, desembarcar nelas ou assaltar cercos. Podem defender e recuar/mover por terra amiga. A validação ocorre ao enviar a ordem e na resolução; uma mudança durante o planejamento pode cancelar a marcha.

Para reorganizar, passe **uma rodada completa sem mover, combater, treinar, arrasar ou embarcar**, em terra controlada pela própria nação, aliado, mesmo lado da guerra ou súdito. É necessário terminar com moral ≥25, sem insolvência, fome ou cercamento. A recuperação de moral continua seguindo a v0.6. Treinar dá +8 moral, mas não substitui o descanso. Fusão e divisão preservam a desorganização, inclusive quando a moral média sobe.

Uma formação que inicia um movimento com moral 25 pode pagar o custo de marcha e lutar nessa chegada; uma nova ofensiva fica impedida se a moral cair abaixo do limiar. Neutros não recebem recuperação econômica de nações jogadoras.

## Excesso de suprimento

Por **proprietário e província**, somam-se as unidades estacionadas. O excedente sofre `ceil(excedente × 0,25)` baixas, distribuídas proporcionalmente entre formações vulneráveis. Dividir uma pilha na mesma terra não reduz a perda agregada. Cada formação vulnerável sofre **−20 moral**, após a recuperação normal, e não pode reorganizar nessa rodada.

O Intendente protege a própria formação; doutrina naval T3 protege frotas. A parcela vulnerável recebe uma fração proporcional das baixas, com arredondamento para cima. Inverno em terra inimiga dobra perdas, exceto para Ferro-Norte. O cercamento tem verificação e penalidades próprias, que podem acumular; Intendente evita as baixas por cercamento, mas não seus −20 de moral.

## Cidades independentes

Terras sem proprietário/ocupante, com imposto base ≥7, recurso comercial, mina de ouro ou relíquia, evoluem nas rodadas **4, 8, 12…**. Não evoluem sob cerco ou com exército estrangeiro presente.

| Nível | Guarnição alvo | Forte desejado |
| ----- | -------------: | -------------: |
| 0     |              2 |              0 |
| 1     |              4 |              0 |
| 2     |              6 |              1 |
| 3     |              8 |              1 |
| 4     |             10 |              2 |
| 5     |             12 |              2 |

Cada onda acrescenta **no máximo duas infantarias** até o alvo; uma guarda destruída não reaparece inteira imediatamente. Treinamento mínimo sobe de 1,08 até 1,20 e moral mínima de 64 até 80. Um novo forte exige espaço livre; fortes existentes não são removidos. No teto, ondas continuam repondo perdas até o alvo. A inspeção mostra nível, alvo e próxima onda. Campanhas migradas começam no nível zero sem crescimento retroativo.

## Comércio marítimo

Cada uma das 13 zonas marítimas possui um nó de **3–6 ouro/rodada**. Uma nação com terra legal ativa precisa manter na zona pelo menos um navio de guerra e um transporte, somados entre frotas operacionais com moral ≥25 e sem exército embarcado.

A presença vale `2 × navios de guerra + transportes`. A maior presença recebe a receita inteira; empate ou qualquer navio de guerra hostil na zona interrompe o comércio. Dividir frotas não multiplica a receita. O teto nacional é **12 ouro/rodada**, incluído uma única vez no comércio e no saldo. Bônus comerciais nacionais e embargos não multiplicam este componente fixo.

Veja os valores e a disputa na inspeção de uma zona marítima ou em **Mundo & Coalizões → Rotas marítimas e cidades independentes**. Frotas ainda pagam manutenção e podem transportar, bloquear costas ou apoiar guerra em vez de patrulhar.

## Bombardeio costeiro

Uma frota estacionada no mar adjacente precisa de **três navios de guerra**, moral ≥25 e **seis ouro livres**. O alvo deve ser costa neutra ou inimiga em guerra; navio de guerra hostil na zona impede a ação. Bombardear ocupa a ação da frota e é incompatível com marcha ou ponte nessa rodada.

Ao resolver, o servidor revalida a frota e sua posição, desconta seis ouro, reduz **um nível de forte** e aplica **−15% de defesa terrestre contra a nação atacante**, na rodada atual e na seguinte. A frota perde oito de moral. Uma costa recebe no máximo um bombardeio por rodada; ação cancelada não é cobrada.

O bombardeio ocorre depois das marchas e dos combates navais, antes das travessias e do avanço dos cercos. Assim, apoia a chegada por transporte na mesma rodada e ataques terrestres na seguinte; não altera retroativamente uma batalha terrestre já resolvida. Não ocupa a cidade sozinho. O bloqueio naval de −20% acumula multiplicativamente com o apoio (0,8 × 0,85 = 0,68), quando ambos se aplicam.

## Interface

Todas as consultas, o Conselho, o manual, a confirmação de guerra e o resultado usam janelas flutuantes, móveis, redimensionáveis, minimizáveis e fecháveis. Não há camada que escureça ou bloqueie o mapa. Província/formação alternam um único contexto; as demais janelas podem coexistir. Arraste o título e o canto inferior direito. Esc fecha a janela ativa. Geometria e preferência de HUD são salvas neste navegador, respeitando a área disponível ao mudar de tela.
