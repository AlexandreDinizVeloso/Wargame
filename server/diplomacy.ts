import type { DiplomaticOrder, GameState, Offer } from '../shared/types';
import {
  clamp,
  orderCost,
  orderKey,
  reservedResources,
  roundMoney,
  realmEconomy,
} from '../shared/rules';
import { activeAlliances, assert, log, nextId, playerOf, provinceOf, relation } from './state';

function record(
  g: GameState,
  action: string,
  actorId: string,
  targetId: string,
  text: string,
  amount = 0,
  provinceId: string | null = null,
  covert = false,
) {
  g.pendingDiplomacy.push({ action, actorId, targetId, text, amount, provinceId, covert });
  log(
    g,
    covert ? 'Financiamento externo intensificou a revolta em uma província.' : text,
    'diplomacy',
  );
}
export function proposeAlliance(g: GameState, from: string, to: string) {
  executeDiplomacy(g, from, { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: to });
}
export function answerAlliance(g: GameState, actorId: string, offerId: string, accept: boolean) {
  assert(g.phase === 'planning', 'A campanha terminou.');
  const offer = g.offers.find((o) => o.id === offerId && o.to === actorId);
  assert(offer, 'Proposta não encontrada.');
  const r = relation(g, offer.from, offer.to)!;
  if (accept) {
    if (offer.kind === 'alliance') {
      assert(
        activeAlliances(g, offer.from).length < 2 && activeAlliances(g, offer.to).length < 2,
        'Cada reino pode ter até 2 alianças.',
      );
      r.allied = true;
      r.atWar = false;
      r.trust = clamp(r.trust + 20, -100, 100);
      for (const id of [offer.from, offer.to])
        g.orders[id] = g.orders[id].filter(
          (o) =>
            o.type !== 'MOVE_ATTACK' ||
            provinceOf(g, o.toProvinceId).ownerId !== (id === offer.from ? offer.to : offer.from),
        );
    } else if (offer.kind === 'military_access') {
      if (!r.militaryAccess.includes(offer.from)) r.militaryAccess.push(offer.from);
      r.trust = clamp(r.trust + 5, -100, 100);
    } else {
      r.tribute = {
        payerId: offer.to,
        recipientId: offer.from,
        amount: offer.amount,
        untilTurn: g.turn + 4,
      };
      r.atWar = false;
      r.truceUntil = g.turn + 1;
    }
    record(
      g,
      `ACCEPT_${offer.kind.toUpperCase()}`,
      actorId,
      offer.from,
      `${playerOf(g, actorId).nation} aceitou ${offer.kind === 'alliance' ? 'a aliança' : offer.kind === 'military_access' ? 'o acesso militar' : 'o pagamento de tributo'} de ${playerOf(g, offer.from).nation}.`,
      offer.amount,
    );
  } else {
    r.trust = clamp(r.trust - 5, -100, 100);
    record(
      g,
      'DECLINE_OFFER',
      actorId,
      offer.from,
      `${playerOf(g, actorId).nation} recusou uma proposta diplomática.`,
    );
  }
  g.offers = g.offers.filter((o) => o.id !== offerId);
}
export function breakAlliance(g: GameState, from: string, to: string) {
  assert(g.phase === 'planning' && !playerOf(g, from).ready, 'Reabra suas ordens para negociar.');
  const r = relation(g, from, to);
  assert(r?.allied, 'Não existe aliança entre esses reinos.');
  const exempt = g.hegemonyLeaderId === to,
    actor = playerOf(g, from);
  r.allied = false;
  r.militaryAccess = [];
  r.truceUntil = exempt ? 0 : g.turn + 1;
  r.atWar = false;
  r.trust = clamp(r.trust - (exempt ? 15 : 50), -100, 100);
  if (!exempt) {
    actor.influence = Math.max(0, actor.influence - 4);
    actor.peaceTurns = 0;
    for (const p of g.provinces.filter((p) => p.ownerId === from)) p.morale = clamp(p.morale - 10);
  }
  while (reservedResources(g, from).influence > actor.influence) {
    const index = g.orders[from].findLastIndex((o) => orderCost(o).influence > 0);
    assert(index >= 0, 'Reserva inválida.');
    g.orders[from].splice(index, 1);
  }
  record(
    g,
    'BREAK_ALLIANCE',
    from,
    to,
    `${actor.nation} rompeu a aliança com ${playerOf(g, to).nation}.${exempt ? ' Mobilização contra a hegemonia: sem penalidade ou trégua.' : ` −4 influência, −10 moral; trégua até o fim da rodada ${r.truceUntil}.`}`,
  );
}
export function executeDiplomacy(g: GameState, from: string, o: DiplomaticOrder) {
  assert(g.phase === 'planning', 'A diplomacia exige uma campanha em andamento.');
  const actor = playerOf(g, from),
    target = playerOf(g, o.targetRealmId);
  assert(!actor.ready, 'Reabra suas ordens para negociar.');
  assert(from !== target.id, 'Escolha outro reino.');
  assert(
    g.provinces.some((p) => p.ownerId === from) && g.provinces.some((p) => p.ownerId === target.id),
    'Reinos sem território não podem negociar.',
  );
  const r = relation(g, from, target.id)!;
  const spend = (amount: number) => {
    assert(
      Number.isFinite(amount) &&
        amount > 0 &&
        amount <= actor.gold - reservedResources(g, from).gold,
      'Ouro livre insuficiente ou valor inválido.',
    );
    actor.gold = roundMoney(actor.gold - amount);
  };
  if (o.action === 'BREAK_ALLIANCE') {
    breakAlliance(g, from, target.id);
    return;
  }
  if (o.action === 'EMBARGO') {
    const active = r.embargoes.includes(from);
    r.embargoes = active ? r.embargoes.filter((id) => id !== from) : [...r.embargoes, from];
    if (!active) r.trust = clamp(r.trust - 25, -100, 100);
    record(
      g,
      active ? 'LIFT_EMBARGO' : 'EMBARGO',
      from,
      target.id,
      `${actor.nation} ${active ? 'suspendeu' : 'impôs'} o embargo comercial a ${target.nation}.`,
    );
    return;
  }
  if (o.action === 'FUND_REBELS') {
    const p = provinceOf(g, o.targetProvinceId ?? '');
    assert(p.ownerId === target.id, 'Escolha uma província do reino alvo.');
    assert(
      Number.isFinite(o.amount) && o.amount! >= 12,
      'Financiar rebeldes custa pelo menos 12 ouro.',
    );
    spend(o.amount!);
    p.unrest = clamp(p.unrest + 30);
    r.trust = clamp(r.trust - 10, -100, 100);
    record(
      g,
      o.action,
      from,
      target.id,
      `Agentes financiaram rebeldes em ${p.name}.`,
      o.amount!,
      p.id,
      true,
    );
    return;
  }
  if (o.action === 'SEND_SUBSIDY') {
    assert(Number.isFinite(o.amount), 'Valor inválido.');
    spend(o.amount!);
    target.gold = roundMoney(target.gold + o.amount!);
    r.trust = clamp(r.trust + 10, -100, 100);
    record(
      g,
      o.action,
      from,
      target.id,
      `${actor.nation} enviou ${o.amount} ouro a ${target.nation}.`,
      o.amount,
    );
    return;
  }
  assert(
    ['PROPOSE_ALLIANCE', 'DEMAND_TRIBUTE', 'MILITARY_ACCESS'].includes(o.action),
    'Ação diplomática inválida.',
  );
  const kind: Offer['kind'] =
    o.action === 'PROPOSE_ALLIANCE'
      ? 'alliance'
      : o.action === 'MILITARY_ACCESS'
        ? 'military_access'
        : 'tribute';
  if (kind === 'alliance') {
    assert(!r.allied, 'Vocês já são aliados.');
    assert(
      activeAlliances(g, from).length < 2 && activeAlliances(g, target.id).length < 2,
      'Cada reino pode ter até 2 alianças.',
    );
  }
  if (kind === 'military_access') {
    assert(!r.atWar, 'Encerre a guerra antes de pedir acesso militar.');
    assert(!r.militaryAccess.includes(from), 'Você já tem acesso militar.');
  }
  const amount = kind === 'tribute' ? (o.amount ?? 3) : 0;
  if (kind === 'tribute')
    assert(
      Number.isFinite(amount) && amount >= 1 && amount <= 30,
      'O tributo deve ficar entre 1 e 30 ouro por rodada.',
    );
  assert(
    !g.offers.some(
      (x) =>
        x.kind === kind &&
        ((x.from === from && x.to === target.id) || (x.from === target.id && x.to === from)),
    ),
    'Já existe uma proposta entre esses reinos.',
  );
  const offer = { id: nextId(g, 'offer'), from, to: target.id, kind, amount };
  g.offers.push(offer);
  record(
    g,
    o.action,
    from,
    target.id,
    `${actor.nation} enviou uma proposta de ${kind === 'alliance' ? 'aliança' : kind === 'tribute' ? 'tributo' : 'acesso militar'} a ${target.nation}.`,
    amount,
  );
  if (target.bot) {
    const actorTroops = g.provinces
        .filter((p) => p.ownerId === from)
        .reduce((s, p) => s + p.troops, 0),
      targetTroops = g.provinces
        .filter((p) => p.ownerId === target.id)
        .reduce((s, p) => s + p.troops, 0);
    const accept =
      kind === 'tribute'
        ? actorTroops > targetTroops * 1.6 &&
          amount <= Math.max(1, realmEconomy(g, target.id).income * 0.3)
        : r.trust >= 0 && g.hegemonyLeaderId !== from;
    answerAlliance(g, target.id, offer.id, accept);
  }
}
