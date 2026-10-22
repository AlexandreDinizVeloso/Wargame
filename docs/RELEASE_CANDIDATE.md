# Concórdia · pacote v0.8/v0.9 Release Candidate

Branch: `feat/v0.8-v0.9-release-candidate`. Release: **0.9.0-rc.1**. Protocolo e snapshots: **7**, compatíveis com as salas v0.7. O motor de economia, guerra, logística e vitória mantém as regras anteriores; esta entrega acrescenta apresentação, aprendizado, estatísticas e configuração de nuvem.

## Entrega por pilar

| Pilar       | Implementação                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Miniaturas  | `MapMiniatures.tsx`: escudos por composição dominante, borda/gradiente nacional, pergaminho de efetivo, moral curva, coroas/estrelas, entrincheiramento e alerta logístico; galeões com velas, ondas, medalhão guerra/transporte e carga; rosas dos ventos com controlador e receita. |
| Cartografia | Seis prédios vetoriais, progresso/fogo/fumaça de cerco, geada no norte e montanhas no inverno, rotas de comércio em Bézier pontilhado. Unidades e nós não usam `<rect>`; os retângulos restantes do Atlas são fundos de água/textura.                                                 |
| Interface   | Um `ContextualInspectorDock`, com abas de cidade ou comando/líder/detalhes. Consultas globais são abas de um único `TopBarModal`, com foco de teclado, Esc e fechamento ao clicar no mapa. Relatório fica recolhido até solicitado; alertas críticos começam como badge.              |
| Áudio       | Acordes dedilhados de paz e pulsos/cordas de guerra com Web Audio, música independente dos efeitos e suspensão da paisagem sonora em aba oculta. Transição de rodada de 2,5 segundos resume batalhas pessoais.                                                                        |
| Tutorial    | Entrada cria mesa privada com um humano e dois bots. O guia acompanha marcha, conquista por cerco, construção resolvida, recrutamento/líder e visitas à diplomacia, mares e objetivos. Não fornece recursos extras a campanhas comuns.                                                |
| Crônica     | Gráficos SVG por nação, seleção de medida, legenda interativa e inspeção por rodada; quatro títulos com empates. Resultado mantém Sandbox/JSON/TXT em rodapé visível.                                                                                                                 |
| Nuvem       | Docker multi-stage Node 20 Alpine, usuário `node`, healthcheck e volume `.local`; Compose/Caddy para HTTPS e WebSocket. [Guia de deploy](DEPLOY_CLOUD.md).                                                                                                                            |

## Área do mapa e comportamento

No fluxo cartográfico normal em **1440×960**, a soma das superfícies de HUD e do contexto foi verificada em **até 20% da tela**. A central é uma consulta solicitada pelo jogador e ocupa mais área enquanto aberta. O tutorial é uma camada temporária de aprendizado. No celular, a prioridade é manter os controles acessíveis sem rolagem externa, com dock e consultas rolando internamente; a meta de 80% não é prometida em telas pequenas.

A opção de relevo no Conselho muda a cartografia; ambos os estilos usam a mesma organização de dock/central. Esta direção substitui as consultas simultâneas e móveis da prévia v0.7, conforme o novo pedido unificado.

## Dados reais e privacidade

Cada nova rodada registra efetivos terrestres/navais, níveis de fortificação e número de nós comerciais controlados em `TurnHistory.analytics`. Campanhas antigas não ganham números militares retrospectivos: os gráficos mostram lacunas. Economia e controle usam o histórico que já existia.

Totais militares de adversários sem compartilhamento de visão são removidos durante o planejamento e revelados no resultado. Exportações respeitam a mesma visão. Cartas secretas, ordens alheias, tokens e semente privada continuam protegidos.

- Marechal: batalhas vencidas do placar.
- Magnata: soma de impostos e comércio efetivamente recebidos.
- Bastião: cercos concluídos ×10 + níveis de fortes atuais; o critério aparece no card.
- Oceanos: soma dos nós controlados por rodada desde o início do registro detalhado.

Empates compartilham o título; valor zero não inventa um vencedor.

## Validação reproduzível

```sh
npm run build
npm test
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npx tsx scripts/smoke-browser.ts
npx tsx scripts/smoke-cartographic.ts
npm run format:check
docker build -t concordia:0.9.0-rc.1 .
npm run test:docker
```

- **207 testes:** os 199 anteriores e oito cenários novos para SVG, seis construções/cerco, estatísticas, privacidade, lacunas históricas, medalhas e persistência da mesa de tutorial.
- **Multiplayer:** três navegadores, lobby, edição de nomes, nações de bots, guerra, recrutamento, construção, líderes, doutrinas, cerco, transporte, First-Ready, alertas, exportações, reconexão e sandbox.
- **Cartografia/RC:** miniaturas sem caixas, seis prédios, neve/cerco, área da HUD, dock exclusivo, central com abas/foco/Esc/clique externo, volumes separados, celular, tutorial completo e gráficos/medalhas.
- **Docker:** build de frontend dentro de Node 20 Alpine; execução como `node`; HTTP/frontend/health e WebSocket; gravação e recuperação autenticada de sala, dinheiro, tropas, posição e ordem após reiniciar com o mesmo volume. O teste roda seu cliente dentro do contêiner e remove apenas os próprios recursos temporários.
- **Compose:** configuração validada com domínio de teste. Certificado público, DNS e disponibilidade de provedor dependem da implantação real, que não é criada por estes arquivos.

As imagens de revisão ficam em `.local/screenshots/rc-*`; não contêm recursos remotos ou arte provisória. O bundle carrega consultas e análises sob demanda. Não foi feito benchmark de FPS em GPU específica nem ensaio de carga para prometer um número de salas por VPS.

## Continuidade e balanceamento

O servidor do ambiente foi reiniciado com **cinco salas, seis sessões e 21 jogadores**. A comparação preservou credenciais de reconexão, ordens, dinheiro, reservas, turnos, tropas e posições; os healthchecks IPv4 e IPv6 responderam com `0.9.0-rc.1`. Salas v7 carregam sem redistribuição de recursos. O campo de estatísticas é opcional e começa nas próximas resoluções. Backups seguem a persistência existente.

O histórico de [balanceamento v0.7](BALANCE.md) continua aplicável às regras. O RC não comprova duração de 60 minutos ou equilíbrio competitivo entre nações; essas medidas exigem partidas humanas. Os modos rápido e mundial continuam sem encerramento artificial por número de rodadas.
