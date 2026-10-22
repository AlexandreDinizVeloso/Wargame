# Interface cartográfica da v0.7

Mapa 2,5D no cliente React/SVG, com motor e protocolo v0.7. A prévia anterior está preservada na branch `feat/v0.7-cartographic-ui`; a implementação de regras e a revisão de interface estão em `feat/v0.7-morale-neutral-naval`.

## Popups sobre o mapa

- **Todas as janelas** são móveis e redimensionáveis: província, formação, Mundo & Coalizões, Diplomacia, Doutrinas, objetivos, relatórios, manual, Conselho da nação, confirmação de guerra e resultado.
- **Sem escurecimento de fundo:** abrir uma janela não adiciona backdrop, não desfoca o tabuleiro e não bloqueia os cliques fora dela.
- **Arrastar:** segure o título. **Redimensionar:** arraste o canto inferior direito. Há botões para fixar/desanexar, minimizar/restaurar e fechar.
- **Foco:** interagir por ponteiro ou teclado traz a janela para frente. Esc fecha a janela ativa. Não há aprisionamento do teclado nas consultas.
- **Persistência:** posição, tamanho, fixação e minimização são salvos por janela neste navegador. Ao mudar a viewport, os limites mantêm o título e os controles acessíveis.
- **Contexto único:** selecionar cidade substitui o comando da formação e vice-versa na HUD compacta. Consultas globais podem permanecer abertas juntas, inclusive enquanto o contexto muda.

A abertura padrão do contexto ocupa até 20% no desktop de referência (1440×960). O jogador pode ampliá-lo. No celular, as janelas são limitadas à viewport e usam rolagem interna; permanecem móveis e ajustáveis.

## HUD e conteúdo

A HUD compacta mantém recursos e confirmação no topo, atalhos de consulta e abas inferiores. A faixa repetida de nações e ferramentas secundárias de telemetria ficam recolhidas; exportações e preferências estão no Conselho. O aviso crítico mais recente fica destacado e a central pessoal reúne os demais.

Cidade tem abas Construir, Recrutar e Diplomacia. Terreno, religião e suprimento ficam em detalhes expansíveis. Formação mostra composição, moral, desorganização e manobras; general e comandos detalhados ficam expansíveis. Operações navais oferecem bombardeio com custo e motivo de indisponibilidade. Zonas marítimas mostram valor, controlador e disputa do comércio. Mundo reúne a lista de nós e as regras de evolução neutra.

**Conselho da nação → Mapa cartográfico · HUD compacta** permite comparar com a interface clássica, que também usa popups. A preferência é local e não muda a sala.

## Cartografia

Camadas SVG de costa, espessura ilustrada, luz, montanhas/colinas/florestas, água e símbolos de infraestrutura. O relevo ilustra categorias de terreno; não representa altitude medida ou cena 3D. Na visão geral aparecem formações nacionais e capitais; guarnições neutras, recursos e nomes secundários surgem ao selecionar, passar o ponteiro ou aproximar a câmera.

Destinos costeiros continuam destacados, com preço de fretamento e resumo da rota. A renderização não acrescenta dependências, assets externos ou exigência de GPU WebGL. FPS na GTX 1060 não foi medido.

## Revisão reproduzível

```sh
npm run build
npm test
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run test:browser
npm run test:cartographic
npm run format:check
```

O teste cartográfico verifica arraste real pelo ponteiro, redimensionamento, minimizar/restaurar, coexistência de Mundo/Diplomacia/Doutrinas, Esc, interação com o mapa descoberto e reabertura com geometria salva. Também cobre manual, contexto único, construção/recrutamento, travessia Portugal–Brasil com três participantes, custos, alertas, nome e viewport móvel. O fluxo clássico cobre confirmações de guerra e resultado como popups, além de multiplayer/persistência.

Imagens são geradas em `.local/screenshots/v7-floating-consultations.png`, `v7-cartographic-desktop.png` e `v7-cartographic-mobile.png`; salas e sessões dos testes são temporárias. Regras e validação do motor ficam em [REGRAS_V7.md](REGRAS_V7.md) e [BALANCE.md](BALANCE.md).
