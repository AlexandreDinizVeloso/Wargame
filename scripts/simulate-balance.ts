import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { addPlayer, BALANCE, createGame, resolveTurn, startGame } from '../server/game';
import { objectiveFor } from '../server/state';
import { OBJECTIVES } from '../shared/types';
import type { BotArchetype, Objective } from '../shared/types';

const ARCHETYPES: BotArchetype[] = ['Militarist', 'Merchant', 'Theocrat', 'Diplomat'];
const CONDITIONS: Objective[] = ['conquest', 'prosperity', 'concord', 'faith'];
interface MatchResult {
  seed: number;
  winnerId: string | null;
  winnerArchetype: BotArchetype | null;
  condition: Objective | null;
  turns: number;
  battles: number;
  retreats: number;
  stackwipes: number;
  rebellions: number;
  attritionLosses: number;
}
export function simulateBalance(games = 200, seed = 20261020) {
  if (!Number.isInteger(games) || games < 1 || games > 10000 || !Number.isSafeInteger(seed))
    throw new Error('Use 1–10000 partidas e uma semente inteira.');
  const matches: MatchResult[] = [];
  for (let i = 0; i < games; i++) {
    const gameSeed = (seed + Math.imul(i + 1, 2654435761)) >>> 0;
    const g = createGame(`SIM${i.toString().padStart(4, '0')}`, 'campaign', true, gameSeed);
    for (let seat = 0; seat < 6; seat++) {
      const archetype = ARCHETYPES[(seat + i) % 4];
      addPlayer(g, `${archetype} ${seat + 1}`, true, objectiveFor(archetype), archetype);
    }
    startGame(g, 0);
    const result: MatchResult = {
      seed: gameSeed,
      winnerId: null,
      winnerArchetype: null,
      condition: null,
      turns: 0,
      battles: 0,
      retreats: 0,
      stackwipes: 0,
      rebellions: 0,
      attritionLosses: 0,
    };
    for (let turn = 0; turn < 40 && g.phase === 'planning'; turn++) {
      const report = resolveTurn(g, turn * g.turnSeconds * 1000);
      result.battles += report.battles.filter((b) => b.outcome !== 'siege_blocked').length;
      result.retreats += report.retreats.length;
      result.stackwipes += report.stackwipes.length;
      result.rebellions += report.rebellions.length;
      result.attritionLosses += report.attritionLosses.reduce((n, a) => n + a.losses, 0);
      for (const player of g.players)
        if (
          [player.gold, player.manpower, player.influence].some((n) => !Number.isFinite(n) || n < 0)
        )
          throw new Error(`Recursos inválidos: semente ${gameSeed}, rodada ${g.turn}.`);
      for (const p of g.provinces)
        if (
          !Number.isInteger(p.troops) ||
          p.troops < 0 ||
          p.mercenaries < 0 ||
          p.mercenaries > p.troops ||
          p.training < 1 - 0.000001 ||
          p.training > 1.500001 ||
          p.morale < 0 ||
          p.morale > 100
        )
          throw new Error(`Exército inválido: semente ${gameSeed}, ${p.id}, rodada ${g.turn}.`);
    }
    if (g.phase !== 'finished') throw new Error(`Partida ${i} não terminou em até 40 turnos.`);
    const winner = g.players.find((p) => p.id === g.winnerId);
    result.winnerId = g.winnerId;
    result.winnerArchetype = winner?.botArchetype ?? null;
    result.condition = g.winnerObjective;
    result.turns = g.turn;
    matches.push(result);
  }
  const conditions = CONDITIONS.map((id) => {
    const wins = matches.filter((m) => m.condition === id).length;
    return { id, name: OBJECTIVES[id].name, wins, rate: (wins / games) * 100 };
  });
  const mean = (
    key: 'turns' | 'battles' | 'retreats' | 'stackwipes' | 'rebellions' | 'attritionLosses',
  ) => matches.reduce((n, m) => n + m[key], 0) / games;
  return {
    games,
    seed,
    balance: structuredClone(BALANCE),
    conditions,
    archetypes: ARCHETYPES.map((archetype) => ({
      archetype,
      wins: matches.filter((m) => m.winnerArchetype === archetype).length,
    })),
    means: {
      turns: mean('turns'),
      battles: mean('battles'),
      retreats: mean('retreats'),
      stackwipes: mean('stackwipes'),
      rebellions: mean('rebellions'),
      attritionLosses: mean('attritionLosses'),
    },
    draws: matches.filter((m) => !m.winnerId).length,
    balanced: conditions.every((c) => c.rate >= 10 && c.rate <= 45),
    matches,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (key: string) =>
    process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  const result = simulateBalance(
    Number(argument('games') ?? 200),
    Number(argument('seed') ?? 20261020),
  );
  console.log(
    `\nConcórdia · ${result.games} partidas headless · 6 bots · até 40 rodadas · semente ${result.seed}\n`,
  );
  console.table(
    result.conditions.map((c) => ({
      Condição: c.name,
      Vitórias: c.wins,
      'Taxa (%)': c.rate.toFixed(1),
      'Faixa 10–45%': c.rate >= 10 && c.rate <= 45 ? 'OK' : 'AJUSTAR',
    })),
  );
  console.table([
    {
      'Turnos / partida': result.means.turns.toFixed(2),
      'Batalhas / partida': result.means.battles.toFixed(2),
      'Recuos / partida': result.means.retreats.toFixed(2),
      'Aniquilações / partida': result.means.stackwipes.toFixed(2),
      'Revoltas / partida': result.means.rebellions.toFixed(2),
      'Perdas de suprimento / partida': result.means.attritionLosses.toFixed(2),
    },
  ]);
  console.table(result.archetypes.map((a) => ({ Arquétipo: a.archetype, Vitórias: a.wins })));
  const output = argument('output');
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(`Resultados completos: ${output}`);
  }
  console.log(
    result.balanced
      ? 'Todas as condições estão na faixa solicitada neste conjunto de sementes.'
      : 'Há condições fora da faixa. Ajuste as constantes e execute novamente.',
  );
  if (!result.balanced || result.draws > 0) process.exitCode = 1;
}
