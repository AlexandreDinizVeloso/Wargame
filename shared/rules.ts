import type {
  Battalion,
  Composition,
  GameState,
  GameView,
  NationDefinition,
  NationId,
  Player,
  PlayerOrder,
  Province,
  ReligionId,
  ImperialDiet,
} from './types';
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const UNIT_KEYS = ['infantry', 'cavalry', 'artillery', 'warships', 'transports'] as const;
export const zeroComposition = (): Composition => ({
  infantry: 0,
  cavalry: 0,
  artillery: 0,
  warships: 0,
  transports: 0,
});
export const compositionOf = (a: Partial<Composition>): Composition =>
  Object.fromEntries(UNIT_KEYS.map((k) => [k, a[k] ?? 0])) as unknown as Composition;
export const unitCount = (a: Partial<Composition>) =>
  UNIT_KEYS.reduce((n, k) => n + (a[k] ?? 0), 0);
export const landCount = (a: Partial<Composition>) =>
  (a.infantry ?? 0) + (a.cavalry ?? 0) + (a.artillery ?? 0);
export const controller = (p: Province) => p.occupierId ?? p.ownerId;
export const NATIONS: NationDefinition[] = [
  {
    id: 'PORTUGAL',
    name: 'Portugal',
    color: '#d5ac68',
    emblem: 'anchor',
    religion: 'MERCHANT',
    ideas: ['Armada: +20% ataque naval', 'Feitorias: +15% comércio'],
    homeProvinceId: 'portugal',
    modifiers: { navalAttack: 1.2, trade: 1.15 },
    initial: { infantry: 4, cavalry: 1, artillery: 1, warships: 2, transports: 2 },
  },
  {
    id: 'CASTILE',
    name: 'Coroa de Castela',
    color: '#d8787d',
    emblem: 'castle',
    religion: 'SOLAR',
    ideas: ['Terços: +10% infantaria', 'Cavaleiros: +20% cavalaria'],
    homeProvinceId: 'castile',
    modifiers: { infantry: 1.1, cavalry: 1.2 },
    initial: { infantry: 5, cavalry: 2, artillery: 0, warships: 1, transports: 2 },
  },
  {
    id: 'FRANCE',
    name: 'França',
    color: '#70acd4',
    emblem: 'lily',
    religion: 'REFORMED',
    ideas: ['Grande bateria: +15% artilharia', 'Ordenanças: −10% custo terrestre'],
    homeProvinceId: 'france',
    modifiers: { artillery: 1.15, recruitCost: 0.9 },
    initial: { infantry: 4, cavalry: 1, artillery: 2, warships: 1, transports: 2 },
  },
  {
    id: 'AUSTRIA',
    name: 'Sacro Império',
    color: '#b2bc75',
    emblem: 'eagle',
    religion: 'ANCESTRAL',
    ideas: ['Chancelaria: +50% autoridade gerada', 'Integração: +10% pacificação'],
    homeProvinceId: 'germany',
    modifiers: { authority: 1.5, pacification: 1.1 },
    initial: { infantry: 5, cavalry: 2, artillery: 1, warships: 1, transports: 2 },
  },
  {
    id: 'OTTOMANS',
    name: 'Império Otomano',
    color: '#e6a26d',
    emblem: 'crescent',
    religion: 'SOLAR',
    ideas: ['Bombardas: +15% artilharia', 'Recrutamento: +20% reservas'],
    homeProvinceId: 'anatolia',
    modifiers: { artillery: 1.15, manpower: 1.2 },
    initial: { infantry: 5, cavalry: 1, artillery: 2, warships: 2, transports: 2 },
  },
  {
    id: 'MING',
    name: 'Império Ming',
    color: '#cf8b59',
    emblem: 'dragon',
    religion: 'REFORMED',
    ideas: ['Oficinas: −15% custo terrestre', 'Censo: +20% reservas'],
    homeProvinceId: 'china-east',
    modifiers: { recruitCost: 0.85, manpower: 1.2 },
    initial: { infantry: 6, cavalry: 0, artillery: 2, warships: 1, transports: 3 },
  },
  {
    id: 'JAPAN',
    name: 'Japão',
    color: '#b295c8',
    emblem: 'sun',
    religion: 'ANCESTRAL',
    ideas: ['Samurais: +15% infantaria', 'Estaleiros: −15% custo naval'],
    homeProvinceId: 'japan',
    modifiers: { infantry: 1.15, fleetCost: 0.85 },
    initial: { infantry: 5, cavalry: 1, artillery: 0, warships: 2, transports: 2 },
  },
  {
    id: 'INCA',
    name: 'Império Inca',
    color: '#6db6a1',
    emblem: 'mountain',
    religion: 'SOLAR',
    ideas: ['Integração andina: +25% pacificação', 'Rotas: +20% comércio'],
    homeProvinceId: 'andes',
    modifiers: { pacification: 1.25, trade: 1.2 },
    initial: { infantry: 7, cavalry: 0, artillery: 0, warships: 1, transports: 3 },
  },
];
export const nationOf = (id: NationId) => NATIONS.find((n) => n.id === id)!;
export const RELIGIONS: Record<
  ReligionId,
  { name: string; tenet: string; color: string; holyCityId: string }
