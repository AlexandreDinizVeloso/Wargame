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
import { SKILLS, TRAITS } from '../shared/military';
import { buildingSlots, usedSlots } from '../shared/development';
import { parseOrder } from './commands';
import { isLegacySeaShortcut } from '../shared/map';
import { migrateV2, migrateV3, migrateV4, migrateV5, migrateV6 } from './migration';
export interface SavedRoom {
  game: GameState;
  sessions: { playerId: string; tokenHash: string }[];
  touched: number;
  remainingMs: number;
}
interface Snapshot {
  schemaVersion: 7;
  savedAt: number;
  rooms: SavedRoom[];
}
export function validGame(g: GameState): boolean {
  try {
    if (
      !g ||
      g.version !== 7 ||
      typeof g.code !== 'string' ||
      !['lobby', 'planning', 'finished'].includes(g.phase) ||
      !Array.isArray(g.players) ||
      g.players.length < 1 ||
      g.players.length > 8 ||
      !Array.isArray(g.provinces) ||
      g.provinces.length < 1 ||
      g.provinces.length > 200 ||
      !Array.isArray(g.battalions) ||
      !Array.isArray(g.commanders) ||
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
      typeof g.allowBotSecretVictory !== 'boolean' ||
      typeof g.sandboxContinued !== 'boolean' ||
      !Number.isInteger(g.graceUntilTurn) ||
      g.graceUntilTurn < 0 ||
      !Array.isArray(g.notifications) ||
      !g.notificationReads ||
      typeof g.notificationReads !== 'object' ||
      Array.isArray(g.notificationReads) ||
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
          p.paxStreak,
          p.militaryXP,
          p.armyCap,
          p.manpowerCap,
          p.homelandDefenseUntil,
        ].every(Number.isFinite) ||
        p.armyCap < 12 ||
        p.manpowerCap < 18 ||
        p.manpower > p.manpowerCap + 1e-7 ||
        (p.emergencyLevyTurn !== null &&
          (!Number.isInteger(p.emergencyLevyTurn) ||
            p.emergencyLevyTurn < 1 ||
            p.emergencyLevyTurn > g.turn)) ||
        !Array.isArray(p.lostProvinceIds) ||
        p.lostProvinceIds.some((id) => typeof id !== 'string') ||
        p.militaryXP < 0 ||
        !Array.isArray(p.unlockedSkills) ||
        new Set(p.unlockedSkills).size !== p.unlockedSkills.length ||
        p.unlockedSkills.some((id) => {
          const skill = SKILLS.find((s) => s.id === id);
          if (!skill) return true;
          const branch = p.unlockedSkills.filter((s) => s.startsWith(skill.branch));
          return (
            (skill.tier > 1 && !branch.includes(`${skill.branch}_T1`)) ||
            (skill.tier === 3 && !branch.some((s) => s.startsWith(`${skill.branch}_T2`))) ||
            branch.filter((s) => s.startsWith(`${skill.branch}_T2`)).length > 1
          );
        }) ||
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
        !Number.isInteger(p.neutralDevelopmentLevel) ||
        p.neutralDevelopmentLevel < 0 ||
        p.neutralDevelopmentLevel > 5 ||
        !Number.isInteger(p.neutralDevelopmentTurn) ||
        p.neutralDevelopmentTurn < 0 ||
        p.neutralDevelopmentTurn > g.turn ||
        (p.coastalBombardment !== null &&
          (!ids.has(p.coastalBombardment.ownerId) ||
            !Number.isInteger(p.coastalBombardment.startedTurn) ||
            p.coastalBombardment.startedTurn < 1 ||
            p.coastalBombardment.startedTurn > g.turn ||
            p.coastalBombardment.untilTurn !== p.coastalBombardment.startedTurn + 1 ||
            p.kind !== 'LAND' ||
            !p.isCoastal)) ||
        !Array.isArray(p.straitNeighbors) ||
        !p.straitSeaIds ||
        p.straitNeighbors.some(
          (id) =>
            !provinceIds.has(id) ||
            !g.provinces.find((q) => q.id === id)?.straitNeighbors.includes(p.id) ||
            !g.provinces.some((s) => s.id === p.straitSeaIds[id] && s.kind === 'SEA_ZONE'),
        ) ||
        !Number.isInteger(p.recruitedThisTurn) ||
        p.recruitedThisTurn < 0 ||
        p.recruitedThisTurn > 7 ||
        !Number.isInteger(p.recruitmentTurn) ||
        p.recruitmentTurn < 0 ||
        p.recruitmentTurn > g.turn ||
        usedSlots(p) > buildingSlots(p) ||
        (p.siege !== null &&
          (!p.siege ||
            p.kind !== 'LAND' ||
            !ids.has(p.siege.attackerOwnerId) ||
            ![
              p.siege.progress,
              p.siege.required,
              p.siege.turnsUnderSiege,
              p.siege.startedTurn,
              p.siege.lastProgressTurn,
            ].every(Number.isInteger) ||
            p.siege.progress < 1 ||
            p.siege.required !== 2 + p.fortLevel * 2 ||
            p.siege.turnsUnderSiege < 1)) ||
        p.pacification < 0 ||
        p.pacification > 100 ||
        p.unrest < 0 ||
        p.unrest > 100 ||
        !Number.isInteger(p.fortLevel) ||
        p.fortLevel < 0 ||
        p.fortLevel > 3 ||
        [p.portLevel, p.marketLevel, p.barracksLevel, p.foundryLevel, p.templeLevel].some(
          (v) => !Number.isInteger(v) || v < 0 || v > 2,
        ) ||
        (p.ownerId !== null && !ids.has(p.ownerId)) ||
        (p.occupierId !== null && !ids.has(p.occupierId)) ||
        !Array.isArray(p.rings) ||
        !p.neighbors.every((id) => provinceIds.has(id))
      )
        return false;
    for (const a of g.battalions) {
      const location = g.provinces.find((p) => p.id === a.provinceId);
      if (a.embarkedOnId) {
        const f = g.battalions.find((f) => f.id === a.embarkedOnId);
        if (
          !f ||
          a.isFleet ||
          !f.isFleet ||
          f.embarkedArmyId !== a.id ||
          f.ownerId !== a.ownerId ||
          f.provinceId !== a.provinceId ||
          unitCount(a) > f.transports * 4
        )
          return false;
      }
      if (
        a.embarkedArmyId &&
        (!a.isFleet ||
          !g.battalions.some((c) => c.id === a.embarkedArmyId && c.embarkedOnId === a.id))
      )
        return false;
      if (
        !a.isFleet &&
        location?.kind === 'SEA_ZONE' &&
        (!a.embarkedOnId ||
          !g.battalions.some(
            (f) =>
              f.id === a.embarkedOnId &&
              f.isFleet &&
              f.embarkedArmyId === a.id &&
              f.provinceId === a.provinceId &&
              f.ownerId === a.ownerId,
          ))
      )
        return false;
      if (
        (a.isFleet && (a.infantry || a.cavalry || a.artillery)) ||
        (!a.isFleet && (a.warships || a.transports))
      )
        return false;
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
        typeof a.autoMerge !== 'boolean' ||
        typeof a.encircled !== 'boolean' ||
        typeof a.disorganized !== 'boolean' ||
        ![a.infantryPower, a.artilleryPower].every(
          (n) => Number.isFinite(n) && n >= 1 && n <= 1.2 + 1e-8,
        ) ||
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
    if (
      new Set(g.commanders.map((c) => c.id)).size !== g.commanders.length ||
      new Set(g.commanders.map((c) => c.assignedBattalionId).filter(Boolean)).size !==
        g.commanders.filter((c) => c.assignedBattalionId).length ||
      g.players.some((p) => g.commanders.filter((c) => c.ownerId === p.id).length > 3)
    )
      return false;
    for (const c of g.commanders)
      if (
        !ids.has(c.ownerId) ||
        !(c.trait in TRAITS) ||
        typeof c.isAdmiral !== 'boolean' ||
        ![1, 2, 3].includes(c.stars) ||
        !Number.isFinite(c.xp) ||
        c.xp < 0 ||
        (c.assignedBattalionId &&
          !g.battalions.some(
            (a) =>
              a.id === c.assignedBattalionId &&
              a.ownerId === c.ownerId &&
              a.isFleet === c.isAdmiral,
          ))
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
    const noticeIds = new Set<string>();
    for (const n of g.notifications) {
      if (
        typeof n.id !== 'string' ||
        noticeIds.has(n.id) ||
        typeof n.text !== 'string' ||
        !Number.isInteger(n.turn) ||
        n.turn < 1 ||
        !['CRITICAL', 'WARNING', 'INFO'].includes(n.severity) ||
        ![
          'DECLARE_WAR',
          'CALL_TO_ARMS',
          'SIEGE_STARTED',
          'PEACE_OFFER',
          'BATTALION_WIPED',
          'VICTORY_WARNING',
          'BOMBARDMENT',
          'BATTLE',
          'ENCIRCLEMENT',
          'EMERGENCY_LEVY',
          'ECONOMY',
          'DIPLOMACY',
          'WORLD',
        ].includes(n.type) ||
        !Array.isArray(n.involvesPlayerIds) ||
        n.involvesPlayerIds.some((id) => !ids.has(id)) ||
        (n.focusProvinceId && !provinceIds.has(n.focusProvinceId))
      )
        return false;
      noticeIds.add(n.id);
    }
    for (const [id, read] of Object.entries(g.notificationReads))
      if (
        !ids.has(id) ||
        !Array.isArray(read) ||
        read.length > 500 ||
        read.some((n) => typeof n !== 'string')
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
    ![2, 3, 4, 5, 6, 7].includes(snapshot.schemaVersion) ||
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
          : snapshot.schemaVersion === 4
            ? migrateV4(room.game)
            : snapshot.schemaVersion === 5
              ? migrateV5(room.game)
              : snapshot.schemaVersion === 6
                ? migrateV6(room.game)
                : room.game,
  }));
  for (const room of rooms)
    for (const p of room.game.provinces)
      p.neighbors = p.neighbors.filter((id) => !isLegacySeaShortcut(p.id, id));
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
      if (
        (raw as { schemaVersion: number }).schemaVersion === 4 &&
        !existsSync(`${filename}.v4-backup`)
      )
        copyFileSync(candidate, `${filename}.v4-backup`);
      if (
        (raw as { schemaVersion: number }).schemaVersion === 5 &&
        !existsSync(`${filename}.v5-backup`)
      )
        copyFileSync(candidate, `${filename}.v5-backup`);
      if (
        (raw as { schemaVersion: number }).schemaVersion === 6 &&
        !existsSync(`${filename}.v6-backup`)
      )
        copyFileSync(candidate, `${filename}.v6-backup`);
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
  const snapshot: Snapshot = { schemaVersion: 7, savedAt: now, rooms };
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
