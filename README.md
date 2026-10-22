# Concórdia — Atlas de Impérios · v0.6

Grand Strategy multiplayer para **3–8 jogadores**, com ordens simultâneas, **oito nações assimétricas**, guerras formais, recursos estratégicos, estações, crises e coalizões. Vitória por **75% das terras, com peso de 50% para vassalos**, eliminação dos rivais ou **objetivo secreto**. As partidas não têm limite de rodadas.

## Prévia visual desta branch

Esta branch inclui o **protótipo cartográfico 2,5D da v0.7**, sobre o motor e protocolo v0.6. O mapa tem relevo ilustrado, costas e símbolos de infraestrutura. Um único painel contextual alterna entre cidade e formação; consultas abrem ao centro. No **Conselho da nação**, desmarque **Mapa cartográfico · painel único** para comparar com a interface clássica. A preferência é salva no navegador.

Veja [escopo e validação da prévia](docs/PREVIA_V7.md). As propostas de novos limites de moral, neutros evolutivos e comércio naval estão no [plano de regras](docs/PLANO_V7.md); o protótipo visual usa as regras v0.6.

## Executar

Node.js **22.12+** (validado com Node 24).

```sh
npm ci
npm run dev
```

Abra a porta **3000**. O navegador de salas lista campanhas públicas desse servidor; salas privadas usam código. A demonstração cria três bots e obedece ao mesmo timer First-Ready.

```sh
npm run build
npm start
```

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

## Novidades da v0.6

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
| Ferro-Norte | +8 ouro por baixa inimiga; moral ao saquear; ignora inverno e penalidades da floresta                               |
| Véspera     | Mercenários imediatos em porto/mercado, −35% custo; +30% receita comercial local; visão comprável e suborno dobrado |
| Sol Invicto | Conversão +25 ouro e +10 Fervor; +20% ataque/moral em guerra religiosa e chance de agitação adjacente               |
| Kaldor      | Fortes −30%, até nível 3, causam 15% de atrito em sitiantes; artilharia −25% custo e +25% fogo                      |
| Turan       | Cavalaria pura percorre duas planícies/costas por rodada; arrasar conquista rende 80 ouro                           |
| Sapiência   | Recruta com treinamento 1,20×; vê intenções inimigas em províncias adjacentes                                       |
| Verídia     | Camuflagem em mata/colinas próprias; defesa local com +50% poder de emboscada                                       |

As 56 terras e 13 zonas marítimas usam geometria Natural Earth incorporada, de domínio público. Os teatros Europa, Américas e Ásia têm 16 terras cada. As nações são ficcionais sobre geografia terrestre; o mapa não pretende reconstruir fronteiras de 1550. Quatro religiões fictícias mantêm doutrinas e cidades sagradas.

Trigo, ferro, cavalos, minas de ouro e relíquias aparecem no mapa e alteram recrutamento, ataque, suprimento, renda e moral. Primavera, verão, outono e inverno formam um ano. Uma crise a cada quatro rodadas dura duas rodadas; expansão excessiva permite coalizões de contenção.

## Comandar

- Clique em uma província para administrar, recrutar, converter e negociar com o proprietário.
- Selecione uma ficha militar: os destinos vizinhos ficam verdes (mover), vermelhos (invadir) ou azuis (transporte). Os estreitos aparecem tracejados; destinos costeiros também podem oferecer travessia gratuita ou fretamento por 15 ouro. Clique esquerdo ou direito prepara o movimento. Clique fora ou pressione **Esc** para desmarcar.
- Clique no **✕ da seta** para cancelar a marcha. A HUD inferior divide 50/50, reúne formações, abre recrutamento, entrincheira e permite arrasar quando aplicável.
- Declare guerra pelo brasão no topo, pelo painel de uma província estrangeira ou pelo modal ao tentar invadir em paz. **Declarar Guerra e Marchar** é uma operação atômica no servidor.
- **Scroll** ajusta zoom; botão direito/meio ou Espaço + arraste move a câmera; **1–5** troca o modo de mapa.

As janelas podem ser arrastadas, redimensionadas, desanexadas e minimizadas. A resolução tem replay de quatro segundos e áudio sintetizado com opção de silenciar.

## Ritmo e vitória

O lobby configura o prazo de **15–600 segundos**, padrão **60**. Cada rodada começa com `turnDeadlineAt: null`: o primeiro humano a confirmar inicia o relógio para todos. Todos prontos ou prazo expirado resolve a rodada. Cancelar a confirmação não reinicia o prazo. Bots não disparam o relógio. Após desconexão geral/reinício, a campanha pausa e conserva o tempo restante de um relógio já iniciado.

