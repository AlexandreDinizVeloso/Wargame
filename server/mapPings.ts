import { randomUUID } from 'node:crypto';
import type { GameState, MapPing } from '../shared/types';
import { getRelation, livingPlayers } from '../shared/rules';
import { assert } from './state';
export function pingRecipients(game: GameState, playerId: string) {
  return livingPlayers(game)
    .filter((p) => p.id === playerId || getRelation(game, playerId, p.id)?.allied)
    .map((p) => p.id);
}
export function createMapPing(
  game: GameState,
  playerId: string,
  provinceId: unknown,
  note: unknown,
  now: number,
): MapPing {
  assert(
    game.phase === 'planning' || game.phase === 'finished',
    'Inicie a campanha antes de sinalizar.',
  );
  assert(
    livingPlayers(game).some((p) => p.id === playerId),
    'Somente nações ativas podem sinalizar.',
  );
  assert(
    typeof provinceId === 'string' && game.provinces.some((p) => p.id === provinceId),
    'Província inválida para sinalização.',
  );
  assert(
    note === undefined || (typeof note === 'string' && note.length <= 80),
    'A nota deve ter até 80 caracteres.',
  );
  const text = typeof note === 'string' ? note.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return {
    id: randomUUID(),
    code: game.code,
    playerId,
    provinceId: provinceId as string,
    note: text || 'Atenção aqui!',
    expiresAt: now + 6000,
  };
}
