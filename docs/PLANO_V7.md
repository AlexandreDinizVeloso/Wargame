# Próximo protótipo · v0.7

## Direção escolhida

**Mapa cartográfico 2,5D no navegador, com um único painel contextual.** Manter o motor TypeScript headless e o acesso por link. O primeiro protótipo visual usa o renderer SVG existente, com camadas de relevo, costa, terreno e símbolos; não exige trocar de engine para avaliar legibilidade e navegação.

O alvo no desktop é manter cerca de 80% do tabuleiro descoberto: contexto fixo no canto inferior esquerdo, província ou formação por vez. Construir, recrutar e negociar viram abas explícitas. Doutrinas, objetivos, mundo e relatórios abrem consultas centrais sob demanda, fechadas com Esc. No celular, usar folha inferior com altura limitada e conteúdo rolável, preservando uma área útil de mapa.

## O que a partida de 36 rodadas confirma

A telemetria enviada é v0.5: 102 batalhas e duas guerras formais. Das 94 batalhas contra neutros, 78 tinham defesa de duas tropas; as outras tinham uma, três ou quatro. Portanto, havia predominância de guarnições pequenas, sem demonstrar que toda província tinha exatamente duas tropas em todo momento.

A formação `army-63` aparece marchando com 20 tropas na rodada 3. O histórico não exporta todas as ordens de recrutamento, então não permite confirmar isoladamente a quantidade exata recrutada na rodada 1. O limite local de 2/4/7 e o novo manpower da v0.6 passam a impedir recrutamento massivo sem infraestrutura.

Nas Guianas, a formação perdeu uma tropa sobre limite 14 na rodada 3 e duas sobre limite 10,5 na rodada 4. Em Rio da Prata, rodada 14, venceu com moral inicial zero e poder 14,48. A recuperação rápida da v0.6 melhora a capacidade de descansar, mas **ainda não proíbe ofensivas com moral baixa**.

China–Japão e Países Baixos–Grã-Bretanha eram adjacências terrestres explícitas. A v0.6 remove esses atalhos, inclusive na carga de snapshots, e oferece transporte pago/gratuito conforme infraestrutura. França–Grã-Bretanha e Coreia–Japão continuam estreitos intencionais. O movimento Ártico–Alasca, isoladamente, não comprova desembarque ilegal: o relatório antigo não registra todos os vínculos/cargas durante cada rodada.

O estado final contém 25/128/164 tropas terrestres de Verídia/Sapiência/Aurélia, respectivamente; contando navios, os totais são 29/131/167. Esses valores sustentam a necessidade de revisar reposição e economia, sem confundir frota com exército terrestre.

## Experimentos de regras após avaliar a v0.6

As propostas abaixo precisam ser comparadas com a nova economia antes de virar regras definitivas.

| Problema                            | Experimento                                                                                                   | Cuidado / medida                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Conquistar sem descansar            | Moral <25 impede entrada ofensiva, inclusive contra neutros; recuar e mover em terra amiga permanece possível | Verificar novamente na resolução de ordens simultâneas; exibir motivo e recuperação esperada                               |
| Pilhas acima do suprimento          | Perder 25% do excedente e −20 moral                                                                           | Calcular por proprietário/província para divisão de pilhas não evitar perdas; manter imunidades explícitas                 |
| Neutros frágeis por toda a campanha | Cidades ricas aumentam guarnição/forte a cada quatro rodadas, com teto 6–12 e indicador visível               | Evitar que expansionistas iniciais ganhem vantagem ainda maior por conquistar antes do crescimento                         |
| Pouco interesse em marinha          | Nós comerciais disputáveis e bloqueio claro, além de transporte                                               | +10–25 ouro por mar pode ultrapassar a economia inicial inteira; começar com valores menores e medir concentração de renda |
| Bombardeio resolve tudo sozinho     | Apoio costeiro limitado, anunciado e com custo/contrajogo                                                     | Destruir automaticamente um forte por rodada e reduzir defesa em 35% favorece snowball naval; medir antes de adotar        |

A exigência de porto/frota em **todos** os estreitos mudaria o acesso terrestre pedido para a v0.6. Para a próxima rodada de desenho, comparar estreitos estreitos gratuitos sob bloqueio naval versus grandes travessias que exigem infraestrutura. Fretamento simplifica transporte; frota deve valer também por comércio, bloqueio, escolta e projeção de força.

## Gráficos e engine

| Caminho                      | Reaproveitamento              | Custo principal                                                            |
| ---------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| SVG/Canvas cartográfico 2,5D | Motor e cliente React atuais  | Arte, legibilidade, animações e perfil de renderização                     |
| Three.js no navegador        | Motor; parte da interface     | Malhas, câmera, seleção, assets, WebGL e desempenho em máquinas diferentes |
| Godot desktop/web            | Protocolo e servidor headless | Recriar cliente, cenas e controles; exportação e distribuição              |

Godot também exporta para web; não exige obrigatoriamente distribuir `.exe`. Tamanho do download e FPS dependem do projeto, assets, renderer e hardware. A estimativa de “60 FPS cravados na GTX 1060” no texto enviado não foi medida e não é uma garantia técnica.

## Sequência de entrega

1. Publicar v0.6 validada, com escolha da nação dos bots pelo anfitrião e edição do próprio nome no lobby/campanha.
2. Criar protótipo visual separado: painel único, consultas centrais, ícones de infraestrutura, relevo cartográfico e mapa menos carregado.
3. Jogar uma partida curta com humanos; medir área do mapa coberta, tempo para emitir ordem, erros de clique e fluidez.
4. Escolher parâmetros de moral, atrito, neutros e marinha usando a telemetria da v0.6. Migrar renderer/engine somente se o protótipo e medições indicarem necessidade.