Objetivos secretos vêm ativados por padrão. Cada jogador recebe duas cartas no turno 1 e escolhe uma. Se não escolher, a primeira é adotada ao resolver. Metas são adaptadas ao mapa; o botão **🎯 Meu Objetivo Secreto** mostra o progresso. O servidor exige três rodadas consecutivas de condição completa, avisa todos nas duas primeiras e revela a carta vencedora ao concluir. Pax e Rivalidade exigem 55% das terras. Pax também exige três rodadas de liderança militar e estabilidade antes da sustentação da carta, permitindo vitória a partir da quinta rodada de superioridade. Bots não vencem por carta por padrão; o anfitrião pode habilitar `allowBotSecretVictory` nas opções avançadas. A vitória permite exportar o resultado ou continuar em Dominação Livre, preservando o vencedor original. Adversários não recebem as cartas, a seleção ou o progresso privado durante a partida.

Não há limite de turnos em partidas humanas. Somente o simulador usa um corte interno para encerrar a coleta. Dissolução de todos os reinos encerra sem vencedor.

## Persistência e exportação

O servidor grava snapshots atômicos, backups e hashes de tokens. Preserve `.local/` em volume persistente e use um processo por arquivo. O código da sala permite entrar no lobby; recuperar um jogador existente exige o token privado da aba.

Snapshots v0.5 migram para v0.6 com cópia `.v5-backup`. Sessões, tesouros, tropas e posições são preservados. Limites militares e de reservas são recalculados, reservas acima do teto são ajustadas, objetivos são reescalados e suas sequências são reiniciadas. Marchas, travessias e recrutamentos são cancelados para replanejamento; confirmações e relógios são reabertos. Os novos spawns e a calibração inicial de impostos valem para partidas novas. Resultados encerrados ficam arquivados com sua versão de origem. Snapshots v0.2/v0.3/v0.4 também são aceitos com backups próprios; campanhas anteriores à introdução das cartas não recebem objetivos retroativos.

JSON e TXT podem ser baixados na HUD e na tela final. O relatório inclui todas as rodadas, batalhas, economia, guerras, estações e coalizões, respeitando a visão de quem exportou. Tokens, semente privada e ordens ocultas não são exportados.

## Validar

```sh
npm run build
npm test
npx tsx scripts/smoke-browser.ts
npm run test:cartographic
npx tsx scripts/simulate-balance.ts --games=100 --seed=20261022 --mode=mixed --max-turns=159
```

O smoke inicia um servidor isolado em porta livre e abre três navegadores Chromium. É preciso Chromium instalado (`CHROMIUM_PATH` opcional; padrão `/usr/bin/chromium`). `BASE_URL` permite apontar para um servidor v0.6 já iniciado. Artefatos ficam em `.local/`. O simulador informa vitórias e partidas ainda sem vencedor no corte, sem inventar resultado por pontos.

## Arquitetura

| Área                                                                                               | Papel                                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `shared/types.ts`, `rules.ts`, `economy.ts`, `strategy.ts`, `logistics.ts`                         | Contratos, nações, recursos, economia, objetivos e regras comuns |
| `shared/map.ts`                                                                                    | Geometria, adjacências e recursos                                |
| `server/game.ts`, `combat.ts`, `siege.ts`, `armies.ts`, `transport.ts`, `diplomacy.ts`, `world.ts` | Resolução autoritativa, combate, tratados, crises e coalizões    |
| `server/rooms.ts`, `storage.ts`, `migration.ts`                                                    | HTTP/WS, sessões, timer e persistência                           |
| `src/`                                                                                             | Cliente React/SVG, HUD, áudio e janelas                          |

`shared/` e `server/` não importam React, `src/` ou DOM. Um cliente Godot pode consumir o [protocolo 6](docs/PROTOCOL.md). Consulte [regras v0.6](docs/REGRAS_V6.md), [validação/balanceamento](docs/BALANCE.md), [cartografia](docs/CARTOGRAFIA.md) e [rede sem IPv4 público](docs/REDE.md). As regras e resultados v0.2/v0.3/v0.4/v0.5 em `docs/` são arquivos históricos.

Próxima etapa: [protótipo 2,5D e interface com painel único](docs/PLANO_V7.md).
