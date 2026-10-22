import type { GameState } from '../shared/types';
import { goldRules } from '../shared/factions';
import { controller, compositionOf } from '../shared/rules';
import { realmLimits } from '../shared/economy';
import { seasonAt } from '../shared/strategy';
import { createBattalion } from './state';
export function applyScenario(g: GameState) {
  if (!goldRules(g)) return;
  const id = g.matchConfig.scenarioId;
  const land = g.provinces.filter((p) => p.kind === 'LAND');
  for (const p of g.players) {
    const owned = () => land.filter((q) => controller(q) === p.id);
    if (id === 'SHATTERED_EMPIRES') {
      while (owned().length < 4) {
        const sources = owned();
        const next = land
          .filter((q) => !q.ownerId)
          .sort(
            (a, b) =>
              Math.min(...sources.map((s) => Math.hypot(s.x - a.x, s.y - a.y))) -
                Math.min(...sources.map((s) => Math.hypot(s.x - b.x, s.y - b.y))) ||
              a.id.localeCompare(b.id),
          )[0];
        if (!next) break;
        next.ownerId = p.id;
        next.pacification = 100;
        next.unrest = 5;
        next.religion = p.faith;
        g.battalions = g.battalions.filter(
          (a) => a.ownerId !== 'NEUTRAL' || a.provinceId !== next.id,
        );
      }
      p.gold = 150;
      for (const q of owned()) {
        q.barracksLevel = 1;
        if (q.isCoastal) q.portLevel = 1;
      }
      const army = g.battalions.find((a) => a.ownerId === p.id && !a.isFleet);
      if (army) {
        army.infantry += 4;
        army.cavalry += 2;
        army.artillery += 1;
      }
      for (const fleet of g.battalions.filter((a) => a.ownerId === p.id && a.isFleet)) {
        const q = g.provinces.find((q) => q.id === fleet.provinceId)!;
        const sea = g.provinces.find((s) => s.kind === 'SEA_ZONE' && q.neighbors.includes(s.id));
        if (sea) fleet.provinceId = sea.id;
      }
    }
    if (id === 'AGE_OF_SAIL') {
      p.unlockedSkills = [...new Set([...p.unlockedSkills, 'NAV_T1' as const])];
      const port = owned().find((q) => q.isCoastal);
      if (port) {
        port.portLevel = Math.max(1, port.portLevel);
        while (g.battalions.filter((a) => a.ownerId === p.id && a.isFleet).length < 2)
          createBattalion(g, p.id, port.id, compositionOf({ warships: 2, transports: 2 }), {
            isFleet: true,
            morale: 80,
            training: 1.2,
            name: `Esquadra de ${p.nation}`,
          });
      }
    }
    if (id === 'IRON_CROWN_EUROPE') for (const q of owned()) q.fortLevel = Math.max(1, q.fortLevel);
    const limits = realmLimits(g, p.id);
    p.armyCap = limits.armyCap;
    p.manpowerCap = limits.manpowerCap;
    p.manpower = Math.min(p.manpower, limits.manpowerCap);
  }
  if (id === 'SHATTERED_EMPIRES') {
    g.turn = 9;
    g.graceUntilTurn = 0;
    g.season = seasonAt(9);
  }
  if (id === 'IRON_CROWN_EUROPE') {
    const members = g.players.map((p) => p.id);
    g.diet.memberRealmIds = members;
    g.diet.emperorId = g.players.find((p) => p.nationId === 'aurelia')?.id ?? g.players[0].id;
    g.diet.votes = Object.fromEntries(members.map((p) => [p, p]));
    g.diet.imperialAuthority = 40;
  }
  // Two extra resources per nation make the maritime materials visible without altering old maps.
  for (const p of g.players) {
    const own = land.filter((q) => q.ownerId === p.id && !q.strategicResource);
    if (own[0]) own[0].strategicResource = 'TIMBER';
    if (own[1]) own[1].strategicResource = 'SPICES';
  }
}
