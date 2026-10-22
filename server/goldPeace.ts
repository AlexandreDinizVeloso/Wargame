import type { GameState, PeaceTerm, War } from '../shared/types';
import { treatyCost, treatyPerspective } from '../shared/treaties';
import { clamp, getRelation, peaceDescription } from '../shared/rules';
import { assert, playerOf } from './state';
export function validateGoldPeace(
  g: GameState,
  w: War,
  id: string,
  terms: PeaceTerm[],
  concession = false,
) {
  assert([w.attackerLeaderId, w.defenderLeaderId].includes(id), 'Somente líderes negociam a paz.');
  assert(
    terms.length <= 5 && new Set(terms.map((t) => t.type)).size === terms.length,
    'Cláusulas repetidas ou tratado longo demais.',
  );
  assert(
    !terms.some((t) => t.type === 'WHITE_PEACE') || terms.length === 1,
    'Paz branca não pode incluir exigências.',
  );
  const side = treatyPerspective(w, id, concession),
    cost = treatyCost(terms);
  assert(
    Number.isFinite(cost) && cost <= Math.max(0, side.score),
    'Pontuação de guerra insuficiente para esses termos.',
  );
  for (const t of terms) {
    if (t.type === 'CEDE_PROVINCES') {
      assert(
        t.provinceIds.length > 0 && new Set(t.provinceIds).size === t.provinceIds.length,
        'Lista de cessão inválida.',
      );
      for (const pid of t.provinceIds) {
        const p = g.provinces.find((p) => p.id === pid);
        assert(
          p &&
            p.kind === 'LAND' &&
            p.ownerId &&
            side.loserIds.includes(p.ownerId) &&
            p.occupierId &&
            side.winnerIds.includes(p.occupierId),
          'Só é possível ceder terras ocupadas pelo lado vencedor.',
        );
      }
    }
    if (t.type === 'SUBJUGATE_VASSAL') {
      const winner = playerOf(g, side.winnerId),
        loser = playerOf(g, side.loserId);
      assert(!winner.subjectOfId && loser.subjectOfId !== winner.id, 'Vassalagem incompatível.');
    }
  }
  return side;
}
export function enactGoldPeace(
  g: GameState,
  w: War,
  id: string,
  terms: PeaceTerm[],
  concession = false,
) {
  const s = validateGoldPeace(g, w, id, terms, concession),
    winner = playerOf(g, s.winnerId),
    loser = playerOf(g, s.loserId);
  for (const t of terms) {
    if (t.type === 'CEDE_PROVINCES')
      for (const pid of t.provinceIds) {
        const p = g.provinces.find((p) => p.id === pid)!;
        const old = playerOf(g, p.ownerId!);
        old.lostProvinceIds = [...new Set([...old.lostProvinceIds, p.id])];
        p.ownerId = winner.id;
        p.occupierId = null;
        p.siege = null;
        winner.aggressiveExpansion = clamp(winner.aggressiveExpansion + 12);
      }
    if (t.type === 'WAR_REPARATIONS')
      g.reparations.push({
        payerId: loser.id,
        recipientId: winner.id,
        rate: 0.25,
        untilTurn: g.turn + 4,
      });
    if (t.type === 'HUMILIATE_DEMILITARIZE') {
      winner.prestige += 15;
      loser.prestige -= 15;
      loser.disarmUntil = g.turn + 4;
    }
    if (t.type === 'SUBJUGATE_VASSAL') {
      loser.subjectOfId = winner.id;
      for (const p of g.players) if (p.subjectOfId === loser.id) p.subjectOfId = winner.id;
      const r = getRelation(g, winner.id, loser.id)!;
      r.militaryAccess = [...new Set([...r.militaryAccess, winner.id, loser.id])];
    }
  }
  w.active = false;
  w.endedTurn = g.turn;
  w.peaceTerms = structuredClone(terms);
  w.treatyWinnerId = winner.id;
  w.treatyScore = Math.max(0, s.score);
  for (const p of g.provinces)
    if (
      p.ownerId &&
      p.occupierId &&
      ((s.winnerIds.includes(p.ownerId) && s.loserIds.includes(p.occupierId)) ||
        (s.loserIds.includes(p.ownerId) && s.winnerIds.includes(p.occupierId)))
    ) {
      p.occupierId = null;
      p.siege = null;
    }
  for (const p of g.provinces)
    if (
      p.siege &&
      p.ownerId &&
      ((s.winnerIds.includes(p.siege.attackerOwnerId) && s.loserIds.includes(p.ownerId)) ||
        (s.loserIds.includes(p.siege.attackerOwnerId) && s.winnerIds.includes(p.ownerId)))
    )
      p.siege = null;
  for (const a of w.attackerIds)
    for (const b of w.defenderIds) {
      const r = getRelation(g, a, b);
      if (r)
        r.truceUntil = g.turn + (terms.some((t) => t.type === 'HUMILIATE_DEMILITARIZE') ? 6 : 2);
    }
  g.offers = g.offers.filter((o) => o.warId !== w.id);
  return {
    winner,
    loser,
    text: `${winner.nation} e ${loser.nation} encerraram a guerra: ${terms.map((t) => peaceDescription(t, g.provinces)).join('; ') || 'Paz Branca'}.`,
  };
}
