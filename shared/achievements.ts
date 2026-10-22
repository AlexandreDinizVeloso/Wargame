import type { GameView, NationId } from './types';
import { seaTradeNodes } from './maritime';
export interface CareerStats {
  games: number;
  wins: number;
  battles: number;
  landWins: number;
  conquests: number;
  gold: number;
  sieges: number;
  nodes: number;
  income: number;
  peace: number;
  defensive: number;
  secret: number;
  aurelia: number;
  turan: number;
  veridia: number;
  vespera: number;
}
export interface StrategistProfile {
  version: 1;
  name: string;
  title: string;
  color: string;
  favoriteNation: NationId;
  stats: CareerStats;
  unlocked: Record<string, string>;
  matches: Record<string, Partial<CareerStats>>;
}
export const ACHIEVEMENTS: {
  id: string;
  icon: string;
  name: string;
  metric: keyof CareerStats;
  target: number;
  title: string;
  description: string;
}[] = [
  {
    id: 'FIRST_CROWN',
    description: 'Vença sua primeira campanha.',
    icon: '🥇',
    name: 'Primeira Coroa',
    metric: 'wins',
    target: 1,
    title: 'Coroado',
  },
  {
    id: 'IRON_MARSHAL',
    description: 'Vença 25 batalhas terrestres.',
    icon: '⚔️',
    name: 'Marechal de Ferro',
    metric: 'landWins',
    target: 25,
    title: 'Marechal de Ferro',
  },
  {
    id: 'SEVEN_SEAS',
    description: 'Domine três nós comerciais marítimos simultaneamente.',
    icon: '⚓',
    name: 'Almirante dos Sete Mares',
    metric: 'nodes',
    target: 3,
    title: 'Almirante dos Sete Mares',
  },
  {
    id: 'WALL_BREAKER',
    description: 'Conclua 15 cercos vitoriosos.',
    icon: '🏰',
    name: 'Quebrador de Muralhas',
    metric: 'sieges',
    target: 15,
    title: 'Quebrador de Muralhas',
  },
  {
    id: 'PEACE_ARCHITECT',
    description: 'Imponha um tratado de paz com War Score de pelo menos 50.',
    icon: '🕊️',
    name: 'Arquiteto da Paz',
    metric: 'peace',
    target: 1,
    title: 'Arquiteto da Paz',
  },
  {
    id: 'INDIA_COMPANY',
    description: 'Alcance 80 de receita bruta em uma rodada.',
    icon: '🪙',
    name: 'Companhia das Índias',
    metric: 'income',
    target: 80,
    title: 'Senhor das Rotas',
  },
  {
    id: 'HIDDEN_HAND',
    description: 'Vença cumprindo um objetivo secreto.',
    icon: '🎯',
    name: 'Mão Oculta',
    metric: 'secret',
    target: 1,
    title: 'Mão Oculta',
  },
  {
    id: 'HOMELAND',
    description: 'Acione a Defesa da Pátria e vença a mesma guerra defensiva.',
    icon: '🛡️',
    name: 'Bastião da Pátria',
    metric: 'defensive',
    target: 1,
    title: 'Bastião da Pátria',
  },
  {
    id: 'SOLAR_HEGEMONY',
    description: 'Vença com Aurélia ou Sol Invicto.',
    icon: '👑',
    name: 'Hegemonia Solar',
    metric: 'aurelia',
    target: 1,
    title: 'Hegemon Solar',
  },
  {
    id: 'STEPPE_SCOURGE',
    description: 'Vença com Turan ou Ferro-Norte.',
    icon: '🐎',
    name: 'Flagelo das Estepes',
    metric: 'turan',
    target: 1,
    title: 'Flagelo das Estepes',
  },
  {
    id: 'ANCESTRAL_GUARDIAN',
    description: 'Vença com Verídia ou Sapiência.',
    icon: '🌿',
    name: 'Guardião Ancestral',
    metric: 'veridia',
    target: 1,
    title: 'Guardião Ancestral',
  },
  {
    id: 'VESPER_MAGNATE',
    description: 'Vença com Véspera ou Kaldor.',
    icon: '⚖️',
    name: 'Magnata de Véspera',
    metric: 'vespera',
    target: 1,
    title: 'Magnata de Véspera',
  },
];
export function emptyProfile(): StrategistProfile {
  return {
    version: 1,
    name: 'Estrategista',
    title: 'Aprendiz',
    color: '#d5ac68',
    favoriteNation: 'vespera',
    stats: {
      games: 0,
      wins: 0,
      battles: 0,
      landWins: 0,
      conquests: 0,
      gold: 0,
      sieges: 0,
      nodes: 0,
      income: 0,
      peace: 0,
      defensive: 0,
      secret: 0,
      aurelia: 0,
      turan: 0,
      veridia: 0,
      vespera: 0,
    },
    unlocked: {},
    matches: {},
  };
}
export function updateProfile(
  profile: StrategistProfile,
  g: GameView,
  id: string,
  now: string,
): StrategistProfile {
  const me = g.players.find((p) => p.id === id);
  if (!me || g.phase === 'lobby' || g.matchConfig.tutorial) return profile;
  const key = `${g.matchConfig.campaignId ?? g.code}:${id}`,
    last = profile.matches[key] ?? {},
    next = structuredClone(profile);
  const victory =
      g.victoryRecord ??
      (g.phase === 'finished' ? { winnerId: g.winnerId, objective: g.winnerObjective } : null),
    win = victory?.winnerId === id;
  const landWins = g.history.reduce(
      (n, h) => n + h.battles.filter((b) => !b.naval && b.winnerId === id).length,
      0,
    ),
    sieges = g.history.reduce(
      (n, h) => n + h.sieges.filter((s) => s.completed && s.attackerOwnerId === id).length,
      0,
    );
  const peace = g.wars.filter(
    (w) => !w.active && w.treatyWinnerId === id && (w.treatyScore ?? 0) >= 50,
  ).length;
  const levyTurns = [
    ...(me.emergencyLevyTurn === null ? [] : [me.emergencyLevyTurn]),
    ...g.history.flatMap((h) =>
      h.notifications
        .filter((n) => n.type === 'EMERGENCY_LEVY' && n.involvesPlayerIds.includes(id))
        .map((n) => n.turn),
    ),
  ];
  const defensive = g.wars.filter(
    (w) =>
      !w.active &&
      w.defenderIds.includes(id) &&
      w.treatyWinnerId === id &&
      (w.treatyScore ?? 0) > 0 &&
      levyTurns.some((t) => t >= w.startedTurn && t <= (w.endedTurn ?? 0)),
  ).length;
  const counts: CareerStats = {
    games: 1,
    wins: Number(win),
    battles: me.wonBattles,
    landWins,
    conquests: sieges,
    gold: g.history.reduce(
      (n, h) => n + (h.economy.find((e) => e.playerId === id)?.grossIncome ?? 0),
      0,
    ),
    sieges,
    nodes: Math.max(
      seaTradeNodes(g).filter((n) => n.ownerId === id).length,
      ...g.history.map((h) => h.analytics?.find((a) => a.playerId === id)?.tradeNodes ?? 0),
    ),
    income: Math.max(
      0,
      ...g.history.map((h) => h.economy.find((e) => e.playerId === id)?.grossIncome ?? 0),
    ),
    peace,
    defensive,
    secret: Number(win && victory?.objective === 'SECRET_OBJECTIVE'),
    aurelia: Number(win && ['aurelia', 'sol_invicto'].includes(me.nationId)),
    turan: Number(win && ['turan', 'ferro_norte'].includes(me.nationId)),
    veridia: Number(win && ['veridia', 'sapiencia'].includes(me.nationId)),
    vespera: Number(win && ['vespera', 'kaldor'].includes(me.nationId)),
  };
  for (const k of Object.keys(counts) as (keyof CareerStats)[]) {
    if (k === 'nodes' || k === 'income') next.stats[k] = Math.max(next.stats[k], counts[k]);
    else next.stats[k] += Math.max(0, counts[k] - (last[k] ?? 0));
  }
  next.matches[key] = Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.max(v, last[k as keyof CareerStats] ?? 0)]),
  );
  for (const a of ACHIEVEMENTS)
    if (!next.unlocked[a.id] && next.stats[a.metric] >= a.target) next.unlocked[a.id] = now;
  return next;
}
