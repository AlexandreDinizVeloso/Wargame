# Concórdia: proposta de design e brainstorm

## A experiência que queremos

Uma noite de estratégia entre 3–8 pessoas: movimentar exércitos deve ser simples, mas decidir por que lutar, como pagar a guerra e com quem negociar deve criar profundidade. O jogador precisa entender a situação pelo mapa, pelo orçamento e por poucos indicadores, sem administrar dezenas de unidades e janelas.

As escolhas confirmadas para este primeiro protótipo são:

| Tema            | Escolha                                                      |
| --------------- | ------------------------------------------------------------ |
| Duração         | Modo Rápido de aproximadamente 60 min; Campanha de 3–5 h     |
| Cenário         | Terra histórica, regiões e religiões reais                   |
| Período inicial | Europa entre 1450 e 1650; primeiro recorte por volta de 1550 |
| Ritmo           | Ordens simultâneas, resolvidas em conjunto                   |
| Foco            | Equilíbrio entre guerra e negociação                         |
| Alianças        | Podem romper, com perda de reputação e trégua curta          |

O nome Concórdia é provisório. O produto desejado é um jogo de decisões sociais e territoriais; números menores e poucas ações ajudam a manter as decisões legíveis.

## O ciclo de uma rodada

**Observar → negociar → preparar ordens → confirmar → resolver → receber rendimentos.**

Cada província pode marchar, recrutar, treinar, desenvolver, pacificar ou receber uma missão religiosa. Isso cria escolhas locais: recrutar impede treinar naquele turno; pacificar uma conquista adia a expansão; desenvolver economia mantém um exército parado. O custo de oportunidade traz parte da complexidade sem acrescentar muitos recursos.

As ordens ficam privadas. Ações locais e saída de tropas acontecem primeiro. As marchas chegam em iniciativa definida por uma semente do servidor, alterada por rodada; a rapidez do envio não dá prioridade. Entradas sucessivas na mesma região ainda são resolvidas sequencialmente. Batalhas conjuntas entre coalizões e encontros de exércitos em trânsito ficam para uma evolução do sistema.

## Modos

| Regra                            | Rápido, implementado | Campanha, implementada      |
| -------------------------------- | -------------------- | --------------------------- |
| Jogadores                        | 3–8, contando bots   | 3–8, contando bots          |
| Regiões                          | 32                   | 32, para comparar as regras |
| Limite de rodadas                | 20                   | 40                          |
| Prazo por rodada                 | 3 minutos            | 6 minutos                   |
| Vitória antecipada               | 16 pontos            | 28 pontos                   |
| Economia, crença, moral e pactos | Sim                  | Sim                         |
| Suprimento por província         | Não                  | Sim                         |
| Desgaste de guerra               | Não                  | Sim                         |

Uma partida de 20 rodadas só usa uma hora se as rodadas consumirem quase todo o tempo; confirmar cedo encurta a sessão. Na Campanha, o teto de planejamento soma 4 h, acrescido de conexão e lobby. São parâmetros experimentais, não durações verificadas em grupos humanos. A meta de 3–5 h exige sessões de teste.

Possível evolução da Campanha: 48–64 regiões, vassalagem, acordos comerciais, navegação e um pequeno conjunto de eventos. Esses itens ainda não existem no protótipo. É preferível testar o ciclo principal antes de ampliar o mapa e o número de sistemas.

## Economia e população

Cada região tem um perfil econômico. Agricultura gera mais reservas de recrutamento; entrepostos geram mais ouro; centros religiosos geram influência. Ferro identifica regiões mineradoras, mas ainda não dá bônus próprio de recrutamento: é uma hipótese a testar.

Ouro paga recrutamento, desenvolvimento e manutenção. Reservas representam a população disponível, sem simular censos ou grupos sociais. Influência é usada nas missões e é perdida ao trair um pacto. Não há recursos de consumo separados como madeira e ferro; introduzir isso agora aumentaria a administração antes de provar o ciclo principal.

Renda base: agricultura 4, comércio 6, ferro 3, centro religioso 3. Cada nível de desenvolvimento acrescenta 2 à base. A revolta reduz a renda pela fórmula `floor((base + nível × 2) × (1 − revolta/150))`, com mínimo 1. A manutenção nacional é `ceil(tropas/3)`. Não existe bônus por completar um continente.

