import { notify } from './notifications';
import type { GameState, TurnResolutionReport } from '../shared/types';
import { atWar, clamp, getRelation, livingPlayers, roundMoney, unitCount } from '../shared/rules';
import {
  EVENTS,
  hegemonicThreat,
  objectiveCards,
  objectiveProgress,
  seasonAt,
} from '../shared/strategy';
import { assert, log, playerOf, roll } from './state';
import { declareWar, syncWars } from './diplomacy';
export function joinCoalition(g: GameState, id: string, targetId: string) {
  playerOf(g, targetId);
  const p = playerOf(g, id);
  assert(
    id !== targetId && !p.subjectOfId && hegemonicThreat(g, targetId),
    'Alvo sem ameaça suficiente ou membro inválido.',
  );
  assert(
    !getRelation(g, id, targetId)?.allied,
    'Rompa a aliança com o alvo antes de entrar na coalizão.',
  );
  let coalition = g.coalitions.find((c) => c.targetId === targetId);
  if (!coalition) {
    coalition = { targetId, memberIds: [], warId: null };
    g.coalitions.push(coalition);
  }
  assert(!coalition.warId, 'Essa coalizão já está em guerra.');
  assert(!coalition.memberIds.includes(id), 'Você já participa dessa coalizão.');
  coalition.memberIds.push(id);
  log(g, `${p.nation} ingressou na coalizão contra ${playerOf(g, targetId).nation}.`, 'diplomacy');
}
export function coalitionWar(g: GameState, id: string, targetId: string) {
  const coalition = g.coalitions.find((c) => c.targetId === targetId);
  assert(
    coalition &&
      coalition.memberIds.includes(id) &&
      !coalition.warId &&
      hegemonicThreat(g, targetId),
    'Coalizão indisponível.',
  );
  const members = coalition.memberIds.filter((m) => livingPlayers(g).some((p) => p.id === m));
  for (const m of members)
    assert(
      !atWar(g, m, targetId) &&
        !getRelation(g, m, targetId)?.allied &&
        (getRelation(g, m, targetId)?.truceUntil ?? 0) < g.turn &&
        !playerOf(g, m).subjectOfId,
      'Um membro tem guerra, aliança, trégua ou vassalagem incompatível.',
    );
  const war = declareWar(g, id, targetId, 'COALITION');
  war.attackerIds = [...members];
  war.defenderIds = war.defenderIds.filter((m) => !members.includes(m));
  coalition.warId = war.id;
  g.offers = g.offers.filter((o) => o.warId !== war.id || !members.includes(o.to));
  syncWars(g);
  log(g, 'A coalizão declarou Guerra de Contenção: +20% moral e −25% manutenção.', 'diplomacy');
}
export function dealObjectives(g: GameState) {
  for (const p of g.players) {
    p.originalCapitalId = g.provinces.find((q) => q.capitalOf === p.id)?.id ?? null;
  }
  for (const p of g.players) {
    p.secretObjectives = g.enableSecretObjectives ? objectiveCards(g, p) : [];
    p.selectedObjectiveId = p.bot ? (p.secretObjectives[0]?.id ?? null) : null;
  }
}
export function advanceWorld(g: GameState, report: TurnResolutionReport) {
  g.season = seasonAt(g.turn);
  if (g.globalEvent && g.globalEvent.endsTurn < g.turn) g.globalEvent = null;
  if (g.turn % 4 === 0 && g.globalEvent?.startedTurn !== g.turn) {
    const ids = Object.keys(EVENTS) as (keyof typeof EVENTS)[];
    const id = ids[Math.floor(roll(g, 'world-crisis') * ids.length)];
    g.globalEvent = { id, startedTurn: g.turn, endsTurn: g.turn + 1 };
    const text = `Crise global: ${EVENTS[id].name} — ${EVENTS[id].effect} (2 rodadas).`;
    report.events.push(text);
    log(g, text);
  }
  g.visionContracts = g.visionContracts.filter((v) => v.untilTurn >= g.turn);
  for (const c of g.coalitions)
    if (c.warId && !g.wars.some((w) => w.id === c.warId && w.active)) c.warId = null;
}
export function endWorld(g: GameState, report: TurnResolutionReport) {
  for (const p of g.players) {
    if (p.subjectOfId) {
      const lord = g.players.find((q) => q.id === p.subjectOfId);
      if (lord?.nationId === 'aurelia') {
        const gross = report.economy.find((m) => m.playerId === p.id)?.grossIncome ?? 0;
        const amount = Math.min(p.gold, roundMoney(gross * 0.25));
        p.gold = roundMoney(p.gold - amount);
        lord.gold = roundMoney(lord.gold + amount);
        report.events.push(`${p.nation} pagou ${amount} ouro de vassalagem a ${lord.nation}.`);
      }
    }
  }
  for (const p of g.players) {
    const active = g.wars.some(
      (w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(p.id),
    );
    if (!active) p.aggressiveExpansion = clamp(p.aggressiveExpansion - 8);
    const size = (id: string) =>
      g.battalions
        .filter((a) => a.ownerId === id && !a.isFleet)
        .reduce((n, a) => n + unitCount(a), 0);
    const ownSize = size(p.id);
    p.paxStreak =
      ownSize > 0 &&
      p.stability >= 85 &&
      g.players.filter((q) => q.id !== p.id).every((q) => ownSize > size(q.id)) &&
      !report.rebellions.some((r) => r.previousOwnerId === p.id)
        ? p.paxStreak + 1
        : 0;
    if (g.enableSecretObjectives && !p.selectedObjectiveId && p.secretObjectives.length)
      p.selectedObjectiveId = p.secretObjectives[0].id;
    const card = p.secretObjectives.find((c) => c.id === p.selectedObjectiveId);
    p.objectiveStreak =
      g.enableSecretObjectives &&
      !g.sandboxContinued &&
      (!p.bot || g.allowBotSecretVictory) &&
      card &&
      objectiveProgress(g, p, card).every((r) => r.progress >= 1)
        ? p.objectiveStreak + 1
        : 0;
    if (p.objectiveStreak === 1 || p.objectiveStreak === 2) {
      const warning = `⚠️ ${p.nation} está a ${3 - p.objectiveStreak} rodada(s) de concluir seu Objetivo Secreto!`;
      report.events.push(warning);
      notify(g, {
        type: 'VICTORY_WARNING',
        text: warning,
        involvesPlayerIds: g.players.map((p) => p.id),
        severity: 'CRITICAL',
        focusProvinceId: p.originalCapitalId ?? undefined,
      });
      log(g, warning);
    }
  }
}
