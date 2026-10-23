# Concórdia — Atlas de Impérios · v1.2

Grand Strategy multiplayer para **3–8 jogadores**, com ordens simultâneas, **oito nações assimétricas**, guerras formais, recursos estratégicos, estações, crises e coalizões. Vitória por **75% das terras, com peso de 50% para vassalos**, eliminação dos rivais ou **objetivo secreto**. As partidas não têm limite de rodadas.

## v1.2 · Browser Cinema Edition

O cliente principal é **HTML no navegador**, com React, SVG, WebGL e Canvas 2D. Não há engine externa para instalar. O servidor Node.js continua responsável pelas regras, pelas salas e pela persistência.

- **Cinematics de combate terrestre e naval** com aproximação, artilharia, salvas, carga e desfecho, baseadas no relatório real da batalha.
- **Trilha original** de paz, guerra, batalha, vitória e derrota, com transições de volume entre cenas.
- **SFX integrados** de marcha, navegação, mosquetes, canhões, aço, impacto, carga e resultados, com mixer independente.
- Cutscenes de declaração de guerra e mudança de estação, com brasões e contexto da campanha.
- Inspetor e Crônica continuam como janelas móveis e redimensionáveis sobre o mapa.

```sh
npm ci --include=dev
npm run dev
```

Abra **http://localhost:3000**. Amigos usam o endereço do anfitrião na rede Radmin, LAN ou IPv6. Veja [apresentação e controles v1.2](docs/V1_2.md) e [configuração de rede](docs/REDE.md).

### Regras preservadas da v1.1

