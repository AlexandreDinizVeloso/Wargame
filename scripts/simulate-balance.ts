import { realmLimits } from '../shared/economy';
import { buildingSlots, usedSlots } from '../shared/development';
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
  siegesCompleted: number;
  skillsUnlocked: number;
  leaderXP: number;
  peakTroopsByTurn15: number;
  peakLandTroops: number;
  peakGoldWithoutEconomicBuildings: number;
  peakOverArmyCap: number;
  desertions: number;
  seaCrossings: number;
  encirclements: number;
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
  coalitions: number;
  globalCrises: number;
  winnerNation: string | null;
  telemetryTurns: number;
}
export function simulateBalance(
  games = 200,
  seed = 20261020,
  scenario: 'mixed' | 'quick' | 'campaign' = 'mixed',
  maxTurns = 40,
  allowBotSecretVictory = false,
) {
  if (!Number.isInteger(games) || games < 1 || games > 10000 || !Number.isSafeInteger(seed))
    throw new Error('Use 1–10000 partidas e uma semente inteira.');
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 1000)
    throw new Error('Limite interno deve ser 1–1000.');
  const matches: MatchResult[] = [];
  for (let i = 0; i < games; i++) {
    const gameSeed = (seed + Math.imul(i + 1, 2654435761)) >>> 0,
      mode = scenario === 'mixed' ? (i % 2 ? 'campaign' : 'quick') : scenario,
      theater = (['EUROPE', 'AMERICAS', 'ASIA'] as const)[Math.floor(i / 2) % 3];
    const g = createGame(`SIM${i.toString().padStart(4, '0')}`, mode, true, gameSeed, theater);
    for (let seat = 0; seat < 6; seat++) {
      const archetype = ARCHETYPES[(seat + Math.floor(i / 8)) % 4];
      addPlayer(g, `${archetype} ${seat + 1}`, true, NATIONS[(seat + i) % 8].id, archetype);
    }
    g.allowBotSecretVictory = allowBotSecretVictory;
    g.matchConfig.allowBotSecretVictory = allowBotSecretVictory;
    startGame(g, 0);
    const result: MatchResult = {
      seed: gameSeed,
      siegesCompleted: 0,
      skillsUnlocked: 0,
      leaderXP: 0,
      peakTroopsByTurn15: 0,
      peakLandTroops: 0,
      peakGoldWithoutEconomicBuildings: 0,
      peakOverArmyCap: 0,
      desertions: 0,
      seaCrossings: 0,
      encirclements: 0,
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
      coalitions: 0,
      globalCrises: 0,
      winnerNation: null,
      telemetryTurns: 0,
    };
    while (g.phase === 'planning' && g.history.length < maxTurns) {
      const r = resolveTurn(g, g.turn * g.turnSeconds * 1000);
      if (!validGame(g)) throw new Error(`Estado inválido: semente ${gameSeed}, rodada ${r.turn}.`);
      if (g.winnerObjective === 'SECRET_OBJECTIVE' && !allowBotSecretVictory)
        throw new Error('Bot venceu por carta sem autorização do host.');
      for (const a of g.players) {
        const troops = g.battalions
          .filter((u) => u.ownerId === a.id && !u.isFleet)
          .reduce((n, u) => n + unitCount(u), 0);
        result.peakLandTroops = Math.max(result.peakLandTroops, troops);
        result.peakOverArmyCap = Math.max(
          result.peakOverArmyCap,
          troops - realmLimits(g, a.id).armyCap,
        );
        if (
          !g.provinces.some(
            (q) =>
              (q.occupierId ?? q.ownerId) === a.id &&
              (q.marketLevel > 0 || q.foundryLevel > 0 || q.portLevel > 1),
          )
        ) {
          result.peakGoldWithoutEconomicBuildings = Math.max(
            result.peakGoldWithoutEconomicBuildings,
            a.gold,
          );
          if (a.gold >= 1000)
            throw new Error(
              `Tesouro sem infraestrutura atingiu 1000: ${gameSeed}/${r.turn}/${a.nationId}`,
            );
        }
        if (troops >= 200)
          throw new Error(`Exército atingiu 200: ${gameSeed}/${r.turn}/${a.nationId}`);
      }
      result.desertions += r.desertions.reduce((n, d) => n + d.losses, 0);
      result.seaCrossings += r.movements.filter((m) => m.viaSeaId).length;
      result.encirclements += r.encirclements.length;
      for (const p of g.provinces) {
        if (usedSlots(p) > buildingSlots(p))
          throw new Error(`Slots excedidos: ${gameSeed}, ${p.id}`);
      }
      for (const b of r.battles.filter((b) => b.naval))
        if (
          b.infantryModifier !== 1 ||
          b.cavalryModifier !== 1 ||
          b.artilleryModifier !== 1 ||
          b.terrainDefenseBonus !== 1 ||
          b.fortLevel !== 0
        )
          throw new Error(`Modificador terrestre em batalha naval: ${b.id}`);
      result.siegesCompleted += r.sieges.filter((s) => s.completed).length;
      if (r.turn <= 15)
        result.peakTroopsByTurn15 = Math.max(
          result.peakTroopsByTurn15,
          ...g.players.map((p) =>
            g.battalions
              .filter((a) => a.ownerId === p.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0),
          ),
        );
      for (const a of g.battalions) {
        if (
          !a.isFleet &&
          !a.embarkedOnId &&
          g.provinces.find((p) => p.id === a.provinceId)?.kind === 'SEA_ZONE'
        )
          throw new Error('Terrestre no mar sem transporte.');
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
    result.skillsUnlocked = g.players.reduce((n, p) => n + p.unlockedSkills.length, 0);
    result.leaderXP = g.commanders.reduce((n, c) => n + c.xp, 0);
    result.winnerId = g.winnerId;
    result.winnerArchetype = winner?.botArchetype ?? null;
    result.condition = g.winnerObjective;
    result.finishReason = g.finishReason ?? (g.history.length >= maxTurns ? 'turn_limit' : null);
    result.turns = g.history.length;
    result.wars = g.wars.length;
    result.peaceTreaties = g.history
      .flatMap((h) => h.diplomaticChanges)
      .filter((c) => c.action === 'PEACE').length;
    result.coalitions = g.coalitions.length;
    result.globalCrises = g.history.filter((h) => h.world.event?.startedTurn === h.turn).length;
    result.winnerNation = winner?.nationId ?? null;
    result.telemetryTurns = g.history.length;
    matches.push(result);
  }
  const conditions = (['DOMINATION', 'SECRET_OBJECTIVE'] as Objective[]).map((id) => ({
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
    schemaVersion: 6,
    allowBotSecretVictory,
    games,
    maxTurns,
    seed,
    scenario,
    balance: structuredClone(BALANCE),
    conditions,
    draws: matches.filter((m) => !m.winnerId).length,
    archetypes: ARCHETYPES.map((archetype) => ({
      archetype,
      wins: matches.filter((m) => m.winnerArchetype === archetype).length,
    })),
    nations: NATIONS.map((n) => ({
      nation: n.id,
      appearances: matches.filter((_, i) =>
        Array.from({ length: 6 }, (_, seat) => NATIONS[(seat + i) % 8].id).includes(n.id),
      ).length,
      wins: matches.filter((m) => m.winnerNation === n.id).length,
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
    Number(argument('max-turns') ?? 40),
    process.argv.includes('--allow-bot-secrets'),
  );
  console.log(
    `\nConcórdia v0.6 · ${result.games} partidas reais do motor · 6 bots · cenário ${scenario} · semente ${result.seed}`,
  );
  console.table([
    ...result.conditions.map((c) => ({
      Condição: c.name,
      Vitórias: c.wins,
      'Taxa (%)': c.rate.toFixed(1),
    })),
    {
      Condição: 'Sem vencedor no corte interno',
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
    'Validados: batalhões, cargas navais, guerras formais, duas condições de vitória e histórico exportável. O corte interno não encerra partidas humanas; não há vitória artificial por pontuação.',
  );
}
