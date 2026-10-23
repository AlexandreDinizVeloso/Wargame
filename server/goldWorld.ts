import { ECONOMY_BALANCE } from '../shared/balance';
import type { GameState, TurnResolutionReport, Player } from '../shared/types';
import { goldRules } from '../shared/factions';
import { ERAS, campaignEra } from '../shared/world';
import { controller, landProvinces } from '../shared/rules';
import { buildingSlots, usedSlots } from '../shared/development';
import { notify } from './notifications';
export function botDispatch(g: GameState, id: string, action: string, targetId: string) {
  if (
    !goldRules(g) ||
    g.botCouncilTurn === g.turn ||
    !['DECLARE_WAR', 'PEACE_OFFER', 'ALLIANCE', 'COALITION'].includes(action)
  )
    return;
  const actor = g.players.find((p) => p.id === id),
    target = g.players.find((p) => p.id === targetId);
  if (!actor?.bot || !target) return;
  const subject =
    action === 'DECLARE_WAR'
      ? 'Preparem suas defesas'
      : action === 'PEACE_OFFER'
        ? 'Propomos um tratado de paz'
        : action === 'ALLIANCE'
          ? 'Nossa aliança está firmada'
          : 'Contenham a expansão: esta coalizão defenderá as fronteiras';
  const intro =
    actor.botArchetype === 'Merchant'
      ? 'Nossas rotas exigem estabilidade'
      : actor.botArchetype === 'Theocrat'
        ? 'Nossa fé guiará as fronteiras'
        : 'A força de nossos estandartes será respeitada';
  g.chat.push({
    id: g.nextId++,
    playerId: id,
    text: `[${actor.botArchetype}] ${intro}. ${subject}, ${target.nation}.`,
    turn: g.turn,
  });
  g.chat = g.chat.slice(-100);
  g.botCouncilTurn = g.turn;
}
export function eraTransition(g: GameState, report?: TurnResolutionReport) {
  if (!goldRules(g)) return;
  if (report && g.pendingEraEvent) {
    report.events.push(g.pendingEraEvent);
    delete g.pendingEraEvent;
  }
  const era = campaignEra(g.turn);
  if (g.lastEra === era) return;
  const previous = g.lastEra;
  g.lastEra = era;
  if (era !== 'ERA_CONSOLIDATION') {
    const text = `${ERAS[era].icon} ${ERAS[era].act} — ${ERAS[era].name}: ${ERAS[era].description}`;
    notify(g, {
      type: 'WORLD',
      text,
      severity: 'INFO',
      involvesPlayerIds: g.players.map((p) => p.id),
    });
    if (report) report.events.push(text);
    else g.pendingEraEvent = text;
  }
  if (era === 'ERA_EMPIRES' || (!previous && g.turn >= 9))
    for (const p of g.provinces)
      if (
        p.kind === 'LAND' &&
        !p.ownerId &&
        !p.siege &&
        p.fortLevel === 0 &&
        usedSlots(p) < buildingSlots(p)
      )
        p.fortLevel = 1;
}
export function hegemonyWarning(g: GameState, report: TurnResolutionReport) {
  if (!goldRules(g)) return;
  const total = landProvinces(g).length;
  for (const p of g.players) {
    const share =
      g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === p.id).length / total;
    if (g.turn >= 21 && share >= 0.75 * 0.55 && !(g.hegemonyWarned ?? []).includes(p.id)) {
      g.hegemonyWarned = [...(g.hegemonyWarned ?? []), p.id];
      const text = `👑 Alerta de Hegemonia: ${p.nation} ultrapassou 55% da meta de dominação.`;
      report.events.push(text);
      notify(g, {
        type: 'VICTORY_WARNING',
        text,
        severity: 'CRITICAL',
        involvesPlayerIds: g.players.map((q) => q.id),
      });
    }
  }
  if (g.matchConfig.scenarioId === 'IRON_CROWN_EUROPE') {
    g.diet.memberRealmIds = g.players
      .filter((p) => g.provinces.some((q) => q.ownerId === p.id))
      .map((p) => p.id);
    const votes = new Map<string, number>();
    for (const id of g.diet.memberRealmIds) {
      const target = g.diet.votes[id] ?? id;
      if (g.diet.memberRealmIds.includes(target)) votes.set(target, (votes.get(target) ?? 0) + 1);
    }
    if (g.turn % 4 === 0)
      g.diet.emperorId =
        [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const emperor = g.players.find((p) => p.id === g.diet.emperorId);
    if (emperor) {
      g.diet.imperialAuthority = Math.max(
        0,
        Math.min(100, g.diet.imperialAuthority + (g.wars.some((w) => w.active) ? -2 : 3)),
      );
      if (g.turn % ECONOMY_BALANCE.imperialAuthorityPeriod === 0)
        emperor.prestige += ECONOMY_BALANCE.imperialAuthorityGain;
      if (g.diet.imperialAuthority >= 75) emperor.gold += ECONOMY_BALANCE.imperialGold;
    }
  }
}
export const botThreat = (g: GameState, p: Player, target: Player) =>
  goldRules(g)
    ? (target.aggressiveExpansion >= 55 ||
        g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === target.id).length /
          Math.max(1, landProvinces(g).length) >=
          0.4) &&
      g.provinces.some(
        (q) =>
          q.ownerId === p.id &&
          q.neighbors.some((n) =>
            g.provinces.some((x) => x.id === n && controller(x) === target.id),
          ),
      ) &&
      ['Militarist', 'Theocrat', 'Diplomat', 'Merchant'].includes(p.botArchetype)
    : target.aggressiveExpansion >= 60;
