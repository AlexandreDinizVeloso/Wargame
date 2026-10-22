import type { GameState, Player } from '../shared/types';
export function restoreRegency(player: Player) {
  if (player.afkRegent) {
    player.bot = false;
    player.afkRegent = false;
    player.ready = false;
  }
  player.afkStreak = 0;
}
export function applyAfkRegency(g: GameState) {
  for (const player of g.players) {
    if (player.bot && !player.afkRegent) continue;
    if (!g.provinces.some((p) => p.ownerId === player.id)) continue;
    if (!player.ready || !player.online) player.afkStreak = (player.afkStreak ?? 0) + 1;
    else player.afkStreak = 0;
    if ((player.afkStreak ?? 0) >= 2 || !player.online) {
      player.bot = true;
      player.afkRegent = true;
      player.ready = false;
    }
  }
}
export const replaceableBot = (player: Player) => player.bot && !player.afkRegent;
