import { randomBytes } from 'node:crypto';
import { seasonAt } from '../shared/world';
import type { CampaignSave, GameState } from '../shared/types';
import { validGame } from './storage';
import { assert } from './state';
export function exportCampaign(game: GameState, exporterId: string): CampaignSave {
  assert(game.hostId === exporterId, 'Somente o anfitrião exporta o save completo.');
  const copy = structuredClone(game);
  copy.matchConfig.campaignId ??= game.code;
  return { format: 'CONCORDIA_SAVE_098', game: copy, exporterId };
}
export function importCampaign(value: unknown, code: string) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Save JSON inválido.');
  const raw = value as Partial<CampaignSave> & {
    schemaVersion?: number;
    finalState?: unknown;
    turnByTurnHistory?: unknown;
  };
  const report = raw.schemaVersion === 7 && raw.finalState;
  const game = structuredClone(
    raw.format === 'CONCORDIA_SAVE_098' ? raw.game : report ? raw.finalState : value,
  ) as GameState;
  if (report || (game && typeof game === 'object' && 'plannedOrders' in game)) {
    assert(
      Array.isArray(game.players) && game.matchConfig && Array.isArray(game.provinces),
      'Relatório inválido.',
    );
    const originalCode = game.code,
      originalTurn = game.turn;
    if (report)
      game.history = Array.isArray(raw.turnByTurnHistory)
        ? (raw.turnByTurnHistory as GameState['history'])
        : [];
    game.seed = randomBytes(4).readUInt32LE();
    game.nextId =
      1 +
      Math.max(
        0,
        ...[
          ...game.players,
          ...game.battalions,
          ...game.commanders,
          ...game.wars,
          ...game.offers,
          ...game.log,
          ...game.chat,
        ].map((item) =>
          typeof item.id === 'number' ? item.id : Number(String(item.id).match(/(\d+)$/)?.[1] ?? 0),
        ),
      );
    game.orders = Object.fromEntries(game.players.map((p) => [p.id, []]));
    game.notificationReads = Object.fromEntries(game.players.map((p) => [p.id, []]));
    game.pendingDiplomacy = [];
    game.offers = [];
    game.matchConfig.sourceReport = { code: originalCode, turn: originalTurn };
    game.matchConfig.campaignId = `report-${code}`;
    game.matchConfig.enableSecretObjectives = false;
    game.enableSecretObjectives = false;
    for (const p of game.players) {
      p.secretObjectives = [];
      p.selectedObjectiveId = null;
      p.objectiveStreak = 0;
    }
    game.winnerId = null;
    game.winnerObjective = null;
    game.victoryRecord = null;
    game.finishReason = null;
    game.sandboxContinued = false;
    game.phase = game.phase === 'lobby' ? 'lobby' : 'planning';
    const publicGame = game as GameState & {
      plannedOrders?: unknown;
      readNotificationIds?: unknown;
    };
    delete publicGame.plannedOrders;
    delete publicGame.readNotificationIds;
  }
  assert(
    validGame(game),
    'Estado inválido ou relatório com informações omitidas. Use Exportar Save JSON para obter uma campanha completa.',
  );
  game.season = seasonAt(game.turn);
  assert(
    game.matchConfig && ['quick', 'campaign'].includes(game.mode),
    'Configuração de campanha inválida.',
  );
  if (game.matchConfig.ruleset !== undefined)
    assert(game.matchConfig.ruleset === 'GOLD_098', 'Conjunto de regras desconhecido.');
  game.matchConfig.campaignId ??= game.code;
  const host =
    game.players.find((p) => p.id === raw.exporterId && !p.bot) ??
    game.players.find((p) => !p.bot) ??
    game.players[0];
  host.bot = false;
  host.online = false;
  game.hostId = host.id;
  game.code = code;
  game.roomName = `${game.roomName.slice(0, 45)} · retomada`;
  game.isPublic = false;
  game.paused = game.phase === 'planning';
  game.deadline = null;
  game.turnDeadlineAt = null;
  game.firstReadyPlayerName = null;
  for (const p of game.players) {
    p.online = p.bot;
    p.ready = p.bot;
  }
  return { game, hostId: host.id };
}
