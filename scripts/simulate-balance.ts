import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { addPlayer, BALANCE, createGame, resolveTurn, startGame, viewFor } from '../server/game';
import { validGame } from '../server/storage';
import { NATIONS, telemetry, unitCount } from '../shared/rules';
import {
  OBJECTIVES,
  type BotArchetype,
  type GameMode,
  type Objective,
  type Theater,
} from '../shared/types';
const ARCHETYPES: BotArchetype[] = ['Militarist', 'Merchant', 'Theocrat', 'Diplomat'];
interface MatchResult {
  seed: number;
  mode: GameMode;
  theater: Theater;
  winnerId: string | null;
  winnerArchetype: BotArchetype | null;
  condition: Objective | null;
  finishReason: import('../shared/types').GameState['finishReason'];
  turns: number;
  battles: number;
  retreats: number;
  stackwipes: number;
  rebellions: number;
  wars: number;
  peaceTreaties: number;
  navalBattles: number;
  movements: number;
  attritionLosses: number;
  dietMembers: number;
  telemetryTurns: number;
}
export function simulateBalance(
  games = 200,
  seed = 20261020,
  scenario: 'mixed' | 'quick' | 'campaign' = 'mixed',
) {
  if (!Number.isInteger(games) || games < 1 || games > 10000 || !Number.isSafeInteger(seed))
    throw new Error('Use 1–10000 partidas e uma semente inteira.');
  const matches: MatchResult[] = [];
  for (let i = 0; i < games; i++) {
    const gameSeed = (seed + Math.imul(i + 1, 2654435761)) >>> 0,
      mode = scenario === 'mixed' ? (i % 2 ? 'campaign' : 'quick') : scenario,
      theater = (['EUROPE', 'AMERICAS', 'ASIA'] as const)[Math.floor(i / 2) % 3];
    const g = createGame(`SIM${i.toString().padStart(4, '0')}`, mode, true, gameSeed, theater);
    for (let seat = 0; seat < 6; seat++) {
      const archetype = ARCHETYPES[(seat + i) % 4];
      addPlayer(g, `${archetype} ${seat + 1}`, true, NATIONS[(seat + i) % 8].id, archetype);
    }
    startGame(g, 0);
    const result: MatchResult = {
      seed: gameSeed,
      mode,
      theater,
      winnerId: null,
      winnerArchetype: null,
      condition: null,
      finishReason: null,
      turns: 0,
      battles: 0,
      retreats: 0,
      stackwipes: 0,
      rebellions: 0,
      wars: 0,
      peaceTreaties: 0,
      navalBattles: 0,
      movements: 0,
      attritionLosses: 0,
      dietMembers: 0,
      telemetryTurns: 0,
    };
    while (g.phase === 'planning') {
      const r = resolveTurn(g, g.turn * g.turnSeconds * 1000);
      if (!validGame(g)) throw new Error(`Estado inválido: semente ${gameSeed}, rodada ${r.turn}.`);
      for (const a of g.battalions) {
        if (a.embarkedArmyId) {
          const cargo = g.battalions.find((c) => c.id === a.embarkedArmyId);
          if (
            !cargo ||
            cargo.embarkedOnId !== a.id ||
            unitCount(cargo) > a.transports * 4 ||
            cargo.provinceId !== a.provinceId
          )
            throw new Error(`Carga naval inválida: semente ${gameSeed}, ${a.id}.`);
        }
      }
      for (const b of r.battles.filter((b) => b.defenderId))
        if (
          !g.wars.some(
            (w) =>
              w.startedTurn <= r.turn &&
              (w.endedTurn === null || w.endedTurn >= r.turn) &&
              ((w.attackerIds.includes(b.attackerId) && w.defenderIds.includes(b.defenderId!)) ||
                (w.defenderIds.includes(b.attackerId) && w.attackerIds.includes(b.defenderId!))),
          )
        )
          throw new Error(`Batalha sem guerra formal: ${gameSeed}, ${b.id}.`);
      result.battles += r.battles.filter((b) => b.outcome !== 'siege_blocked').length;
      result.retreats += r.retreats.length;
      result.stackwipes += r.stackwipes.length;
      result.rebellions += r.rebellions.length;
      result.navalBattles += r.battles.filter((b) => b.naval).length;
      result.movements += r.movements.length;
      result.attritionLosses += r.attritionLosses.reduce((n, a) => n + a.losses, 0);
    }
    const exported = telemetry(viewFor(g, g.players[0].id));
    if (
      exported.turnByTurnHistory.length !== g.history.length ||
      exported.battles.length !== g.history.reduce((n, h) => n + h.battles.length, 0)
    )
      throw new Error('Telemetria incompleta.');
    const winner = g.players.find((p) => p.id === g.winnerId);
    result.winnerId = g.winnerId;
    result.winnerArchetype = winner?.botArchetype ?? null;
    result.condition = g.winnerObjective;
    result.finishReason = g.finishReason;
    result.turns = g.turn;
    result.wars = g.wars.length;
    result.peaceTreaties = g.history
      .flatMap((h) => h.diplomaticChanges)
      .filter((c) => c.action === 'PEACE').length;
    result.dietMembers = g.diet.memberRealmIds.length;
    result.telemetryTurns = g.history.length;
    matches.push(result);
  }
  const conditions = (['DOMINATION', 'IMPERIAL_PACIFICATION'] as Objective[]).map((id) => ({
    id,
    name: OBJECTIVES[id].name,
    wins: matches.filter((m) => m.condition === id).length,
    rate: (matches.filter((m) => m.condition === id).length / games) * 100,
  }));
  const mean = (
    key:
      | 'turns'
      | 'battles'
      | 'retreats'
      | 'stackwipes'
      | 'rebellions'
      | 'wars'
      | 'peaceTreaties'
      | 'navalBattles'
      | 'movements'
      | 'attritionLosses',
  ) => matches.reduce((n, m) => n + m[key], 0) / games;
  return {
    schemaVersion: 3,
    games,
    seed,
    scenario,
    balance: structuredClone(BALANCE),
    conditions,
    draws: matches.filter((m) => !m.winnerId).length,
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
      wars: mean('wars'),
      peaceTreaties: mean('peaceTreaties'),
      navalBattles: mean('navalBattles'),
      movements: mean('movements'),
      attritionLosses: mean('attritionLosses'),
    },
    matches,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (key: string) =>
      process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3),
    scenario = argument('mode') ?? 'mixed';
  if (!['mixed', 'quick', 'campaign'].includes(scenario))
    throw new Error('--mode deve ser mixed, quick ou campaign.');
  const result = simulateBalance(
    Number(argument('games') ?? 200),
    Number(argument('seed') ?? 20261020),
    scenario as 'mixed' | 'quick' | 'campaign',
  );
  console.log(
    `\nConcórdia v0.3 · ${result.games} partidas reais do motor · 6 bots · cenário ${scenario} · semente ${result.seed}`,
  );
  console.table([
    ...result.conditions.map((c) => ({
      Condição: c.name,
      Vitórias: c.wins,
      'Taxa (%)': c.rate.toFixed(1),
    })),
    {
      Condição: 'Campanhas sem vencedor',
      Vitórias: result.draws,
      'Taxa (%)': ((result.draws / result.games) * 100).toFixed(1),
    },
  ]);
  console.table([result.means]);
  console.table(result.archetypes);
  const output = argument('output');
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(`Resultados completos: ${output}`);
  }
  console.log(
    'Validados: batalhões, cargas navais, guerras formais, duas condições de vitória e histórico exportável. Empates são preservados; não há vitória artificial por pontuação.',
  );
}
