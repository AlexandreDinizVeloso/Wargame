import type { BattleReport } from './types';
export const CINEMATIC_DURATION = 6500;
export function resolutionPhase(elapsed: number): 'decrees' | 'march' | 'battle' | 'complete' {
  return elapsed < 1500
    ? 'decrees'
    : elapsed < 3500
      ? 'march'
      : elapsed < CINEMATIC_DURATION
        ? 'battle'
        : 'complete';
}
export function primaryBattle(battles: BattleReport[], viewer: string): BattleReport | undefined {
  const ordered = [...battles].sort(
    (a, b) => b.attackerTroops + b.defenderTroops - (a.attackerTroops + a.defenderTroops),
  );
  return ordered.find((b) => b.attackerId === viewer || b.defenderId === viewer) ?? ordered[0];
}