> = {
  SOLAR: {
    name: 'Sol Invictus',
    tenet: 'Ordem Solar: +15% ataque de infantaria e Guerra Santa sem perda de estabilidade.',
    color: '#dfb85f',
    holyCityId: 'italy',
  },
  MERCHANT: {
    name: 'Conclave Mercante',
    tenet: '+25% receita em províncias com porto/mercado e −25% contratação de mercenários.',
    color: '#67baa7',
    holyCityId: 'portugal',
  },
  REFORMED: {
    name: 'Sínodo Reformado',
    tenet: '+20% poder de artilharia e −25% custo de fortes.',
    color: '#7daedf',
    holyCityId: 'germany',
  },
  ANCESTRAL: {
    name: 'Tradição Ancestral',
    tenet: '+20% defesa no próprio território e +15% velocidade de pacificação.',
    color: '#b69aca',
    holyCityId: 'japan',
  },
};
export const holyCityId = (religion: ReligionId, provinces: Province[]) => {
  const fixed = RELIGIONS[religion].holyCityId;
  if (provinces.some((p) => p.id === fixed)) return fixed;
  const local: Record<ReligionId, Record<string, string>> = {
    SOLAR: { EUROPE: 'italy', AMERICAS: 'andes', ASIA: 'india-north' },
    MERCHANT: { EUROPE: 'portugal', AMERICAS: 'mexico', ASIA: 'malaya' },
    REFORMED: { EUROPE: 'germany', AMERICAS: 'usa-east', ASIA: 'china-east' },
    ANCESTRAL: { EUROPE: 'scandinavia', AMERICAS: 'brazil', ASIA: 'japan' },
  };
  const continent = provinces.find((p) => p.kind === 'LAND')?.continent ?? 'EUROPE';
  const localId = local[religion][continent];
  if (provinces.some((p) => p.id === localId)) return localId;
  const aliases: Record<ReligionId, string> = {
    SOLAR: 'Roma',
    MERCHANT: 'Lisboa',
    REFORMED: 'Renânia',
    ANCESTRAL: 'Trácia',
  };
  return (
    provinces.find((p) => p.name === aliases[religion])?.id ??
    provinces.filter((p) => p.kind === 'LAND')[
      Object.keys(RELIGIONS).indexOf(religion) % provinces.filter((p) => p.kind === 'LAND').length
    ].id
  );
};
export const getRelation = (g: Pick<GameState, 'relations'>, a: string, b: string) =>
  g.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
export const atWar = (g: Pick<GameState, 'wars'>, a: string, b: string) =>
  g.wars.some(
    (w) =>
      w.active &&
      ((w.attackerIds.includes(a) && w.defenderIds.includes(b)) ||
        (w.attackerIds.includes(b) && w.defenderIds.includes(a))),
  );
export const sameWarSide = (g: Pick<GameState, 'wars'>, a: string, b: string) =>
  g.wars.some(
    (w) =>
      w.active && [w.attackerIds, w.defenderIds].some((ids) => ids.includes(a) && ids.includes(b)),
  );
export const landProvinces = (g: Pick<GameState, 'provinces'>) =>
  g.provinces.filter((p) => p.kind === 'LAND');
export const livingPlayers = (g: Pick<GameState, 'players' | 'provinces'>) =>
  g.players.filter((p) => g.provinces.some((q) => q.ownerId === p.id));
