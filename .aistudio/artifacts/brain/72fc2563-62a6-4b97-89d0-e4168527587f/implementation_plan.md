# Plano de Transformação: Concórdia — Grand Strategy Game Experience

Plano diretor de redesenho audiovisual e mecânico para transformar o **Concórdia** de uma interface web para uma experiência imersiva de jogo de grande estratégia (inspirada nos clássicos da Paradox como *Europa Universalis IV*, *Crusader Kings III* e no dinamismo cartográfico de *Civilization VI*).

---

## Decisões Confirmadas com o Usuário

> [!IMPORTANT]
> - **Inspiração Principal**: Fusão do design diegético da Paradox (*Crusader Kings III*, *Europa Universalis IV*, *Victoria 3*) com a clareza e dinamismo cartográfico de *Civilization VI*.
> - **Prioridade Máxima**: HUD imersivo com molduras ornamentadas, ornamentos em latão/ouro envelhecido, painéis diegéticos em pergaminho/veludo e acabamento visual de jogo clássico de impérios.
> - **Intensidade Audiovisual**: Feedback completo — partículas táticas no mapa, vibração em impactos de cerco/combate, animações ricas de marcha e transição de estações.
> - **Trilha Sonora & Efeitos (OST/SFX)**: Expansão e refinamento do motor sonoro (Web Audio DSP + assets) com instrumentos de época mais encorpados (alaúdes, tímpanos, fanfarras, trompas de guerra) e SFX táteis de interface (sinetes de cera, fechos de ferro, pergaminhos e moedas).

---

## 1. Estudo Comparativo de Rivais (Paradox & Civilization)

| Rival | Pontos Fortes (Sucesso) | Pontos Fracos (Pecados) | Aplicação no Concórdia |
| :--- | :--- | :--- | :--- |
| **Europa Universalis IV & CK3** (Paradox Interactive) | • Atmosfera diegética incomparável: pergaminho real, brasões heráldicos, selos de cera, relevo em bronze e ouro.<br>• Sensação física de assinar tratados, declarar guerras e governar reinos.<br>• Efeitos sonoros táteis e orquestração histórica autêntica. | • Sobrecarga de abas e "efeito planilha": excesso de números miúdos sem respiro.<br>• Menus secundários cinzentos e visualmente secos.<br>• Curva de frustração por falta de clareza imediata nas ordens. | **Adotar a estética de molduras douradas, cantoneiras clássicas, veludo real e selos de cera**, mas mantendo o dock unificado e acessível sem afundar o jogador em 50 abas de planilha. |
| **Civilization VI** (Firaxis Games) | • Cartografia viva e dinâmica: mapa que respira (nuvens estilizadas, relevo marcante, traçados de movimento elegantes).<br>• Estandartes de unidades com feedback visual imediato de moral, vida e status.<br>• Áudio reativo à era e clima de guerra. | • Aspecto por vezes excessivamente caricato/desenho animado.<br>• Finais de jogo com poluição visual densa nos tabuleiros.<br>• Transições repetitivas e menus flutuantes desconexos. | **Adotar os traçados dinâmicos de marcha com setas curvas de vetor, partículas de impacto e estandartes tridimensionais com relevo**, mantendo a sobriedade heráldica e histórica. |

---

## 2. Experiência do Usuário & Identidade Visual

### A. Eliminação do Aspecto "Website"
1. **Moldura Cartográfica Global (Game Viewport Frame)**:
   - Substituição das bordas retas da janela do navegador por uma moldura imperial: chanfro em latão gravado, cantoneiras em filigrana metálica nos quatro cantos da tela e vinheta sutil nos limites do mapa.
   - Bússola estilizada (Rosa dos Ventos em ouro e bronze) integrada aos controles de câmera e zoom.
2. **Top Bar Imperial (Royal Council HUD)**:
   - Fim dos botões retangulares modernos de site: a barra superior se torna a **Galeria da Coroa**, com compartimentos em metal escovado para Recursos (Tesouro Real com baú e brilho de moedas, Mobilização de Homens com estandarte de infantaria, Autoridade Imperial com coroa cintilante).
   - O indicador de Rodada, Estação e Era ganha aspecto de relógio astronômico renascentista, com o símbolo da estação (Floco de Neve glacial no Inverno, Sol dourado no Verão, Folha de Carvalho no Outono, Flor de Lis na Primavera) e barra de progresso em esmalte vitrificado.
3. **Painéis Diegéticos & Janelas Flutuantes**:
   - As gavetas e modais (Conselho, Províncias, Batalhões, Diplomacia, Dilemas e Relatórios de Turno) deixam de ser "modais web escuros" e assumem texturas de pergaminho antigo encadernado em couro carmesim ou azul-marinho com bordas folheadas a ouro.
   - Botões principais com efeito chanfrado de gema/placa metálica, efeito de clique com afundamento tátil (`active:translate-y-0.5`) e som metálico de engate.
   - Tratados e Dilemas com selos de cera vermelha carimbados com o emblema do reino remetente.

### B. Cores, Tipografia e Texturas
- **Tipografia**: Ouro e pergaminho liderados por `Cinzel` (display régio e títulos de reinos), `EB Garamond` (prosa de tratados, dilemas e crônicas imperiais) e `Plus Jakarta Sans` / `tabular-nums` para valores táticos numéricos.
- **Paleta 60-30-10**:
  - *60% Tela e Relevo*: Azul-petróleo oceânico profundo (`#0b161f`) e tons de terra cartográfica iluminada.
  - *30% Superfícies Estruturais*: Pergaminho envelhecido (`#1a2430` a `#222f3e` com bordas ouro velho `#c5a86d` e divisores de linha heráldicos).
  - *10% Acentos Focais*: Ouro imperial (`#f2d69b`), vermelho carmesim de guerra (`#c0392b`), esmeralda de paz (`#27ae60`) e púrpura de regência.

