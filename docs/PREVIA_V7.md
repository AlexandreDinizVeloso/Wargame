# Prévia cartográfica 2,5D

Cliente experimental sobre o motor e protocolo v0.6. A branch estável é `feat/v0.6-economy-naval-spawns-alerts`; esta prévia fica em `feat/v0.7-cartographic-ui`.

## Interface

- **Um contexto por vez:** província ou formação no canto inferior esquerdo. Selecionar outro objeto substitui o painel. Fechar o comando também desmarca o exército.
- **Cidade:** abas Construir, Recrutar e Diplomacia. Terreno, religião e suprimento ficam em detalhes expansíveis; a capacidade local de recrutamento continua visível na aba apropriada.
- **Formação:** composição, moral e manobras rápidas. General, treinamento, divisão detalhada, composição e embarque explícito ficam em General e ordens avançadas.
- **Consultas centrais:** mundo, diplomacia, objetivos, doutrinas e relatórios. Esc fecha a consulta; o foco do teclado fica nela enquanto aberta.
- **Alertas:** o aviso crítico mais recente fica destacado; Ver todos abre a central pessoal. Som, foco no mapa e respostas diplomáticas continuam disponíveis.
- **Comparação:** Conselho da nação → Mapa cartográfico · painel único. Desmarcar recupera as janelas clássicas; marcar ativa a prévia. Preferência local, sem alterar a sala ou as regras.

No desktop de referência (1440×960), o cartão contextual cobre até 20% da área. No celular ele vira folha inferior limitada a 44% da altura, com rolagem interna. Consultas centrais ocupam mais área enquanto são solicitadas; o alvo de 80% livre se refere ao contexto de jogo, não a uma consulta modal.

## Mapa

Camadas SVG de costa, espessura ilustrada e luz, padrões de montanhas/colinas/florestas, água e símbolos de forte, quartel, porto, mercado, fundição e templo. O relevo ilustra a categoria de terreno da província; não representa altitude geográfica medida nem uma cena 3D.

Na visão geral, ficam as formações nacionais e as capitais, enquanto guarnições neutras, recursos e nomes secundários surgem ao selecionar, passar o ponteiro ou aproximar a câmera. O mapa econômico mostra os recursos. Destinos costeiros continuam destacados, com o preço de fretamento no alvo focado e o resumo da rota escolhida no comando.

A renderização usa o cliente existente, sem novas dependências, assets externos ou exigência de GPU WebGL. Isso permite avaliar navegação e estilo antes de trocar renderer. Não foi executado benchmark de FPS na GTX 1060.

## Validação

```sh
npm run build
npm test
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npx tsx scripts/smoke-browser.ts
npm run test:cartographic
npm run format:check
```

Os 184 testes do motor passam. O smoke clássico mantém a cobertura dos três navegadores, lobby, bots, nomes, guerras, cerco, líderes, alertas, sandbox e persistência. O teste cartográfico usa sala temporária com três participantes e verifica:

- existência das camadas de relevo e infraestrutura;
- exclusividade do painel, área coberta no desktop e altura no celular;
- abas, construção de quartel, bloqueio de cavalaria sem infraestrutura e comando avançado;
- consulta central, foco de teclado e fechamento com Esc;
- travessia Portugal–Brasil, taxa de 15 ouro e custo da construção, resolução e início de cerco;
- foco de alerta, edição do próprio nome e comparação clássica/cartográfica.

Imagens são geradas em `.local/screenshots/v7-cartographic-desktop.png` e `v7-cartographic-mobile.png`. Salas e sessões desses testes são temporárias. Os resultados de balanceamento continuam sendo os da v0.6 porque a prévia não muda o motor.
