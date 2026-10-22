import type { GameView, RealmTurnAnalytics } from './types';
import { controller, realmEconomy, unitCount } from './rules';
import { seaTradeNodes } from './maritime';
export type CampaignMetric = 'territory' | 'grossIncome' | 'gold' | 'landTroops' | 'ships' | 'wins';
export interface CampaignPoint {
  turn: number;
  territory: number;
  grossIncome: number | null;
  gold: number;
  landTroops: number | null;
  ships: number | null;
  wins: number;
}
export interface NationSeries {
  id: string;
  name: string;
  color: string;
  points: CampaignPoint[];
}
export interface CampaignMedal {
  id: string;
  title: string;
  icon: string;
  winners: string[];
  value: number;
  description: string;
}
export function buildCampaignSeries(game: GameView, viewerId: string): NationSeries[] {
  return game.players.map((player) => {
    const points: CampaignPoint[] = game.history.map((h) => {
      const economy = h.economy.find((e) => e.playerId === player.id),
        nation = h.nations.find((n) => n.id === player.id),
        metric = h.analytics?.find((e) => e.playerId === player.id);
      return {
        turn: h.turn,
        territory: h.control.filter((p) => (p.occupierId ?? p.ownerId) === player.id).length,
        grossIncome: economy?.grossIncome ?? null,
        gold: economy?.gold ?? nation?.gold ?? 0,
        landTroops: metric?.landTroops ?? null,
        ships: metric?.ships ?? null,
        wins: nation?.wonBattles ?? 0,
      };
    });
    if (!points.length || points.at(-1)!.turn < game.turn) {
      const visible = game.phase === 'finished' || player.id === viewerId;
      points.push({
        turn: game.turn,
        territory: game.provinces.filter((p) => p.kind === 'LAND' && controller(p) === player.id)
          .length,
        grossIncome: realmEconomy(game, player.id).grossIncome,
        gold: player.gold,
        landTroops: visible
          ? game.battalions
              .filter((a) => a.ownerId === player.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0)
          : null,
        ships: visible
          ? game.battalions
              .filter((a) => a.ownerId === player.id && a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0)
          : null,
        wins: player.wonBattles,
      });
    }
    return { id: player.id, name: player.nation, color: player.color, points };
  });
}
export function campaignMedals(game: GameView): CampaignMedal[] {
  const rank = (score: (id: string) => number) => {
    const values = game.players.map((p) => ({ id: p.id, value: score(p.id) })),
      best = Math.max(0, ...values.map((v) => v.value));
    return {
      value: Math.round(best * 100) / 100,
      winners:
        best > 0 ? values.filter((v) => Math.abs(v.value - best) < 0.005).map((v) => v.id) : [],
    };
  };
  return [
    {
      id: 'marshal',
      title: 'Marechal Supremo',
      icon: '⚔️',
      description: 'Batalhas vencidas, conforme o placar da campanha.',
      ...rank((id) => game.players.find((p) => p.id === id)?.wonBattles ?? 0),
    },
    {
      id: 'magnate',
      title: 'Magnata Imperial',
      icon: '🪙',
      description: 'Impostos e comércio recebidos nas rodadas resolvidas.',
      ...rank((id) =>
        game.history.reduce((n, h) => {
          const e = h.economy.find((e) => e.playerId === id);
          return n + (e?.taxes ?? 0) + (e?.trade ?? 0);
        }, 0),
      ),
    },
    {
      id: 'bastion',
      title: 'Bastião Inquebrável',
      icon: '🏰',
      description: 'Cercos concluídos ×10 + níveis de fortificação atuais.',
      ...rank(
        (id) =>
          10 *
            game.history.reduce(
              (n, h) => n + h.sieges.filter((s) => s.completed && s.attackerOwnerId === id).length,
              0,
            ) +
          game.provinces.filter((p) => controller(p) === id).reduce((n, p) => n + p.fortLevel, 0),
      ),
    },
    {
      id: 'oceans',
      title: 'Senhor dos Oceanos',
      icon: '⚓',
      description: 'Soma de nós controlados por rodada, desde o início dos registros detalhados.',
      ...rank((id) =>
        game.history.reduce(
          (n, h) => n + (h.analytics?.find((a) => a.playerId === id)?.tradeNodes ?? 0),
          0,
        ),
      ),
    },
  ];
}
export function realmTurnAnalytics(
  game: Pick<GameView, 'players' | 'battalions' | 'provinces' | 'wars'>,
): RealmTurnAnalytics[] {
  const nodes = seaTradeNodes(game);
  return game.players.map((p) => ({
    playerId: p.id,
    landTroops: game.battalions
      .filter((a) => a.ownerId === p.id && !a.isFleet)
      .reduce((n, a) => n + unitCount(a), 0),
    ships: game.battalions
      .filter((a) => a.ownerId === p.id && a.isFleet)
      .reduce((n, a) => n + unitCount(a), 0),
    fortLevels: game.provinces
      .filter((q) => controller(q) === p.id)
      .reduce((n, q) => n + q.fortLevel, 0),
    tradeNodes: nodes.filter((n) => n.ownerId === p.id).length,
  }));
}