Desenvolver custa 16, 24 e 32 ouro para os três níveis. Recrutar custa 9 ouro e 3 reservas por 3 tropas. O orçamento só usa recursos já disponíveis: impostos futuros não financiam ordens da rodada atual.

Ideias para testar depois: rotas comerciais que dependem de um porto seguro; tarifa negociada entre vizinhos; empréstimo com pagamento futuro; bloqueio de comércio em vez de anexação. Um tratado comercial simples provavelmente oferece mais decisões interessantes que quatro moedas de recursos físicos.

## Exércitos e logística

O jogador controla exércitos como números em províncias, não regimentos individuais. Cada exército tem tropas, moral e treinamento. Veteranos podem superar uma força um pouco maior; não devem tornar números irrelevantes.

Treinar custa 6 ouro, aumenta treinamento em 18 e moral em 8. Recrutas chegam com moral 60 e treinamento 25; os indicadores são combinados pela média ponderada. Marchar reduz a moral das tropas que se deslocam em 6. Uma guarnição mínima de 1 fica na origem. Províncias próprias permitem reunir forças; alianças não dão trânsito militar nesta versão.

Força de combate: `tropas × (0,65 + moral × 0,006) × (0,8 + treinamento × 0,005)`. O defensor recebe 12%. O atacante recebe variação de −7% a +7%, calculada no servidor. A crônica informa vitória, derrota e baixas. Uma versão futura deve mostrar uma estimativa de força antes de confirmar a marcha.

Na Campanha, a capacidade local é 6 + 3 por desenvolvimento + 3 em região agrícola. Cada tropa excedente perde 3 de moral na fase econômica. Combate em uma rodada aumenta desgaste nacional em 10; paz reduz 6. A cada 20 de desgaste, províncias ganham 1 de revolta por rodada. Assim, concentrar todo o exército e lutar sempre tem custo crescente.

Artilharia, cavalaria e fortalezas são boas expansões possíveis. A recomendação inicial é experimentar **três posturas** (marcha, defesa, cerco) antes de acrescentar vários tipos de tropa.

## Diplomacia e reputação

Uma aliança exige aceitação dos envolvidos e bloqueia ataques mútuos. Cada reino tem até duas. Aceitar um pacto cancela ataques entre os aliados que já tenham sido planejados. Bots aceitam propostas quando a confiança é zero ou positiva.

Romper custa 4 influência, 10 de moral nas suas províncias e 50 de confiança com o ex-aliado. A trégua protege a rodada atual e a seguinte. A perda de confiança é bilateral: reputação global, coalizões automáticas, garantias e guerras justificadas ainda são ideias, não funcionalidades.

O conselho público serve para negociar verbalmente. Só a aliança criada pelos botões tem efeito obrigatório nas regras. Transferência de dinheiro, empréstimo e troca de províncias ainda não são ações disponíveis.

Para o próximo ciclo, eu escolheria **tratados comerciais** e **paz negociada com indenização ou vassalagem**. Ambos criam saídas para guerras sem exigir anexação completa. Pactos secretos são interessantes, mas acrescentam interface e informação oculta; devem vir depois de o multiplayer básico estar testado.

## Religião, integração e pacificação

As religiões usam as mesmas fórmulas. Não há atributo de superioridade cultural, moral ou econômica ligado a uma religião real. O sistema representa lealdade institucional, integração e conflito político de forma abstrata.

O mapa inclui catolicismo, anglicanismo, protestantismo, ortodoxia e islã sunita. Províncias e Estados estão muito simplificados; as fronteiras confessionais e políticas de 1550 não estão reproduzidas fielmente. Países recebem uma crença oficial, mas províncias podem seguir outra.

Tolerância reduz a revolta em 4 por rodada, inclusive onde há outra crença. Política confessional gera 1 influência adicional por província da crença oficial; nas demais, gera 6 de revolta por rodada. Duas missões religiosas concluem uma conversão, com custo total de 16 ouro e 4 influência e acréscimo de 12 revolta antes dos ajustes de rodada. Pacificação reduz 25 de revolta por 8 ouro. Conquistar aumenta revolta em 35. A partir de 85, uma província se rebela.

A coexistência deve ser uma estratégia viável. Sugestões futuras: concílios como eventos de negociação; autonomia local em troca de menos renda; missões que aumentam influência institucional antes de qualquer conversão. Não há expulsão ou perseguição de populações no protótipo.

## Objetivos além da dominação