---

## 3. Animações e Dinâmica Tática

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BARRA IMPERIAL DA COROA                         │
│  [Brasão]  Tesouro: 420g   Tropas: 12.000   Moral: 85%   [Outono - Ano III] │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MAPA CARTOGRÁFICO VIVO                          │
│   • Trajetória de marcha com setas vetoriais pontilhadas brilhantes    │
│   • Fumaça e fagulhas em províncias sitiadas                           │
│   • Ondulação translúcida em frotas e travessias navais               │
│   • Flashes de artilharia e dispersão de moral nas escaramuças        │
└────────────────────────────────────────────────────────────────────────┘
           │                                                │
           ▼                                                ▼
┌──────────────────────┐                         ┌───────────────────────┐
│ PAINEL DE COMANDO    │                         │ MODAL DE COMBATE      │
│ Estandartes 3D       │                         │ CINEMÁTICO            │
│ Efeitos de Terreno   │                         │ Choque de Infantaria, │
│ Ações Rápidas Dieg.  │                         │ Artilharia e Flancos  │
└──────────────────────┘                         └───────────────────────┘
```

1. **Marcha & Movimento de Tropas**:
   - Animação de traçado: linhas de rota tática com traçado pulsante em direção ao destino.
   - Poeira de marcha sob o estandarte ao confirmar ordem e clique de bota/cascos.
2. **Cercos & Combate**:
   - Efeitos de fumaça e brasas na província durante cerco ativo.
   - No modal de batalha tática: barras de moral com animação de tensão dinâmica, disparos sincronizados de mosquetes e canhões com flash luminoso e trepidação suave de tela (*screen shake*).
3. **Transição de Estações**:
   - Efeito visual sazonal na tela (ventania de neve no inverno, névoa matinal e folhas douradas no outono) integrado ao banner de rodada.

---

## 4. Áudio & Sonoplastia (OST & SFX)

1. **Trilhas Sonoras (OST)**:
   - Enriquecer as sínteses procedurais e a reprodução de áudio para dar timbre de orquestra barroca/renascentista real:
     - **Atlas das Coroas (Paz)**: Acordes ressonantes de cordas graves, alaúde percussivo e flautas de madeira.
     - **Estandartes ao Vento (Guerra)**: Tímpanos pesados, ostinato rítmico acelerado e metais imponentes.
     - **Aço e Pólvora (Batalha)**: Tambores marciais de caixa alta e crescendo dramático.
     - **O Peso da Vitória & Depois das Cinzas**: Fanfarra gloriosa vs. elegia melancólica para derrotas.
2. **Sonoplastia Tátil (SFX)**:
   - Clique em território: eco sutil de pedra/mesa de campanha de madeira.
   - Seleção de batalhão: tinir de malha de ferro e desembainhar de espada.
   - Recrutamento e Ouro: chocalhar vigoroso de moedas de ouro em saco de veludo.
   - Tratados e Alianças: som rasgado de pergaminho se desenrolando e estalo do carimbo no sinete de cera.
   - Trompa de Guerra: chamado reverberante de trompa metálica ao declarar guerra ou receber invasão.

---

## 5. Balanceamento e Ajustes Mecânicos

1. **Economia de Guerra vs. Paz**:
   - Refinamento do atrito de exércitos além do teto de suprimentos da província.
   - Bônus de colheita no Outono e impacto severo de frio no Inverno para alinhar ao ciclo estratégico de campanhas históricas.
2. **Composição Tática das Forças**:
   - Ajustar o multiplicador de armas combinadas (Infantaria como linha de frente protetora, Cavalaria com bônus devastador de flanqueamento em campos abertos e Artilharia acelerando o colapso de fortalezas).

---

## 6. Correção de Bugs Visuais e CSS Faltante

1. **Correção de Alinhamentos e Transbordamentos**:
   - Ajustar barras de rolagem nativas para estilização temática (trilho de madeira escura com puxador dourado envelhecido).
   - Eliminar quebras de linha indesejadas em botões táticos e sobreposições nos drawers contextuais.
2. **Tooltips e Guias de Terreno**:
   - Tooltips com moldura entalhada e fundo pergaminho, exibindo modificadores de defesa, rios e penalidades de terreno com ícones límpidos.
3. **Responsividade & Escala da Mesa**:
   - Garantir que todas as resoluções (de laptops 1366px até telas 4K) mantenham a escala correta do HUD sem cobrir o centro do mapa.

---

## Próximos Passos na Execução
Após a aprovação deste plano:
1. Implementar o novo tema CSS diegético (molduras douradas, relógio de estações, pergaminhos e botões tácteis).
2. Atualizar os componentes de HUD (`TopBarModal`, `App.tsx`, `BattalionDrawer`, `ProvinceDrawer`, `TurnResolutionSequencer`).
3. Refinar o motor de áudio e sonoplastia em `src/audio.ts` e `shared/audioDSP.ts`.
4. Adicionar partículas e animações táticas no mapa e no combate.
5. Rodar testes de compilação e validação para garantir funcionamento estável em 60 FPS.
