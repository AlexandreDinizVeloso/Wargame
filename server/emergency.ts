import { getNationAuthority, spendNationAuthority } from '../shared/economy';
import { verticalRules } from '../shared/fogOfWar';
import { goldRules } from '../shared/factions';
import type { GameState } from '../shared/types';
import { levyReason } from '../shared/emergency';
import { atWar, compositionOf, reservedResources } from '../shared/rules';
import { assert, createBattalion, playerOf } from './state';
import { notify } from './notifications';
export function emergencyLevy(g: GameState, id: string) {
  const p = playerOf(g, id),
    reason = levyReason(g, id),
    reserved = reservedResources(g, id);
  assert(!reason, reason ?? 'Mobilização indisponível.');
  assert(p.gold - reserved.gold >= 50, 'Libere 50 ouro reservado antes de convocar.');
  const target = g.provinces
    .filter(
      (q) =>
        q.kind === 'LAND' &&
        q.ownerId === id &&
        !q.occupierId &&
        !g.battalions.some(
          (a) =>
            a.provinceId === q.id &&
            !a.isFleet &&
            !a.embarkedOnId &&
            (a.ownerId === 'NEUTRAL' || atWar(g, id, a.ownerId)),
        ),
    )
    .sort(
      (a, b) => Number(b.capitalOf === id) - Number(a.capitalOf === id) || a.id.localeCompare(b.id),
    )[0];
  assert(target, 'Sem província segura para mobilização.');
  if (verticalRules(g)) {
    assert(
      getNationAuthority(p) - reserved.influence >= 15,
      'Libere 15 Autoridade reservada antes de convocar.',
    );
    spendNationAuthority(p, 15);
  } else p.stability -= 15;
  p.gold -= 50;
  p.emergencyLevyTurn = g.turn;
  p.homelandDefenseUntil = g.turn + 1;
  createBattalion(g, id, target.id, compositionOf({ infantry: 5 }), {
    morale: goldRules(g) && p.nationId === 'sol_invicto' ? 100 : 90,
    training: goldRules(g) && p.nationId === 'sol_invicto' ? 1.25 : 1,
    name: 'Defesa da Pátria',
  });
  notify(g, {
    type: 'EMERGENCY_LEVY',
    severity: 'WARNING',
    involvesPlayerIds: [id],
    focusProvinceId: target.id,
    text: `Defesa da Pátria mobilizada em ${target.name}: cinco infantarias e +15% defesa territorial por duas rodadas.`,
  });
}