export const canTransit = (
  g: Pick<GameState, 'wars' | 'relations' | 'players'>,
  id: string,
  p: Province,
) => {
  const owner = controller(p);
  if (p.kind === 'SEA_ZONE' || !owner || owner === id) return true;
  return (
    atWar(g, id, owner) ||
    sameWarSide(g, id, owner) ||
    !!getRelation(g, id, owner)?.militaryAccess.includes(id) ||
    g.players.find((p) => p.id === owner)?.subjectOfId === id
  );
};
export function shortestPath(
  provinces: Province[],
  from: string,
  to: string,
  canVisit: (p: Province) => boolean = () => true,
): string[] | null {
  if (from === to) return [];
  const seen = new Set([from]),
    queue: [string, string[]][] = [[from, []]],
    lookup = new Map(provinces.map((p) => [p.id, p]));
  for (let i = 0; i < queue.length; i++) {
    const [id, path] = queue[i];
    for (const next of lookup.get(id)?.neighbors ?? []) {
      const p = lookup.get(next);
      if (!p || seen.has(next) || !canVisit(p)) continue;
      const route = [...path, next];
      if (next === to) return route;
      seen.add(next);
      queue.push([next, route]);
    }
  }
  return null;
}
export function canUnitVisit(
  g: Pick<GameState, 'wars' | 'relations' | 'players'>,
  army: Battalion,
  p: Province,
) {
  return army.isFleet
    ? p.kind === 'SEA_ZONE' ||
        (p.isCoastal &&
          p.portLevel > 0 &&
          (controller(p) === army.ownerId ||
            !!(
              controller(p) &&
              getRelation(g, army.ownerId, controller(p)!)?.militaryAccess.includes(army.ownerId)
            ) ||
            !!(controller(p) && sameWarSide(g, army.ownerId, controller(p)!))))
    : p.kind === 'LAND' && canTransit(g, army.ownerId, p);
}
export function unitPath(
  g: Pick<GameState, 'provinces' | 'wars' | 'relations' | 'players'>,
  army: Battalion,
  target: string,
) {
  return shortestPath(g.provinces, army.provinceId, target, (p) => canUnitVisit(g, army, p));
}
export const supplyLimit = (p: Province) =>
  p.baseSupplyLimit + p.fortLevel * 3 + (p.pacification >= 80 ? 2 : 0);
export const attritionLoss = (troops: number, limit: number) =>
  troops > limit ? Math.max(1, Math.ceil((troops - limit) * 0.15)) : 0;
export function armyUpkeep(troops: number, mercenaries: number, limit: number, base = 0.35) {
  const excess = Math.max(0, troops - limit);
  return troops === 0
    ? 0
    : base * (Math.min(troops, limit) + excess ** 1.25) * (1 + (1.2 * mercenaries) / troops);
}
export const isBlockaded = (g: Pick<GameState, 'battalions' | 'provinces' | 'wars'>, p: Province) =>
  p.isCoastal &&
  !!controller(p) &&
  g.battalions.some(
    (a) =>
      a.isFleet &&
      a.warships > 0 &&
      p.neighbors.includes(a.provinceId) &&
      g.provinces.find((s) => s.id === a.provinceId)?.kind === 'SEA_ZONE' &&
      atWar(g, a.ownerId, controller(p)!),
  );
export function effectiveTax(
  p: Province,
  stateReligion: ReligionId,
  blockaded = false,
  policy: 'INQUISITION' | 'TOLERANCE' = 'INQUISITION',
) {
  return p.kind === 'SEA_ZONE'
    ? 0
    : ((p.baseTax * p.pacification) / 100) *
        (p.religion === stateReligion ? 1.15 : 0.85) *
        (1 - p.unrest / 200) *
        (1 + 0.25 * p.marketLevel) *
        (blockaded ? 0.5 : 1) *
        (policy === 'TOLERANCE' ? 0.9 : 1);
}
export const tradeIncomeOf = (p: Province) =>
  ((p.resource === 'trade' ? 2 : 0) + p.portLevel * 1.5) * (1 + 0.25 * p.marketLevel);
