import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { GameState } from '../shared/types';
import { parseOrder } from './game';

export interface SavedRoom {
  game: GameState;
  sessions: { playerId: string; tokenHash: string }[];
  touched: number;
  remainingMs: number;
}
interface Snapshot {
  schemaVersion: 2;
  savedAt: number;
  rooms: SavedRoom[];
}
function valid(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Snapshot;
  if (snapshot.schemaVersion !== 2 || !Array.isArray(snapshot.rooms) || snapshot.rooms.length > 200)
    return false;
  try {
    for (const room of snapshot.rooms) {
      const g = room.game;
      if (
        !g ||
        g.version !== 2 ||
        typeof g.code !== 'string' ||
        !Array.isArray(g.players) ||
        g.players.length > 8 ||
        !Array.isArray(g.provinces) ||
        g.provinces.length !== 32 ||
        !Array.isArray(g.relations) ||
        !Array.isArray(g.offers) ||
        !Array.isArray(g.reports) ||
        !Array.isArray(g.stationedArmies) ||
        !Array.isArray(g.displacedArmies) ||
        !g.orders ||
        !g.victoryTargets
      )
        return false;
      if (
        !Number.isFinite(g.seed) ||
        !Number.isFinite(g.nextId) ||
        !Number.isFinite(room.remainingMs) ||
        room.remainingMs < 0
      )
        return false;
      const ids = new Set(g.players.map((p) => p.id));
      if (ids.size !== g.players.length || !ids.has(g.hostId)) return false;
      for (const p of g.players)
        if (![p.gold, p.manpower, p.influence, p.tradeEarned, p.score].every(Number.isFinite))
          return false;
      for (const p of g.provinces)
        if (
          ![
            p.troops,
            p.mercenaries,
            p.training,
            p.morale,
            p.pacification,
            p.unrest,
            p.baseTax,
            p.baseSupplyLimit,
            p.fortLevel,
          ].every(Number.isFinite) ||
          p.training < 1 ||
          p.training > 1.5 ||
          p.troops < 0 ||
          p.mercenaries < 0 ||
          p.mercenaries > p.troops ||
          p.pacification < 0 ||
          p.pacification > 100 ||
          p.unrest < 0 ||
          p.unrest > 100 ||
          (p.ownerId !== null && !ids.has(p.ownerId))
        )
          return false;
      for (const [id, orders] of Object.entries(g.orders)) {
        if (!ids.has(id) || !Array.isArray(orders)) return false;
        for (const order of orders) parseOrder(order);
      }
      if (
        !Array.isArray(room.sessions) ||
        room.sessions.some((s) => !ids.has(s.playerId) || !/^[a-f0-9]{64}$/.test(s.tokenHash))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
export function readSnapshot(filename: string): SavedRoom[] {
  const candidates = [filename, `${filename}.bak`];
  let present = false;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    present = true;
    try {
      const value: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (valid(value)) return value.rooms;
    } catch {
      continue;
    }
  }
  if (present)
    throw new Error(
      'Não foi possível recuperar o arquivo de campanhas nem o backup. Os arquivos foram preservados para diagnóstico.',
    );
  return [];
}
export function writeSnapshot(filename: string, rooms: SavedRoom[], now: number) {
  const snapshot: Snapshot = { schemaVersion: 2, savedAt: now, rooms };
  const directory = path.dirname(filename),
    temporary = `${filename}.tmp`;
  mkdirSync(directory, { recursive: true });
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(snapshot));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (existsSync(filename)) {
    let intact = false;
    try {
      intact = valid(JSON.parse(readFileSync(filename, 'utf8')));
    } catch {
      intact = false;
    }
    copyFileSync(filename, intact ? `${filename}.bak` : `${filename}.corrupt-${now}`);
  }
  renameSync(temporary, filename);
}