O legado é escolhido antes de a campanha começar e é público nesta versão. Os caminhos implementados são:

| Legado            | Pontuação atual                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Supremacia        | 1 por província + 1 a cada 2 batalhas vencidas                                                           |
| Prosperidade      | 2 por nível de desenvolvimento + 1 a cada 30 ouro + 1 por entreposto estável                             |
| Concórdia         | 1 por província estável + até 6 por paz consecutiva + 2 por aliança ativa com reino que tenha território |
| Legado espiritual | 2 por província estável da crença oficial + 1 a cada 2 conversões                                        |

Estabilidade significa revolta até 25. A vitória é verificada após cada resolução. Ao terminar o limite de rodadas, vence o maior legado entre reinos com território; desempates usam províncias, ouro e identificador de sessão. Pontos religiosos não são concedidos apenas por combater outra fé.

Essas escalas **não estão equilibradas entre si**. Por exemplo, converter e expandir em regiões já católicas pode facilitar um objetivo espiritual; a pontuação de comércio depende da distribuição de entrepostos. Antes de uma versão competitiva, os caminhos precisam de metas próprias, pontuação normalizada e comparação em partidas humanas. O protótipo serve para testar se as decisões são interessantes.

Outros objetivos possíveis: proteger uma cidade de outro jogador; manter um corredor comercial; unir cidades por tratado; encerrar três guerras como mediador; preservar fronteiras por várias rodadas; controlar santuários sem exigir uniformidade religiosa. Minha preferência é combinar um objetivo público com dois contratos pessoais secundários, para evitar que todos ataquem automaticamente quem está perto de vencer.

## Decisões para a próxima conversa

Estas perguntas ficam abertas para depois de experimentar o ciclo atual; não foram usadas como bloqueio para construir o protótipo.

1. **Derrota:** ser eliminado e acompanhar, ou virar vassalo com condições de libertação? Para 3–5 h, recomendo vassalagem para manter as pessoas na partida.
2. **Vitória:** objetivo totalmente público, objetivo secreto ou legado público com contratos privados? Recomendo a terceira opção depois de equilibrar o básico.
3. **Combate:** uma força abstrata, três posturas ou tipos de unidade? Recomendo testar posturas primeiro.
4. **Informação:** exércitos sempre visíveis ou espionagem limitada a fronteiras? O protótipo mantém o mapa público; só ordens são secretas.
5. **Comércio:** renda passiva ou rotas e tratados negociáveis? Recomendo rotas simples ligando regiões específicas.
6. **História:** simulação fiel ou partida equilibrada com assimetrias moderadas? O mapa atual é um tabuleiro experimental, e não resolve essa escolha.

## Tecnologia escolhida

| Opção                              | Vantagem                                                                            | Custo para este projeto                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| React + TypeScript + SVG + Node.js | Amigos abrem no navegador; boa documentação; mesma linguagem nas regras e interface | Construir as regras e a resolução multiplayer explicitamente                                         |
| Godot                              | Editor visual, cenas e boas ferramentas 2D                                          | Exportação e integração de rede adicionam trabalho para uma interface estratégica com muitos painéis |
| Unity                              | Ecossistema amplo e recursos 3D                                                     | Instalação, editor e distribuição maiores que o necessário neste protótipo                           |

Escolhi a primeira opção porque o desafio principal é interface, diplomacia e regras, e não renderização 3D. O SVG funciona bem com 32–64 regiões. Se um mapa muito maior exigir, a camada visual pode migrar para Canvas/Pixi sem reescrever o servidor.

O servidor é a autoridade: recebe ordens, verifica propriedade e orçamento, resolve e distribui resultados. Clientes não recebem ordens adversárias. WebSocket mantém sala, conselho e estado sincronizados. Para a próxima etapa técnica, persistência em SQLite é suficiente para guardar campanhas; PostgreSQL passa a fazer sentido com múltiplos servidores ou hospedagem que exija banco externo.

## Sequência sugerida

1. Jogar a demonstração e uma sessão curta com 3 pessoas; observar decisões, confusão e duração.
2. Ajustar orçamento, combate e metas de vitória; implementar salvamento/restauração.
3. Substituir a grade por um mapa geográfico, com rotas marítimas explícitas.
4. Introduzir vassalagem, paz negociada e comércio.
5. Testar campanhas longas; só então acrescentar eventos, espionagem ou tipos de tropa.
