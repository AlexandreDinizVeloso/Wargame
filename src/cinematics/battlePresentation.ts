import type { BattleReport, Player, Province, TurnResolutionReport } from '../../shared/types';

export const BATTLE_CINEMATIC_DURATION = 10_800;
export type BattlePhase = 'approach' | 'artillery' | 'volley' | 'charge' | 'clash' | 'result';

export const BATTLE_PHASES: readonly { id: BattlePhase; at: number; label: string }[] = [
  { id: 'approach', at: 0, label: 'As linhas se formam' },
  { id: 'artillery', at: 2_000, label: 'A pólvora desperta' },
  { id: 'volley', at: 3_600, label: 'Salvas cruzam o campo' },
  { id: 'charge', at: 5_000, label: 'O avanço das bandeiras' },
  { id: 'clash', at: 6_900, label: 'O peso do confronto' },
  { id: 'result', at: 8_200, label: 'O campo silencia' },
];

export interface BattleClock {
  elapsedMs: number;
  playing: boolean;
}

export interface BattleSceneContext {
  players: Pick<Player, 'id' | 'name' | 'nation' | 'nationId' | 'color'>[];
  provinces: Pick<Province, 'id' | 'name' | 'terrain'>[];
}

export function battlePhaseAt(elapsedMs: number): BattlePhase {
  return BATTLE_PHASES.findLast((phase) => phase.at <= elapsedMs)?.id ?? 'approach';
}

/** This is presentation timing, never a second simulation of combat. */
export function battleLossProgress(elapsedMs: number): number {
  if (elapsedMs <= 2_600) return 0;
  if (elapsedMs >= 8_200) return 1;
  const t = (elapsedMs - 2_600) / 5_600;
  return t * t * (3 - 2 * t);
}

/** Only the report already filtered for this viewer may enter the cinematic queue. */
export function buildBattlePlaylist(
  report: Pick<TurnResolutionReport, 'battles'>,
  viewerId: string,
  options: { includeOtherVisibleBattles?: boolean } = {},
): BattleReport[] {
  const seen = new Set<string>();
  return report.battles.filter((battle) => {
    if (seen.has(battle.id)) return false;
    seen.add(battle.id);
    return (
      options.includeOtherVisibleBattles === true ||
      battle.attackerId === viewerId ||
      battle.defenderId === viewerId ||
      Object.hasOwn(battle.casualtiesByRealm ?? {}, viewerId)
    );
  });
}

export function battleVerdict(game: BattleSceneContext, battle: BattleReport, viewerId: string) {
  const winner = game.players.find((player) => player.id === battle.winnerId);
  const participant = battle.attackerId === viewerId || battle.defenderId === viewerId;
  const victory = battle.winnerId === viewerId;
  const resultTone = participant ? (victory ? 'victory' : 'defeat') : 'neutral';
  const title =
    battle.outcome === 'siege_blocked'
      ? 'As muralhas resistem'
      : battle.stackwipe
        ? 'Uma formação foi aniquilada'
        : participant
          ? victory
            ? 'A vitória é sua'
            : 'O campo foi perdido'
          : battle.outcome === 'attacker_victory'
            ? 'As linhas foram rompidas'
            : 'A defesa prevalece';
  const retreat = game.provinces.find((province) => province.id === battle.retreatDestinationId);
  const detail = battle.retreatDestinationId
    ? `Recuo registrado para ${retreat?.name ?? battle.retreatDestinationId}.`
    : battle.outcome === 'siege_blocked'
      ? 'O assalto foi contido pelas fortificações.'
      : battle.stackwipe
        ? 'O relatório confirma a destruição completa da formação derrotada.'
        : 'O resultado foi decidido na resolução desta rodada.';
  return {
    title,
    detail,
    tone: resultTone,
    winnerName: winner?.nation ?? 'Guarnição independente',
    musicMood: (resultTone === 'defeat' ? 'defeat' : 'victory') as 'defeat' | 'victory',
  };
}

export function battlePhaseCaption(battle: BattleReport, phase: BattlePhase) {
  const a = battle.attackerCompositionBefore,
    d = battle.defenderCompositionBefore;
  if (phase === 'approach')
    return battle.naval ? 'As velas surgem no horizonte.' : 'Os estandartes tomam posição.';
  if (phase === 'artillery')
    return battle.naval
      ? 'Os navios apresentam suas baterias.'
      : (a?.artillery ?? 0) + (d?.artillery ?? 0) > 0
        ? 'As baterias abrem fogo sob a névoa.'
        : 'As linhas se aproximam sob a fumaça.';
  if (phase === 'volley')
    return battle.naval
      ? 'As bordadas ressoam sobre o mar.'
      : 'O estrondo das salvas cobre o vale.';
  if (phase === 'charge')
    return battle.naval
      ? 'As frotas cruzam suas linhas de fogo.'
      : (a?.cavalry ?? 0) + (d?.cavalry ?? 0) > 0
        ? 'A cavalaria avança entre as linhas.'
        : 'A infantaria avança com suas bandeiras.';
  if (phase === 'clash')
    return battle.naval ? 'Madeira, água e pólvora.' : 'O embate decide a batalha.';
  return 'Os sobreviventes recolhem suas bandeiras.';
}
