import type { CasusBelli, DiplomaticOrder, GameState, PeaceTerm, War } from '../shared/types';
import {
  CASUS_LABELS,
  peaceDescription,
  atWar,
  clamp,
  controller,
  getRelation,
  livingPlayers,
  reservedResources,
  roundMoney,
  unitCount,
} from '../shared/rules';
import {
  activeAlliances,
  assert,
  destroyBattalion,
  liveArmySize,
  log,
  nextId,
  playerOf,
  provinceOf,
  removeUnits,
} from './state';
export function diplomaticEvent(
  g: GameState,
  action: string,
  actorId: string | null,
  targetId: string,
  text: string,
  amount = 0,
  provinceId: string | null = null,
  covert = false,
) {
  g.pendingDiplomacy.push({ action, actorId, targetId, text, amount, provinceId, covert });
  log(g, text, 'diplomacy');
}
export function electEmperor(g: GameState) {
  const living = new Set(livingPlayers(g).map((p) => p.id)),
    d = g.diet;
  d.memberRealmIds = d.memberRealmIds.filter(
    (id) => living.has(id) && !d.bannedRealmIds.includes(id),
  );
  for (const id of Object.keys(d.votes))
    if (!d.memberRealmIds.includes(id) || !d.memberRealmIds.includes(d.votes[id]))
      delete d.votes[id];
  const old = d.emperorId;
  d.emperorId =
    [...d.memberRealmIds].sort(
      (a, b) =>
        Object.values(d.votes).filter((v) => v === b).length -
          Object.values(d.votes).filter((v) => v === a).length ||
        playerOf(g, b).prestige - playerOf(g, a).prestige ||
        a.localeCompare(b),
    )[0] ?? null;
  if (old !== d.emperorId) {
    d.retaliationEdictActive = false;
    if (d.emperorId)
      diplomaticEvent(
        g,
        'EMPEROR_ELECTED',
        d.emperorId,
        d.emperorId,
        `${playerOf(g, d.emperorId).nation} preside a Dieta Imperial.`,
      );
  }
}
export function joinDiet(g: GameState, id: string, forced = false) {
  assert(
    g.provinces.some((p) => p.ownerId === id),
    'Reino sem território não pode ingressar.',
  );
  assert(!g.diet.bannedRealmIds.includes(id) || forced, 'O banimento imperial impede o ingresso.');
  if (!g.diet.memberRealmIds.includes(id)) {
    g.diet.memberRealmIds.push(id);
    g.diet.votes[id] = id;
    diplomaticEvent(g, 'JOIN_DIET', id, id, `${playerOf(g, id).nation} ingressou na Dieta.`);
  }
  if (forced) g.diet.bannedRealmIds = g.diet.bannedRealmIds.filter((x) => x !== id);
  electEmperor(g);
}
export function leaveDiet(g: GameState, id: string) {
  g.diet.memberRealmIds = g.diet.memberRealmIds.filter((x) => x !== id);
  delete g.diet.votes[id];
  electEmperor(g);
}
export function syncWars(g: GameState) {
  for (const r of g.relations) {
    r.atWar = atWar(g, r.a, r.b);
    if (r.atWar) {
      r.allied = false;
      r.militaryAccess = [];
    }
  }
}
function participant(g: GameState, war: War, id: string, defensive: boolean) {
  const side = defensive ? war.defenderIds : war.attackerIds,
    other = defensive ? war.attackerIds : war.defenderIds;
  assert(!other.includes(id), 'Reino já está no lado oposto.');
  if (!side.includes(id)) side.push(id);
  syncWars(g);
}
export function callToArms(
  g: GameState,
  actorId: string,
  warId: string,
  allyId: string,
  defensive = false,
) {
  const war = g.wars.find((w) => w.id === warId && w.active);
  assert(war, 'Guerra não encontrada.');
  assert(
    war.attackerIds.includes(actorId) || war.defenderIds.includes(actorId),
    'Você não participa desta guerra.',
  );
  const isDefensive = war.defenderIds.includes(actorId);
  if (!defensive) defensive = isDefensive;
  assert(getRelation(g, actorId, allyId)?.allied, 'É necessário ter uma aliança.');
  assert(![...war.attackerIds, ...war.defenderIds].includes(allyId), 'Reino já participa.');
  const ally = playerOf(g, allyId);
  if (defensive || ally.bot) participant(g, war, allyId, defensive);
  if (!ally.bot)
    g.offers.push({
      id: nextId(g, 'offer'),
      kind: 'call_to_arms',
      from: actorId,
      to: allyId,
      amount: 0,
      warId,
      defensive,
      expiresTurn: g.turn + 1,
    });
  diplomaticEvent(
    g,
    'CALL_TO_ARMS',
    actorId,
    allyId,
    `${ally.nation} recebeu chamado ${defensive ? 'defensivo' : 'ofensivo'} às armas.`,
  );
}
export function declareWar(
  g: GameState,
  id: string,
  targetId: string,
  casusBelli: CasusBelli,
  offensiveAllies: string[] = [],
) {
  const actor = playerOf(g, id),
    target = playerOf(g, targetId),
    r = getRelation(g, id, targetId);
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  assert(
    id !== targetId && g.provinces.some((p) => p.ownerId === targetId),
    'Alvo de guerra inválido.',
  );
  assert(!actor.subjectOfId, 'Um reino subjugado não pode declarar guerra.');
  assert(!atWar(g, id, targetId), 'Já existe guerra entre esses reinos.');
  assert(!r?.allied, 'Rompa a aliança antes de declarar guerra.');
  assert((r?.truceUntil ?? 0) < g.turn, 'Existe uma trégua ativa.');
  assert(
    ['CONQUEST', 'IMPERIAL_BAN', 'HOLY_WAR', 'HUMILIATION'].includes(casusBelli),
    'Casus belli inválido.',
  );
  if (casusBelli === 'HOLY_WAR')
    assert(actor.faith !== target.faith, 'Guerra Santa exige outra religião.');
  if (casusBelli === 'IMPERIAL_BAN')
    assert(g.diet.bannedRealmIds.includes(targetId), 'Esse reino não está sob banimento.');
  for (const ally of offensiveAllies)
    assert(getRelation(g, id, ally)?.allied && ally !== targetId, 'Aliado ofensivo inválido.');
  if (!(casusBelli === 'HOLY_WAR' && actor.faith === 'SOLAR') && casusBelli !== 'IMPERIAL_BAN')
    actor.stability = clamp(actor.stability - 5);
  const war: War = {
    id: nextId(g, 'war'),
    name: `${actor.nation} × ${target.nation}`,
    attackerLeaderId: id,
    defenderLeaderId: targetId,
    attackerIds: [id],
    defenderIds: [targetId],
    casusBelli,
    warScore: 0,
    battleScore: 0,
    blockadeScore: 0,
    startedTurn: g.turn,
    endedTurn: null,
    active: true,
    imperialBanAgainstId: null,
    peaceTerms: [],
  };
  g.wars.push(war);
  g.diet.peaceTurnsCounter = 0;
  if (g.diet.retaliationEdictActive) {
    war.imperialBanAgainstId = id;
    if (!g.diet.bannedRealmIds.includes(id)) g.diet.bannedRealmIds.push(id);
    leaveDiet(g, id);
    for (const member of g.diet.memberRealmIds)
      if (member !== id && !war.defenderIds.includes(member)) war.defenderIds.push(member);
    diplomaticEvent(
      g,
      'IMPERIAL_RETALIATION',
      g.diet.emperorId,
      id,
      'O Édito de Paz convocou toda a Dieta contra o agressor.',
    );
  }
  syncWars(g);
  for (const ally of activeAlliances(g, targetId).map((r) => (r.a === targetId ? r.b : r.a)))
    if (![...war.attackerIds, ...war.defenderIds].includes(ally))
      callToArms(g, targetId, war.id, ally, true);
  for (const ally of [...new Set(offensiveAllies)])
    if (![...war.attackerIds, ...war.defenderIds].includes(ally)) callToArms(g, id, war.id, ally);
  diplomaticEvent(
    g,
    'DECLARE_WAR',
    id,
    targetId,
    `${actor.nation} declarou guerra a ${target.nation} (${CASUS_LABELS[casusBelli]}).`,
  );
  return war;
}
export function updateWarScores(g: GameState) {
  for (const w of g.wars.filter((w) => w.active)) {
    const occupation = g.provinces.reduce(
      (n, p) =>
        n +
        (p.occupierId && p.ownerId
          ? w.attackerIds.includes(p.occupierId) && w.defenderIds.includes(p.ownerId)
            ? p.baseTax * 3
            : w.defenderIds.includes(p.occupierId) && w.attackerIds.includes(p.ownerId)
              ? -p.baseTax * 3
              : 0
          : 0),
      0,
    );
    const attackerHome = g.provinces.filter((p) => p.ownerId === w.attackerLeaderId),
      defenderHome = g.provinces.filter((p) => p.ownerId === w.defenderLeaderId);
    const attackerCapitulates =
      attackerHome.length > 0 &&
      attackerHome.every((p) => !!p.occupierId && w.defenderIds.includes(p.occupierId));
    const defenderCapitulates =
      defenderHome.length > 0 &&
      defenderHome.every((p) => !!p.occupierId && w.attackerIds.includes(p.occupierId));
    w.warScore = defenderCapitulates
      ? 100
      : attackerCapitulates
        ? -100
        : clamp(roundMoney(w.battleScore + w.blockadeScore + occupation), -100, 100);
  }
}
export function peaceCost(g: GameState, terms: PeaceTerm[]) {
  return terms.reduce(
    (sum, t) =>
      sum +
      (t.type === 'CEDE_PROVINCES'
        ? t.provinceIds.reduce((n, id) => n + 12 + provinceOf(g, id).baseTax, 0)
        : t.type === 'WAR_REPARATIONS'
          ? 20
          : t.type === 'HUMILIATE_DISARM'
            ? 25
            : t.type === 'SUBJUGATE'
              ? 70
              : 30),
    0,
  );
}
function peaceSides(_g: GameState, war: War, actorId: string) {
  assert(
    [war.attackerLeaderId, war.defenderLeaderId].includes(actorId),
    'Somente líderes negociam a paz.',
  );
  const attack = actorId === war.attackerLeaderId;
  return {
    score: war.warScore * (attack ? 1 : -1),
    winnerIds: attack ? war.attackerIds : war.defenderIds,
    loserIds: attack ? war.defenderIds : war.attackerIds,
    targetId: attack ? war.defenderLeaderId : war.attackerLeaderId,
  };
}
function validatePeace(g: GameState, war: War, actorId: string, terms: PeaceTerm[]) {
  const sides = peaceSides(g, war, actorId);
  assert(terms.length <= 5, 'Tratado longo demais.');
  assert(new Set(terms.map((t) => t.type)).size === terms.length, 'Não repita termos no tratado.');
  if (terms.length)
    assert(
      sides.score >= peaceCost(g, terms),
      'Pontuação de guerra insuficiente para esses termos.',
    );
  for (const t of terms) {
    if (t.type === 'CEDE_PROVINCES') {
      assert(
        t.provinceIds.length > 0 && new Set(t.provinceIds).size === t.provinceIds.length,
        'Lista de cessão inválida.',
      );
      for (const id of t.provinceIds) {
        const p = provinceOf(g, id);
        assert(
          p.kind === 'LAND' &&
            p.ownerId &&
            sides.loserIds.includes(p.ownerId) &&
            !!p.occupierId &&
            sides.winnerIds.includes(p.occupierId),
          'Só é possível exigir terras inimigas ocupadas.',
        );
      }
    } else if (t.type === 'WAR_REPARATIONS')
      assert(
        Number.isInteger(t.immediateTribute) &&
          t.immediateTribute >= 0 &&
          t.immediateTribute <= 100,
        'Tributo imediato deve estar entre 0 e 100.',
      );
    else if (t.type === 'FORCE_EMPIRE_OR_RELIGION')
      assert(['EMPIRE', 'RELIGION'].includes(t.choice), 'Exigência inválida.');
    else assert(['HUMILIATE_DISARM', 'SUBJUGATE'].includes(t.type), 'Termo de paz inválido.');
  }
  return sides;
}
export function applyPeace(g: GameState, war: War, actorId: string, terms: PeaceTerm[]) {
  const sides = validatePeace(g, war, actorId, terms),
    winner = playerOf(g, actorId),
    loser = playerOf(g, sides.targetId);
  for (const t of terms) {
    if (t.type === 'CEDE_PROVINCES')
      for (const id of t.provinceIds) {
        const p = provinceOf(g, id);
        p.ownerId = actorId;
        p.occupierId = null;
      }
    if (t.type === 'WAR_REPARATIONS') {
      const paid = Math.min(loser.gold, t.immediateTribute);
      loser.gold = roundMoney(loser.gold - paid);
      winner.gold = roundMoney(winner.gold + paid);
      g.reparations.push({
        payerId: loser.id,
        recipientId: winner.id,
        rate: 0.25,
        untilTurn: g.turn + 4,
      });
      g.orders[loser.id] = [];
    }
    if (t.type === 'HUMILIATE_DISARM') {
      winner.prestige += 20;
      winner.moraleBonusUntil = g.turn + 3;
      loser.prestige -= 20;
      loser.disarmUntil = g.turn + 3;
      loser.armyCap = 8;
      if (g.diet.emperorId === winner.id)
        g.diet.imperialAuthority = clamp(g.diet.imperialAuthority + 20);
      let excess = liveArmySize(g, loser.id) - 8;
      for (const a of g.battalions
        .filter((a) => a.ownerId === loser.id && !a.isFleet)
        .sort((a, b) => unitCount(b) - unitCount(a))) {
        if (excess <= 0) break;
        const count = Math.min(excess, unitCount(a));
        removeUnits(a, count);
        excess -= count;
        if (unitCount(a) === 0) destroyBattalion(g, a);
      }
      g.orders[loser.id] = g.orders[loser.id].filter(
        (o) =>
          !('battalionId' in o) ||
          !o.battalionId ||
          g.battalions.some((a) => a.id === o.battalionId),
      );
    }
    if (t.type === 'FORCE_EMPIRE_OR_RELIGION') {
      if (t.choice === 'EMPIRE') joinDiet(g, loser.id, true);
      else loser.faith = winner.faith;
    }
    if (t.type === 'SUBJUGATE') {
      assert(!winner.subjectOfId, 'Um súdito não pode impor submissão a outro reino.');
      for (const realm of g.players)
        if (realm.subjectOfId === loser.id) realm.subjectOfId = winner.id;
      loser.subjectOfId = winner.id;
      const access = getRelation(g, winner.id, loser.id)!;
      access.militaryAccess = [...new Set([...access.militaryAccess, winner.id, loser.id])];
      leaveDiet(g, loser.id);
    }
  }
  war.active = false;
  war.endedTurn = g.turn;
  war.peaceTerms = structuredClone(terms);
  for (const p of g.provinces)
    if (
      p.ownerId &&
      p.occupierId &&
      ((sides.winnerIds.includes(p.ownerId) && sides.loserIds.includes(p.occupierId)) ||
        (sides.loserIds.includes(p.ownerId) && sides.winnerIds.includes(p.occupierId)))
    )
      p.occupierId = null;
  for (const a of war.attackerIds)
    for (const b of war.defenderIds) {
      const r = getRelation(g, a, b);
      if (r) r.truceUntil = g.turn + 2;
    }
  g.offers = g.offers.filter((o) => o.warId !== war.id);
  syncWars(g);
  diplomaticEvent(
    g,
    'PEACE',
    actorId,
    loser.id,
    `${winner.nation} e ${loser.nation} encerraram a guerra: ${terms.map((t) => peaceDescription(t, g.provinces)).join('; ') || 'paz sem exigências'}.`,
  );
}
export function offerPeace(g: GameState, id: string, warId: string, terms: PeaceTerm[]) {
  const war = g.wars.find((w) => w.id === warId && w.active);
  assert(war, 'Guerra não encontrada.');
  updateWarScores(g);
  const sides = validatePeace(g, war, id, terms);
  if (sides.score >= 100) {
    applyPeace(g, war, id, terms);
    return;
  }
  assert(
    !g.offers.some((o) => o.kind === 'peace' && o.warId === warId && o.from === id),
    'Já existe proposta de paz pendente.',
  );
  const loser = playerOf(g, sides.targetId);
  if (
    loser.bot &&
    (terms.length === 0
      ? loser.warExhaustion >= 15 || g.turn - war.startedTurn >= 4
      : sides.score >= peaceCost(g, terms) + 10 || loser.warExhaustion >= 55)
  ) {
    applyPeace(g, war, id, terms);
    return;
  }
  g.offers.push({
    id: nextId(g, 'offer'),
    kind: 'peace',
    from: id,
    to: sides.targetId,
    amount: 0,
    warId,
    terms: structuredClone(terms),
    expiresTurn: g.turn + 2,
  });
}
export function breakAlliance(g: GameState, id: string, targetId: string) {
  const r = getRelation(g, id, targetId);
  assert(r?.allied, 'Não há aliança para romper.');
  r.allied = false;
  r.militaryAccess = [];
  r.trust = clamp(r.trust - 50, -100, 100);
  r.truceUntil = g.turn + 1;
  const p = playerOf(g, id);
  p.prestige -= 5;
  p.influence = Math.max(0, p.influence - 4);
  for (const a of g.battalions.filter((a) => a.ownerId === id)) a.morale = clamp(a.morale - 10);
  g.orders[id] = g.orders[id].filter((o) => o.type !== 'CONVERT');
  diplomaticEvent(
    g,
    'BREAK_ALLIANCE',
    id,
    targetId,
    `${p.nation} rompeu a aliança com ${playerOf(g, targetId).nation}.`,
  );
}
export function answerOffer(g: GameState, id: string, offerId: string, accept: boolean) {
  const offer = g.offers.find((o) => o.id === offerId && o.to === id);
  assert(offer, 'Oferta não encontrada.');
  const from = playerOf(g, offer.from),
    to = playerOf(g, id),
    r = getRelation(g, from.id, id)!;
  if (offer.kind === 'call_to_arms') {
    const w = g.wars.find((w) => w.id === offer.warId && w.active);
    assert(w, 'Guerra já encerrada.');
    if (accept) participant(g, w, id, !!offer.defensive);
    else if (offer.defensive) {
      w.defenderIds = w.defenderIds.filter((x) => x !== id);
      r.allied = false;
      r.trust = clamp(r.trust - 50, -100, 100);
      to.prestige -= 15;
      g.diet.imperialAuthority = clamp(g.diet.imperialAuthority - 5);
      syncWars(g);
    }
  } else if (accept) {
    if (offer.kind === 'peace') {
      const w = g.wars.find((w) => w.id === offer.warId && w.active);
      assert(w, 'Guerra já encerrada.');
      applyPeace(g, w, from.id, offer.terms ?? []);
    } else {
      assert(!atWar(g, id, from.id), 'Negocie a paz antes de firmar esse acordo.');
      if (offer.kind === 'alliance') {
        assert(
          activeAlliances(g, id).length < 3 && activeAlliances(g, from.id).length < 3,
          'Limite de três alianças.',
        );
        r.allied = true;
        r.trust = clamp(r.trust + 20, -100, 100);
      }
      if (offer.kind === 'military_access' && !r.militaryAccess.includes(from.id))
        r.militaryAccess.push(from.id);
      if (offer.kind === 'tribute')
        r.tribute = {
          payerId: id,
          recipientId: from.id,
          amount: offer.amount,
          untilTurn: g.turn + 4,
        };
    }
  }
  g.offers = g.offers.filter((o) => o.id !== offerId);
  diplomaticEvent(
    g,
    accept ? 'ACCEPT_OFFER' : 'DECLINE_OFFER',
    id,
    from.id,
    `${to.nation} ${accept ? 'aceitou' : 'recusou'} a proposta de ${from.nation}.`,
  );
}
export function diplomacy(g: GameState, id: string, o: DiplomaticOrder) {
  const actor = playerOf(g, id),
    target = playerOf(g, o.targetRealmId);
  assert(id !== target.id, 'Escolha outro reino.');
  const r = getRelation(g, id, target.id)!;
  if (o.action === 'BREAK_ALLIANCE') {
    breakAlliance(g, id, target.id);
    return;
  }
  if (['PROPOSE_ALLIANCE', 'MILITARY_ACCESS', 'DEMAND_TRIBUTE'].includes(o.action)) {
    assert(!atWar(g, id, target.id), 'Negocie a paz primeiro.');
    assert(
      !g.offers.some(
        (f) =>
          f.from === id &&
          f.to === target.id &&
          f.kind ===
            (
              {
                PROPOSE_ALLIANCE: 'alliance',
                MILITARY_ACCESS: 'military_access',
                DEMAND_TRIBUTE: 'tribute',
              } as Record<string, string>
            )[o.action],
      ),
      'Proposta já enviada.',
    );
    if (o.action === 'PROPOSE_ALLIANCE')
      assert(!r.allied && activeAlliances(g, id).length < 3, 'Aliança indisponível.');
    if (o.action === 'DEMAND_TRIBUTE')
      assert(
        Number.isInteger(o.amount) && o.amount! >= 1 && o.amount! <= 30,
        'Tributo deve ser 1–30.',
      );
    const offer = {
      id: nextId(g, 'offer'),
      from: id,
      to: target.id,
      kind: (o.action === 'PROPOSE_ALLIANCE'
        ? 'alliance'
        : o.action === 'MILITARY_ACCESS'
          ? 'military_access'
          : 'tribute') as 'alliance' | 'military_access' | 'tribute',
      amount: o.amount ?? 0,
      expiresTurn: g.turn + 2,
    };
    g.offers.push(offer);
    if (
      target.bot &&
      (offer.kind !== 'tribute' || target.gold > 60) &&
      activeAlliances(g, target.id).length < 3
    )
      answerOffer(g, target.id, offer.id, true);
    return;
  }
  if (o.action === 'EMBARGO') {
    const imposed = !r.embargoes.includes(id);
    r.embargoes = imposed ? [...r.embargoes, id] : r.embargoes.filter((x) => x !== id);
    if (imposed) r.trust = clamp(r.trust - 25, -100, 100);
    diplomaticEvent(
      g,
      'EMBARGO',
      id,
      target.id,
      `${actor.nation} ${imposed ? 'impôs' : 'retirou'} embargo a ${target.nation}.`,
    );
    return;
  }
  const reserved = reservedResources(g, id);
  const amount = o.amount ?? 0;
  assert(Number.isInteger(amount) && amount >= 1 && amount <= 1000, 'Quantia inválida.');
  assert(actor.gold - reserved.gold >= amount, 'Ouro livre insuficiente.');
  if (o.action === 'FUND_REBELS') {
    assert(amount >= 12, 'Rebeldes exigem ao menos 12 ouro.');
    const p = provinceOf(g, o.targetProvinceId ?? '');
    assert(controller(p) === target.id && p.kind === 'LAND', 'Província rival inválida.');
    p.unrest = clamp(p.unrest + 30);
    r.trust = clamp(r.trust - 15, -100, 100);
    diplomaticEvent(
      g,
      'FUND_REBELS',
      id,
      target.id,
      `Redes clandestinas elevaram a revolta em ${p.name}.`,
      amount,
      p.id,
      true,
    );
  } else {
    assert(o.action === 'SEND_SUBSIDY', 'Ação diplomática inválida.');
    target.gold = roundMoney(target.gold + amount);
    r.trust = clamp(r.trust + 10, -100, 100);
    diplomaticEvent(
      g,
      'SEND_SUBSIDY',
      id,
      target.id,
      `${actor.nation} enviou ${amount} ouro a ${target.nation}.`,
      amount,
    );
  }
  actor.gold = roundMoney(actor.gold - amount);
}
export function issueEdict(g: GameState, id: string) {
  assert(g.diet.emperorId === id, 'Somente o Imperador pode emitir o Édito.');
  assert(!g.diet.retaliationEdictActive, 'O Édito já está ativo.');
  const p = playerOf(g, id);
  assert(
    g.diet.imperialAuthority >= 25 && p.gold - reservedResources(g, id).gold >= 25,
    'Édito exige 25 ouro e 25 autoridade.',
  );
  p.gold = roundMoney(p.gold - 25);
  g.diet.imperialAuthority -= 25;
  g.diet.retaliationEdictActive = true;
  diplomaticEvent(
    g,
    'IMPERIAL_EDICT',
    id,
    id,
    'O Édito de Paz Imperial ameaça retaliar qualquer nova declaração de guerra.',
  );
}