export function realmEconomy(
  g: Pick<
    GameState,
    'provinces' | 'players' | 'relations' | 'wars' | 'battalions' | 'baseUpkeep' | 'diet'
  >,
  id: string,
) {
  const actor = g.players.find((p) => p.id === id)!;
  const owned = g.provinces.filter((p) => controller(p) === id && p.kind === 'LAND');
  const nat = nationOf(actor.nationId);
  const modifier = (p: Province) =>
    actor.faith === 'MERCHANT' && (p.portLevel > 0 || p.marketLevel > 0) ? 1.25 : 1;
  const taxes = owned.reduce(
    (n, p) =>
      n + effectiveTax(p, actor.faith, isBlockaded(g, p), actor.religiousPolicy) * modifier(p),
    0,
  );
  let embargo = 1;
  for (const r of g.relations.filter((r) => r.a === id || r.b === id))
    for (const issuer of r.embargoes) embargo *= issuer === id ? 0.95 : 0.85;
  const trade =
    owned.reduce((n, p) => n + tradeIncomeOf(p) * modifier(p), 0) *
    embargo *
    (nat.modifiers.trade ?? 1);
  const tithes = Object.entries(RELIGIONS).reduce((n, [faith]) => {
    const r = faith as ReligionId;
    const city = g.provinces.find((p) => p.id === holyCityId(r, g.provinces));
    return (
      n +
      (city && controller(city) === id
        ? 1.5 * g.provinces.filter((p) => p.kind === 'LAND' && p.religion === r).length
        : 0)
    );
  }, 0);
  const grossIncome = taxes + trade + tithes,
    income = grossIncome * (1 - actor.warExhaustion * 0.004);
  let upkeep = 0;
  for (const p of g.provinces) {
    const units = g.battalions.filter((a) => a.provinceId === p.id && !a.embarkedOnId);
    const total = units.reduce((n, a) => n + unitCount(a), 0);
    if (!total) continue;
    for (const a of units.filter((a) => a.ownerId === id)) {
      let count = unitCount(a);
      if (a.embarkedArmyId)
        count += unitCount(g.battalions.find((b) => b.id === a.embarkedArmyId) ?? {});
      const imperial = g.wars.some(
        (w) => w.active && w.imperialBanAgainstId && w.defenderIds.includes(id),
      );
      upkeep +=
        ((armyUpkeep(total, 0, supplyLimit(p), g.baseUpkeep) * count) / total) *
        (a.isMercenary ? 2.2 : 1) *
        (imperial ? 0.75 : 1);
    }
  }
  return {
    owned,
    taxes: roundMoney(taxes),
    trade: roundMoney(trade),
    tithes: roundMoney(tithes),
    grossIncome: roundMoney(grossIncome),
    income: roundMoney(income),
    upkeep: roundMoney(upkeep),
    net: roundMoney(income - upkeep),
    manpower: Math.ceil(
      owned.reduce((n, p) => n + (p.resource === 'grain' ? 2 : 1), 0) *
        (nat.modifiers.manpower ?? 1),
    ),
  };
}
export function orderKey(o: PlayerOrder) {
  return o.type === 'DIPLOMACY'
    ? `diplomacy:${o.action}:${o.targetRealmId}`
    : 'battalionId' in o && o.type !== 'RECRUIT_BATTALION'
      ? `army:${o.battalionId}`
      : `city:${o.type === 'CONVERT' ? o.targetProvinceId : 'provinceId' in o ? o.provinceId : ''}`;
}
export function orderProvinceId(o: PlayerOrder, g?: Pick<GameState, 'battalions'>) {
  return o.type === 'CONVERT'
    ? o.targetProvinceId
    : 'provinceId' in o
      ? o.provinceId
      : 'battalionId' in o
        ? g?.battalions.find((a) => a.id === o.battalionId)?.provinceId
        : null;
}
export function orderCost(o: PlayerOrder, p?: Province, actor?: Player) {
  let gold = 0,
    manpower = 0,
    influence = 0;
  if (o.type === 'RECRUIT_BATTALION') {
    gold =
      (o.infantry ?? 0) * 3 +
      (o.cavalry ?? 0) * 6 +
      (o.artillery ?? 0) * 8 +
      (o.warships ?? 0) * 9 +
      (o.transports ?? 0) * 6;
    gold *= o.isFleet
      ? actor
        ? (nationOf(actor.nationId).modifiers.fleetCost ?? 1)
        : 1
      : actor
        ? (nationOf(actor.nationId).modifiers.recruitCost ?? 1)
        : 1;
    if (o.isMercenary) gold *= 2 * (actor?.faith === 'MERCHANT' ? 0.75 : 1);
    else manpower = landCount(o);
  } else if (o.type === 'BUILD_FORT')
    gold = (18 + (p?.fortLevel ?? 0) * 10) * (actor?.faith === 'REFORMED' ? 0.75 : 1);
  else if (o.type === 'BUILD_PORT') gold = 20 + (p?.portLevel ?? 0) * 10;
  else if (o.type === 'BUILD_MARKET') gold = 16 + (p?.marketLevel ?? 0) * 8;
  else if (o.type === 'PACIFY') gold = 8;
  else if (o.type === 'CONVERT') {
    gold = 8;
    influence = 2;
  } else if (o.type === 'TRAIN_BATTALION') gold = 6;
  else if (o.type === 'DIPLOMACY' && ['SEND_SUBSIDY', 'FUND_REBELS'].includes(o.action))
    gold = o.amount ?? 0;
  return { gold: roundMoney(gold), manpower, influence };
}
export function reservedResources(
  g: Pick<GameState, 'orders' | 'provinces' | 'players' | 'battalions'>,
  id: string,
  exceptKey?: string,
) {
  return (g.orders[id] ?? [])
    .filter((o) => orderKey(o) !== exceptKey)
    .reduce(
      (sum, o) => {
        const c = orderCost(
          o,
          g.provinces.find((p) => p.id === orderProvinceId(o, g)),
          g.players.find((p) => p.id === id),
        );
        return {
          gold: roundMoney(sum.gold + c.gold),
          manpower: sum.manpower + c.manpower,
          influence: sum.influence + c.influence,
        };
      },
      { gold: 0, manpower: 0, influence: 0 },
    );
}
export function victoryStatus(g: Pick<GameState, 'players' | 'provinces' | 'wars' | 'diet'>) {
  const living = livingPlayers(g),
    land = landProvinces(g),
    total = land.length;
  for (const p of living) {
    const own = land.filter((q) => controller(q) === p.id).length;
    const rivals = living.filter((q) => q.id !== p.id);
    if (
      rivals.length === 0 ||
      rivals.every((r) => r.subjectOfId === p.id) ||
      (own / total >= 0.75 &&
        rivals.every((r) => land.filter((q) => controller(q) === r.id).length / total <= 0.15))
    )
      return { winnerId: p.id, objective: 'DOMINATION' as const };
  }
  const members = g.diet.memberRealmIds.filter((id) => living.some((p) => p.id === id));
  if (
    g.diet.emperorId &&
    living.some((p) => p.id === g.diet.emperorId) &&
    members.includes(g.diet.emperorId) &&
    members.length / Math.max(1, living.length) >= 0.6 &&
    g.diet.peaceTurnsCounter >= 5 &&
    !g.wars.some((w) => w.active)
  )
    return { winnerId: g.diet.emperorId, objective: 'IMPERIAL_PACIFICATION' as const };
  return null;
}
export const dietSnapshot = (diet: ImperialDiet, turn: number) => ({
  turn,
  emperorId: diet.emperorId,
  imperialAuthority: diet.imperialAuthority,
  memberRealmIds: [...diet.memberRealmIds],
  peaceTurnsCounter: diet.peaceTurnsCounter,
  retaliationEdictActive: diet.retaliationEdictActive,
  votes: { ...diet.votes },
});
export function telemetry(view: GameView) {
  const { history, ...finalState } = structuredClone(view);
  return {
    schemaVersion: 3 as const,
    matchConfig: view.matchConfig,
    nations: view.players,
    turnByTurnHistory: history,
    wars: view.wars,
    battles: history.flatMap((h) => h.battles),
    dietHistory: history.map((h) => h.diet),
    economyMetrics: history.flatMap((h) => h.economy),
    finalState,
  };
}
export function chronicle(view: GameView) {
  const report = telemetry(view);
  return [
    'CONCÓRDIA · CRÔNICA DA CAMPANHA',
    `Sala ${view.code} · ${view.mode} · ${view.theater}`,
    `Resultado: ${view.winnerId ? view.players.find((p) => p.id === view.winnerId)?.nation : 'Sem vencedor'} · ${view.winnerObjective ?? view.finishReason ?? 'em andamento'}`,
    ...report.turnByTurnHistory.flatMap((h) => [
      `\nRODADA ${h.turn}`,
      `Movimentos: ${h.movements.length} | Batalhas: ${h.battles.length} | Recuos: ${h.retreats.length}`,
      ...h.events,
      ...h.diplomaticChanges.map((d) => d.text),
      ...h.battles.map(
        (b) =>
          `${view.provinces.find((p) => p.id === b.provinceId)?.name}: ataque ${b.attackPower.toFixed(2)} × defesa ${b.defensePower.toFixed(2)}; baixas ${b.attackerCasualties}/${b.defenderCasualties}`,
      ),
      `Dieta: Imperador ${h.diet.emperorId ?? 'vago'}, autoridade ${h.diet.imperialAuthority}, paz ${h.diet.peaceTurnsCounter}/5`,
    ]),
    '\nESTATÍSTICAS FINAIS',
    'Nação | Ouro | Reservas | Prestígio | Desgaste | Terras | Tropas',
    ...view.players.map(
      (p) =>
        `${p.nation} | ${p.gold.toFixed(2)} | ${p.manpower} | ${p.prestige} | ${p.warExhaustion} | ${view.provinces.filter((q) => q.ownerId === p.id).length} | ${view.battalions.filter((a) => a.ownerId === p.id).reduce((n, a) => n + unitCount(a), 0)}`,
    ),
  ].join('\n');
}
export const EMBLEMS: Record<string, string> = {
  anchor:
    'M12 3v16M8 6h8M5 12c0 9 14 9 14 0M2 14l3-3 3 3M16 14l3-3 3 3M10 3a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  castle: 'M4 21V8h4V4h3v4h2V4h3v4h4v13H4M9 21v-6h6v6M4 11h16',
  lily: 'M12 21V6M12 6C5-3 3 7 9 12M12 6c7-9 9 1 3 6M4 11c-4 5 4 8 8 2M20 11c4 5-4 8-8 2M8 18h8',
  eagle: 'M12 4l-2 4 2 3 2-3-2-4M10 10L3 4v7l6 4-5 5 6-2 2 4 2-4 6 2-5-5 6-4V4l-7 6',
  crescent:
    'M18 3a9 9 0 1 0 3 15A8 8 0 0 1 18 3M17 7l1 2 3 .5-2 1.5.5 3-2.5-1.5-2.5 1.5.5-3-2-1.5 3-.5Z',
  dragon: 'M4 18l4-2-3-4 5 1-1-4 5 2 2-5 4 1-2 4 3 4-5-1 1 5-5-2-2 4M4 18l-2 3M16 3l2-2',
  sun: 'M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M20 4l-3 3M7 17l-3 3',
  mountain: 'M2 20L9 5l4 8 3-6 6 13H2M6 12l3 3 2-3M13 13l3 3 2-3',
};
export function peaceTermCost(provinces: Province[], terms: import('./types').PeaceTerm[]) {
  return terms.reduce(
    (sum, t) =>
      sum +
      (t.type === 'CEDE_PROVINCES'
        ? t.provinceIds.reduce(
            (n, id) => n + 12 + (provinces.find((p) => p.id === id)?.baseTax ?? 0),
            0,
          )
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
export const CASUS_LABELS: Record<import('./types').CasusBelli, string> = {
  CONQUEST: 'Conquista',
  IMPERIAL_BAN: 'Banimento Imperial',
  HOLY_WAR: 'Guerra Santa',
  HUMILIATION: 'Humilhação',
};
export const RETREAT_LABELS = {
  battle: 'retirada de batalha',
  repatriation: 'repatriação',
  regrouping: 'reagrupamento',
};
export function peaceDescription(term: import('./types').PeaceTerm, provinces: Province[]) {
  switch (term.type) {
    case 'CEDE_PROVINCES':
      return `Ceder definitivamente: ${term.provinceIds.map((id) => provinces.find((p) => p.id === id)?.name ?? id).join(', ')}`;
    case 'WAR_REPARATIONS':
      return `Pagar ${term.immediateTribute} ouro imediato e 25% da renda bruta por cinco rodadas`;
    case 'HUMILIATE_DISARM':
      return 'Humilhação: vencedor +20 prestígio e +15% moral; derrotado limitado a oito tropas por quatro rodadas';
    case 'FORCE_EMPIRE_OR_RELIGION':
      return term.choice === 'EMPIRE'
        ? 'Ingressar na Dieta Imperial'
        : 'Adotar a religião estatal do proponente';
    case 'SUBJUGATE':
      return 'Tornar-se súdito do proponente';
  }
}
