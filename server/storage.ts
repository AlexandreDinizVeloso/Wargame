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
import { UNIT_KEYS, unitCount } from '../shared/rules';
import { parseOrder } from './commands';
import { migrateV2, migrateV3 } from './migration';
export interface SavedRoom {
  game: GameState;
  sessions: { playerId: string; tokenHash: string }[];
  touched: number;
  remainingMs: number;
}
interface Snapshot {
  schemaVersion: 4;
  savedAt: number;
  rooms: SavedRoom[];
}
export function validGame(g: GameState): boolean {
  try {
    if (
      !g ||
      g.version !== 4 ||
      typeof g.code !== 'string' ||
      !['lobby', 'planning', 'finished'].includes(g.phase) ||
      !Array.isArray(g.players) ||
      g.players.length < 1 ||
      g.players.length > 8 ||
      !Array.isArray(g.provinces) ||
      g.provinces.length < 1 ||
      g.provinces.length > 200 ||
      !Array.isArray(g.battalions) ||
      !Array.isArray(g.wars) ||
      !Array.isArray(g.history) ||
      !Array.isArray(g.relations) ||
      !Array.isArray(g.offers) ||
      !g.diet ||
      !g.orders ||
      !Array.isArray(g.coalitions) ||
      !Array.isArray(g.visionContracts) ||
      typeof g.enableSecretObjectives !== 'boolean' ||
      typeof g.isPublic !== 'boolean' ||
      typeof g.roomName !== 'string' ||
      !['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'].includes(g.season) ||
      !Number.isFinite(g.seed) ||
      !Number.isInteger(g.nextId) ||
      g.nextId < 1
    )
      return false;
    const ids = new Set(g.players.map((p) => p.id)),
      provinceIds = new Set(g.provinces.map((p) => p.id)),
      armyIds = new Set(g.battalions.map((a) => a.id));
    if (
      ids.size !== g.players.length ||
      provinceIds.size !== g.provinces.length ||
      armyIds.size !== g.battalions.length ||
      !ids.has(g.hostId)
    )
      return false;
    for (const p of g.players)
      if (
        ![
          p.gold,
          p.manpower,
          p.influence,
          p.prestige,
          p.warExhaustion,
          p.stability,
          p.aggressiveExpansion,
          p.fervor,
          p.objectiveStreak,
        ].every(Number.isFinite) ||
        p.gold < 0 ||
        p.manpower < 0 ||
        p.influence < 0 ||
        p.warExhaustion < 0 ||
        p.warExhaustion > 100
      )
        return false;
    for (const p of g.provinces)
      if (
        ![
          p.x,
          p.y,
          p.baseTax,
          p.baseSupplyLimit,
          p.pacification,
          p.unrest,
          p.fortLevel,
          p.portLevel,
          p.marketLevel,
        ].every(Number.isFinite) ||
        p.pacification < 0 ||
        p.pacification > 100 ||
        p.unrest < 0 ||
        p.unrest > 100 ||
        !Number.isInteger(p.fortLevel) ||
        p.fortLevel < 0 ||
        p.fortLevel > 4 ||
        [p.portLevel, p.marketLevel].some((v) => !Number.isInteger(v) || v < 0 || v > 3) ||
        (p.ownerId !== null && !ids.has(p.ownerId)) ||
        (p.occupierId !== null && !ids.has(p.occupierId)) ||
        !Array.isArray(p.rings) ||
        !p.neighbors.every((id) => provinceIds.has(id))
      )
        return false;
    for (const a of g.battalions) {
      if (
        (!ids.has(a.ownerId) && a.ownerId !== 'NEUTRAL') ||
        !provinceIds.has(a.provinceId) ||
        UNIT_KEYS.some((k) => !Number.isInteger(a[k]) || a[k] < 0) ||
        unitCount(a) < 1 ||
        !Number.isFinite(a.morale) ||
        a.morale < 0 ||
        a.morale > 100 ||
        !Number.isFinite(a.training) ||
        a.training < 1 - 1e-8 ||
        a.training > 1.5 + 1e-8 ||
        typeof a.isFleet !== 'boolean' ||
        !Array.isArray(a.pathQueue) ||
        !a.pathQueue.every((id) => provinceIds.has(id))
      )
        return false;
      if (
        (a.embarkedOnId && !armyIds.has(a.embarkedOnId)) ||
        (a.embarkedArmyId && !armyIds.has(a.embarkedArmyId))
      )
        return false;
    }
    if (
      !Number.isFinite(g.diet.imperialAuthority) ||
      g.diet.imperialAuthority < 0 ||
      g.diet.imperialAuthority > 100 ||
      g.diet.memberRealmIds.some((id) => !ids.has(id))
    )
      return false;
    for (const w of g.wars)
      if (
        !Number.isFinite(w.warScore) ||
        w.warScore < -100 ||
        w.warScore > 100 ||
        [...w.attackerIds, ...w.defenderIds].some((id) => !ids.has(id)) ||
        w.attackerIds.some((id) => w.defenderIds.includes(id))
      )
        return false;
    for (const [id, orders] of Object.entries(g.orders)) {
      if (!ids.has(id) || !Array.isArray(orders)) return false;
      for (const o of orders) parseOrder(o);
    }
    return true;
  } catch {
    return false;
  }
}
function decode(value: unknown): SavedRoom[] {
  const snapshot = value as { schemaVersion: number; rooms: SavedRoom[] };
  if (
    !snapshot ||
    ![2, 3, 4].includes(snapshot.schemaVersion) ||
    !Array.isArray(snapshot.rooms) ||
    snapshot.rooms.length > 200
  )
    throw new Error('Snapshot inválido.');
  const rooms = snapshot.rooms.map((room) => ({
    ...room,
    game:
      snapshot.schemaVersion === 2
        ? migrateV2(room.game)
        : snapshot.schemaVersion === 3
          ? migrateV3(room.game)
          : room.game,
  }));
  for (const room of rooms) {
    if (
      !validGame(room.game) ||
      !Number.isFinite(room.touched) ||
      !Number.isFinite(room.remainingMs) ||
      room.remainingMs < 0 ||
      !Array.isArray(room.sessions) ||
      room.sessions.some(
        (s) =>
          !room.game.players.some((p) => p.id === s.playerId) ||
          !/^[a-f0-9]{64}$/.test(s.tokenHash),
      )
    )
      throw new Error('Campanha inválida no snapshot.');
  }
  return rooms;
}
export function readSnapshot(filename: string): SavedRoom[] {
  let present = false;
  for (const candidate of [filename, `${filename}.bak`]) {
    if (!existsSync(candidate)) continue;
    present = true;
    try {
      const raw: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      const rooms = decode(raw);
      if (
        (raw as { schemaVersion: number }).schemaVersion === 2 &&
        !existsSync(`${filename}.v2-backup`)
      )
        copyFileSync(candidate, `${filename}.v2-backup`);
      if (
        (raw as { schemaVersion: number }).schemaVersion === 3 &&
        !existsSync(`${filename}.v3-backup`)
      )
        copyFileSync(candidate, `${filename}.v3-backup`);
      return rooms;
    } catch {
      continue;
    }
  }
  if (present)
    throw new Error(
      'Não foi possível recuperar as campanhas nem o backup. Os arquivos foram preservados para diagnóstico.',
    );
  return [];
}
export function writeSnapshot(filename: string, rooms: SavedRoom[], now: number) {
  const snapshot: Snapshot = { schemaVersion: 4, savedAt: now, rooms };
  decode(snapshot);
  const temporary = `${filename}.tmp`;
  mkdirSync(path.dirname(filename), { recursive: true });
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
      decode(JSON.parse(readFileSync(filename, 'utf8')));
      intact = true;
    } catch {
      intact = false;
    }
    copyFileSync(filename, intact ? `${filename}.bak` : `${filename}.corrupt-${now}`);
  }
  renameSync(temporary, filename);
}
