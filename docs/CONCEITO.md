# Concórdia: conceito e evolução

## Direção escolhida

Uma sessão de estratégia entre 3–8 pessoas, com decisões de guerra, economia, religião e negociação. O mapa deve permitir compreender a situação rapidamente; cada conquista cria despesas e trabalho de integração.

As preferências confirmadas são cenário histórico, Europa entre 1450 e 1650, equilíbrio entre guerra e diplomacia, ordens simultâneas e alianças rompíveis com custo e trégua. O primeiro tabuleiro usa regiões por volta de 1550.

Rápido tem até 20 rodadas de 3 minutos. Campanha tem até 40 de 7,5 minutos. Metas de vitória, confirmação antecipada e escolhas do grupo alteram a duração; ainda é necessário medir sessões humanas de 60 minutos e 3–5 horas.

## Decisões que já podem ser experimentadas

- **Conquistar ou integrar:** província recém-tomada rende pouco; uma guarnição ou uma ordem de pacificação precisa torná-la sustentável.
- **Concentrar ou distribuir tropas:** treinamento, moral, terreno e fortificações ajudam; excesso de soldados sofre atrito e manutenção progressiva.
- **Recrutar ou contratar:** recrutas consomem população; mercenários são imediatos e mais caros de manter.
- **Acordo ou pressão:** alianças, acesso militar, tributos, subsídios, embargos e financiamento de rebeldes produzem consequências reais.
- **Conversão ou coexistência:** missões podem alterar uma província vizinha e preparar uma pretensão religiosa; diferenças reduzem a eficiência fiscal.
- **Quatro legados:** supremacia, prosperidade, concórdia e influência espiritual podem vencer a partida. A hegemonia aos 75% dá aos adversários uma chance de reagir.

Todas as crenças usam as mesmas fórmulas. O sistema abstrai instituições e integração política, sem atribuir superioridade cultural a religiões reais. Estados, fronteiras e crenças do mapa são simplificados.

## Interface e tecnologia

O mapa ocupa o viewport. A câmera permite movimento e zoom; dados aparecem em camadas política, religiosa, econômica/logística, diplomática e de estabilidade. HUD, gavetas, conselho, ordens e relatórios ficam sobrepostos ao tabuleiro.

React/TypeScript/SVG oferece acesso pelo navegador e rapidez para iterar essa interface. O motor não depende dessa escolha: `shared/` mantém contratos e fórmulas, `server/` resolve comandos e `src/` apenas apresenta o estado e envia intenções. Um cliente Godot pode consumir o mesmo WebSocket; esse cliente ainda não foi implementado.

O servidor faz salvamento em JSON local, com escrita atômica e backup. A separação permite migrar a persistência para SQLite ou outro banco quando a operação precisar disso, preservando regras e protocolo.

## Balanceamento

Os seis bots da simulação usam quatro arquétipos: Militarist, Merchant, Theocrat e Diplomat. Composição e posições são rotacionadas entre partidas para reduzir a associação entre uma nação e um estilo.

A verificação automática exige 10–45% de vitórias para cada condição em 200 partidas. Os resultados, parâmetros e comandos reprodutíveis estão em [BALANCE.md](BALANCE.md). Isso mede o comportamento dos bots e é uma base para testes humanos.

## Próximas decisões de design

1. **Derrota:** eliminação ou vassalagem com possibilidade de libertação? A implementação atual mantém o derrotado como espectador; vassalagem ajudaria a manter todos envolvidos em sessões longas.
2. **Informação:** o mapa atual é público, com ordens privadas. Espionagem e inteligência limitada podem aumentar a incerteza depois de testar a negociação básica.
3. **Mapa:** substituir a grade esquemática por províncias geográficas e conexões marítimas explícitas.
4. **Vitória:** testar legados públicos com contratos pessoais secundários, em vez de depender apenas de barras de progresso visíveis.
5. **Comércio:** acrescentar rotas e acordos bilaterais além da renda local, embargo e subsídio já implementados.
6. **Combate:** avaliar posturas de marcha/defesa/cerco antes de introduzir muitos tipos de unidade.

As fórmulas e decisões de arredondamento em uso estão em [REGRAS_V2.md](REGRAS_V2.md). O contrato de integração está em [PROTOCOL.md](PROTOCOL.md).