Três rodadas por estação; 40 Ouro permitem dois Mercados de 20; movimentos de batalhões independentes; clique direito através das decorações; mares sem polígonos preenchidos. O experimento Godot foi retirado desta versão e permanece no [histórico v1.1](https://github.com/AlexandreDinizVeloso/Wargame/tree/610bba79c99f7dc7c658f806a2d59272211b1235/godot-client). As campanhas e as credenciais continuam no protocolo 7.

## v1.01 · Risk-Paced Edition & Audio/UI Fix

- **42 territórios terrestres e 10 mares**, Brasil unificado e bônus pelo domínio dos cinco continentes.
- **Ações Rápidas** para recrutar em massa com distribuição automática e previsão de custos por cidade.
- Economia escassa: 40 Ouro, 8 Recrutas e 8 Autoridade iniciais; crescimento reduzido e investimentos mais caros.
- Cinco Comandos Supremos e Conselho com crises contextuais, cartas táticas e políticas temporárias a cada quatro rodadas.
- Cinco SFX suaves, duas músicas instrumentais e mixer com seis canais independentes.
- Inspetor e Crônica/Ordens simultâneos, móveis e redimensionáveis.
- Arquivamento automático após 15 minutos, download de save pelo anfitrião e recuperação por código.
- Testes numéricos de aceitação integrados ao build.

Veja [regras, áudio, recuperação e compatibilidade v1.01](docs/V1_01.md). Saves existentes preservam seu mapa e credenciais; o novo tabuleiro vale para novas campanhas.

## v1.0 · Geografia, decisões e regência

- 95 terras e 13 mares, grandes rios com penalidade de travessia e gargalos naturais.
- Ouro, Recrutas e Autoridade em todas as gavetas; guarnições pacificadas pagam metade da manutenção.
- Dez dilemas nacionais, duas escolhas a cada quatro rodadas.
- IA tática dedicada com defesa de fronteira e concentração de forças.
- Salas públicas com entrada em bots permanentes e regência temporária anti-AFK.
- Cinco efeitos WAV reais, gerados pelo projeto e incluídos no build.

Veja [regras, compatibilidade e validação v1.0](docs/V1_0.md). Saves preservam seu tabuleiro e credenciais; as novas regras de recursos, logística e dilemas passam a valer também nas campanhas carregadas.

## v0.99 · Vertical Slice Reborn

- Mapa híbrido WebGL/SVG, oceano animado, relevo localizado e interface imperial.
- Três recursos na HUD: Ouro, Recrutas e Autoridade; valores econômicos e de poder em inteiros.
- Névoa de guerra validada pelo servidor nas novas campanhas.
- Replay em três fases e palco tático animado, móvel e redimensionável.
- Fontes locais e áudio híbrido, com síntese automática quando não houver gravações.

Veja [regras, compatibilidade e validação v0.99](docs/V0_99.md). O histórico abaixo descreve a versão anterior; a compatibilidade atual está em [v1.0](docs/V1_0.md).

## v0.98 · Gold Candidate

- Cinco lentes de mapa (F1–F5), Outliner retrátil (O) e seleção de formações sem ordens (Tab).
- Oito passivas de facção, três eras, tratados combináveis por War Score e IA diplomática.
- Quatro cenários temáticos, saves completos com convites para retomar vagas e importação de relatórios como cenários.
- Time-Lapse do mapa, perfil local com doze conquistas, Friend-Pass e cliente desktop Electron.

Veja [regras, saves, desktop e validação v0.98](docs/V0_98.md). Novas salas usam regras Gold; campanhas anteriores mantêm suas regras e credenciais.

## v0.95 · Interface, controles e áudio

- **Mouse:** esquerdo seleciona/inspeciona; direito prepara movimento, ataque ou travessia. Arrastar com direito/meio move a câmera; Alt + esquerdo sinaliza para aliados.
- **Janelas:** inspeção de 480×540, arraste pelo título, alças direita/inferior/canto, minimizar e ↺ para restaurar. Tamanho e posição ficam salvos neste navegador.
- **Conselhos e Crônica:** navegação única nas barras superior/inferior, títulos específicos e relógio independente no topo. Sem esmaecer o mapa.
- **Replay de quatro segundos:** fogo, fumaça e explosões são desmontados ao terminar; o cerco mantém somente seu anel de progresso.
- **Efeitos acústicos:** canhão, mosquetes, aço, passos, água, lona, madeira e sino sintetizados com ruído filtrado e envelopes percussivos.
- **Tática:** prévia de poder ao passar sobre um vizinho com unidade selecionada; sinal dourado com nota compartilhado apenas com a própria nação e aliados, durante seis segundos.

Veja [escopo e validação v0.95](docs/V0_95.md).

## Recursos da campanha

- **Miniaturas SVG:** estandartes heráldicos por composição, líderes/estrelas/moral, galeões com carga, rosas dos ventos comerciais e seis construções ilustradas. Cercos têm progresso, com fogo/fumaça restritos ao replay; inverno aplica geada ao norte e montanhas.
- **HUD única:** uma janela contextual alterna cidade/formação; Diplomacia, Árvore Militar, Comércio & Mares, Crises & Coalizões, Objetivos e Estatísticas abrem diretamente pelo menu superior. Esc ou clique fora fecha a consulta.
- **Áudio original:** OST de campanha e combate com música e efeitos em canais separados; transições com redução gradual de volume, mute e preferências locais.
- **Tutorial de cinco passos:** a tela inicial cria uma mesa privada de treino. Ações reais avançam o guia; o botão no topo também permite orientar uma campanha existente.
- **Crônica interativa:** gráficos por nação, inspeção de rodadas, receitas/tesouro/território/forças/vitórias e quatro títulos com empates. Dados militares antigos ausentes aparecem como lacunas; informações privadas continuam protegidas.
- **Docker Node 20 Alpine**, volume de salas, healthcheck e Compose/Caddy para HTTPS. Veja [deploy cloud](docs/DEPLOY_CLOUD.md).

O motor mantém as [regras v0.7](docs/REGRAS_V7.md), com protocolo 7 compatível e campos opcionais de estatísticas. A v0.98 adiciona as regras Gold descritas acima e mantém as janelas móveis da v0.95; consulte também o [RC anterior](docs/RELEASE_CANDIDATE.md) e o [histórico de balanceamento](docs/BALANCE.md).

## Executar

Node.js **20.19+ na linha 20, ou 22.12+**. O Docker usa `node:20-alpine`; o ambiente de desenvolvimento usa Node 24.

```sh
npm ci --include=dev
npm run dev
```

Abra a porta **3000**. O navegador de salas lista campanhas públicas desse servidor; salas privadas usam código. A demonstração cria três bots e obedece ao mesmo timer First-Ready.

```sh
npm run build
npm start
```

No Windows/PowerShell, use estes comandos na pasta que contém `package.json` (Node 24 LTS recomendado):

```powershell
npm.cmd ci --include=dev
npm.cmd run build
npm.cmd start
```

Se aparecer `'tsx' is not recognized`, a instalação das dependências não foi concluída nessa pasta. O `tsx` é uma dependência de produção local; não precisa instalar globalmente.

Motor sem interface, Vite ou dependência de `dist/`:

```sh
npm run server:headless
```

| Variável           | Padrão                        |
| ------------------ | ----------------------------- |
| `PORT`             | `3000`                        |
| `HOST`             | `0.0.0.0`; use `::` para IPv6 |
| `ROOMS_STATE_FILE` | `.local/rooms-state.json`     |

Sem banco externo, chave de API ou assets remotos. No cloud com cache pessoal sem permissão, use `npm ci --include=dev --cache /workspace/.cache/npm --no-audit --no-fund`.

## Novidades da v0.7

- Moral abaixo de 25 desorganiza o exército: ofensivas ficam bloqueadas até uma rodada de descanso em terra amiga; treinar, dividir e fundir não remove o estado.
- Atrito agregado por proprietário/província: 25% do excedente de suprimento e −20 moral nas formações vulneráveis.
- Cidades independentes ricas evoluem a cada quatro rodadas, até 12 guardas e forte 2.
- Nós marítimos rendem 3–6 ouro para a maior presença de guerra e transporte, com teto nacional 12; empates e guerra interrompem a receita.
- Bombardeio exige três navios de guerra e seis ouro: reduz um nível de forte e dá apoio terrestre de −15% de defesa até a rodada seguinte.

## Recursos mantidos da v0.6

- Estreitos terrestres visíveis no mapa e travessia entre costas em até duas zonas marítimas: frota própria disponível ou fretamento automático por 15 ouro.
- Oito posições iniciais distribuídas pelo mundo e pacto de não agressão nas rodadas 1 e 2.
- Saldo inicial próximo de +10 ouro, dízimos limitados, manutenção por tipo de unidade e custo triplo sobre a parcela acima do limite militar.
- Reservas humanas escassas, teto nacional e recrutamento local de 2/4/7 unidades conforme quartel/fundição. Insolvência causa deserção.
- Recuperação rápida de moral em casa, batalhas mais letais, linhas de suprimento e Defesa da Pátria.
- Alertas pessoais com som, foco no mapa e respostas diplomáticas; jornal mundial separado.
- Cada jogador pode alterar seu nome no lobby ou no Conselho da nação; o anfitrião escolhe a nação de cada bot antes de iniciar, inclusive trocando nações entre bots.
- Objetivos sustentados por três rodadas; bots só vencem por carta com opção avançada do anfitrião. Após a vitória, o anfitrião pode continuar em Dominação Livre.

## Nações e mundo

| Nação       | Mecânica                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Aurélia     | Vassalagem voluntária ou por tratado; recebe 25% da renda bruta dos súditos; compartilha visão e dominação          |
| Ferro-Norte | +8 ouro por baixa inimiga; moral ao saquear; resiste ao atrito comum e às penalidades da floresta                   |
| Véspera     | Mercenários imediatos em porto/mercado, −35% custo; +30% receita comercial local; visão comprável e suborno dobrado |
| Sol Invicto | Conversão +25 ouro e +10 Fervor; +20% ataque/moral em guerra religiosa e chance de agitação adjacente               |
| Kaldor      | Fortes −30%, até nível 3, causam 15% de atrito em sitiantes; artilharia −25% custo e +25% fogo                      |
| Turan       | Cavalaria pura percorre duas planícies/costas por rodada; arrasar conquista rende 80 ouro                           |
| Sapiência   | Recruta com treinamento 1,20×; vê intenções inimigas em províncias adjacentes                                       |
| Verídia     | Camuflagem em mata/colinas próprias; defesa local com +50% poder de emboscada                                       |

As 42 terras e 10 zonas marítimas usam geometria Natural Earth incorporada, de domínio público. Os teatros Europa, Américas e Ásia têm 9, 11 e 13 terras, respectivamente. As nações são ficcionais sobre geografia terrestre; o mapa não pretende reconstruir fronteiras de 1550. Quatro religiões fictícias mantêm doutrinas e cidades sagradas.

Trigo, ferro, cavalos, minas de ouro e relíquias aparecem no mapa e alteram recrutamento, ataque, suprimento, renda e moral. Primavera, verão, outono e inverno formam um ano. Uma crise a cada quatro rodadas dura duas rodadas; expansão excessiva permite coalizões de contenção.

## Comandar

- Clique em uma província para administrar, recrutar, converter e negociar com o proprietário.
- Selecione uma ficha militar: os destinos vizinhos ficam verdes (mover), vermelhos (invadir) ou azuis (transporte). Os estreitos aparecem tracejados; destinos costeiros também podem oferecer travessia gratuita ou fretamento por 15 ouro. **Clique direito** prepara o movimento; **clique esquerdo** inspeciona a região sem emitir ordens. Clique fora ou pressione **Esc** para desmarcar.
- Clique no **✕ da seta** para cancelar a marcha. O dock da formação divide 50/50, reúne forças e oferece manobras; Líder permite atribuição imediata e Detalhes contém as ordens avançadas.
- Declare guerra pela central Diplomacia, pela aba Diplomacia do Reino de uma província estrangeira ou pela confirmação ao tentar invadir em paz. **Declarar Guerra e Marchar** é uma operação atômica no servidor.
- **Scroll** ajusta zoom; botão direito/meio ou Espaço + arraste move a câmera; **1–5** troca o modo de mapa.

As janelas podem ser arrastadas, redimensionadas e minimizadas; ↺ restaura os padrões. A resolução mantém o replay do mapa e oferece cinematics de combate com pausa, salto e repetição; áudio e música podem ser silenciados separadamente.

## Ritmo e vitória

O lobby configura o prazo de **15–600 segundos**, padrão **60**. Cada rodada começa com `turnDeadlineAt: null`: o primeiro humano a confirmar inicia o relógio para todos. Todos prontos ou prazo expirado resolve a rodada. Cancelar a confirmação não reinicia o prazo. Bots não disparam o relógio. Após desconexão geral/reinício, a campanha pausa e conserva o tempo restante de um relógio já iniciado.

Objetivos secretos vêm ativados por padrão. Cada jogador recebe duas cartas no turno 1 e escolhe uma. Se não escolher, a primeira é adotada ao resolver. Metas são adaptadas ao mapa; o botão **🎯 Meu Objetivo Secreto** mostra o progresso. O servidor exige três rodadas consecutivas de condição completa, avisa todos nas duas primeiras e revela a carta vencedora ao concluir. Pax e Rivalidade exigem 55% das terras. Pax também exige três rodadas de liderança militar e estabilidade antes da sustentação da carta, permitindo vitória a partir da quinta rodada de superioridade. Bots não vencem por carta por padrão; o anfitrião pode habilitar `allowBotSecretVictory` nas opções avançadas. A vitória permite exportar o resultado ou continuar em Dominação Livre, preservando o vencedor original. Adversários não recebem as cartas, a seleção ou o progresso privado durante a partida.

Não há limite de turnos em partidas humanas. Somente o simulador usa um corte interno para encerrar a coleta. Dissolução de todos os reinos encerra sem vencedor.

## Persistência e exportação

O servidor grava snapshots atômicos, backups e hashes de tokens. Preserve `.local/` em volume persistente e use um processo por arquivo. O código da sala permite entrar no lobby; recuperar um jogador existente exige o token privado da aba.

Snapshots v0.6 migram para v0.7 com cópia `.v6-backup`. Sessões, tesouros, tropas, posições e sequências de objetivos são preservados. Ordens ofensivas e rotas são canceladas para replanejamento; confirmações e relógios são reabertos. Cidades independentes iniciam o desenvolvimento no momento da migração, sem crescimento retroativo. Resultados encerrados conservam a versão de origem. Snapshots v0.2/v0.3/v0.4/v0.5 também são aceitos, passando pelas migrações históricas com seus respectivos ajustes e backups.

JSON e TXT podem ser baixados no Conselho da nação e na tela final. O relatório inclui todas as rodadas, batalhas, economia, guerras, estações e coalizões, respeitando a visão de quem exportou. Tokens, semente privada e ordens ocultas não são exportados.

## Validar

```sh
npm run build
npm test
npx tsx scripts/smoke-browser.ts
npm run test:cartographic
npx tsx scripts/simulate-balance.ts --games=100 --seed=20261022 --mode=mixed --max-turns=159
```

O smoke inicia um servidor isolado em porta livre e abre três navegadores Chromium. É preciso Chromium instalado (`CHROMIUM_PATH` opcional; padrão `/usr/bin/chromium`). `BASE_URL` permite apontar para um servidor RC com protocolo 7 já iniciado. Artefatos ficam em `.local/`. O simulador informa vitórias e partidas ainda sem vencedor no corte, sem inventar resultado por pontos.

## Arquitetura

| Área                                                                                               | Papel                                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `shared/types.ts`, `rules.ts`, `economy.ts`, `strategy.ts`, `logistics.ts`                         | Contratos, nações, recursos, economia, objetivos e regras comuns |
| `shared/map.ts`                                                                                    | Geometria, adjacências e recursos                                |
| `server/game.ts`, `combat.ts`, `siege.ts`, `armies.ts`, `transport.ts`, `diplomacy.ts`, `world.ts` | Resolução autoritativa, combate, tratados, crises e coalizões    |
| `server/rooms.ts`, `storage.ts`, `migration.ts`                                                    | HTTP/WS, sessões, timer e persistência                           |
| `src/`                                                                                             | Cliente React/SVG, HUD, áudio e janelas                          |

`shared/` e `server/` não importam React, `src/` ou DOM. O cliente HTML consome o [protocolo 7](docs/PROTOCOL.md), também disponível por HTTP para integrações. Consulte [regras v0.7](docs/REGRAS_V7.md), [validação/balanceamento](docs/BALANCE.md), [cartografia](docs/CARTOGRAFIA.md) e [rede sem IPv4 público](docs/REDE.md). As regras e resultados v0.2/v0.3/v0.4/v0.5/v0.6 em `docs/` são arquivos históricos.

Análise das partidas anteriores: [plano da v0.7](docs/PLANO_V7.md). A direção atual está na [v0.95](docs/V0_95.md).
