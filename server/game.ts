import { randomUUID } from 'node:crypto';
import { makeMap } from '../shared/map';
import { ACTIONS, FACTIONS, economyOf, orderCost } from '../shared/types';
import type {
  GameMode,
  GameState,
  GameView,
  Objective,
  Order,
  Player,
  Province,
} from '../shared/types';

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const log = (g: GameState, text: string, kind: GameState['log'][number]['kind'] = 'system') => {
  g.log.push({ id: (g.log.at(-1)?.id ?? 0) + 1, turn: g.turn, text, kind });
  g.log = g.log.slice(-80);
};
export function createGame(code: string, mode: GameMode = 'quick', demo = false): GameState {
  return {
    code,
    hostId: '',
    phase: 'lobby',
    turn: 0,
    maxTurns: mode === 'quick' ? 20 : 40,
    targetScore: mode === 'quick' ? 16 : 28,
    seed: Math.floor(Math.random() * 1e6),
    players: [],
    provinces: makeMap(),
    relations: [],
    offers: [],
    orders: {},
    log: [],
    chat: [],
    winnerId: null,
    mode,
    turnSeconds: mode === 'quick' ? 180 : 360,
    deadline: null,
    demo,
  };
}
export function addPlayer(
  g: GameState,
  name: string,
  bot = false,
  objective: Objective = 'conquest',
) {
  assert(g.phase === 'lobby', 'A partida já começou.');
  assert(g.players.length < 8, 'A sala já tem 8 jogadores.');
  const faction = FACTIONS[g.players.length];
  const p: Player = {
    id: randomUUID(),
    name: name.trim().slice(0, 24) || 'Estrategista',
    ...faction,
    bot,
    online: true,
    gold: 40,
    manpower: 10,
    influence: 6,
    ready: bot,
    objective,
    doctrine: 'tolerant',
    peaceTurns: 0,
    wonBattles: 0,
    conversions: 0,
    score: 0,
    warExhaustion: 0,
  };
  g.players.push(p);
  g.orders[p.id] = [];
  if (!g.hostId) g.hostId = p.id;
  for (const other of g.players)
    if (other.id !== p.id)
      g.relations.push({ a: other.id, b: p.id, allied: false, truceUntil: 0, trust: 10 });
  return p;
}
export function setMode(g: GameState, mode: GameMode) {
  assert(g.phase === 'lobby', 'O modo só pode mudar antes da partida.');
  assert(mode === 'quick' || mode === 'campaign', 'Modo inválido.');
  g.mode = mode;
  g.maxTurns = mode === 'quick' ? 20 : 40;
  g.targetScore = mode === 'quick' ? 16 : 28;
  g.turnSeconds = mode === 'quick' ? 180 : 360;
}
export function startGame(g: GameState) {
  assert(g.phase === 'lobby', 'A partida já começou.');
  assert(
    g.players.length >= 3 && g.players.length <= 8,
    'São necessários de 3 a 8 jogadores (pessoas ou bots).',
  );
  const homes = [
    [16, 24],
    [17, 25],
    [11, 19],
    [2, 3],
    [12, 13],
    [21, 20],
    [31, 30],
    [15, 23],
  ];
  g.players.forEach((p, i) =>
    homes[i].forEach((index, j) => {
      Object.assign(g.provinces[index], {
        ownerId: p.id,
        troops: j === 0 ? 6 : 4,
        morale: 75,
        training: 50,
        unrest: 5,
        capital: j === 0,
        faith: p.faith,
      });
    }),
  );
  g.phase = 'planning';
  g.turn = 1;
  g.deadline = g.demo ? null : Date.now() + g.turnSeconds * 1000;
  refreshScores(g);
  log(g, 'A campanha começa. Prepare suas ordens; elas serão resolvidas em conjunto.');
}
export function relation(g: GameState, a: string, b: string) {
  return g.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}
export function activeAlliances(g: GameState, id: string) {
  return g.relations.filter((r) => r.allied && (r.a === id || r.b === id));
}
export function canAttack(g: GameState, a: string, b: string | null) {
  if (!b || a === b) return true;
  const r = relation(g, a, b);
  return !r?.allied && (r?.truceUntil ?? 0) < g.turn;
}
export function submitOrder(g: GameState, playerId: string, raw: Order) {
  assert(g.phase === 'planning', 'Não é a fase de ordens.');
  const player = g.players.find((p) => p.id === playerId)!;
  assert(player && !player.ready, 'Reabra suas ordens antes de alterá-las.');
  assert(raw && Object.hasOwn(ACTIONS, raw.action), 'Ação inválida.');
  const p = g.provinces.find((p) => p.id === raw.provinceId);
  assert(p && p.ownerId === playerId, 'Você só pode dar ordens nas suas províncias.');
  const order: Order = { provinceId: p.id, action: raw.action };
  if (order.action === 'move') {
    const target = g.provinces.find((t) => t.id === raw.targetId);
    assert(
      target && p.neighbors.includes(target.id),
      'A marcha precisa ter destino em uma província vizinha.',
    );
    assert(canAttack(g, playerId, target.ownerId), 'Uma aliança ou trégua impede esse ataque.');
    assert(
      Number.isInteger(raw.amount) && raw.amount! > 0 && raw.amount! < p.troops,
      'Deixe pelo menos 1 tropa na origem.',
    );
    order.targetId = target.id;
    order.amount = raw.amount;
  }
  if (order.action === 'train')
    assert(p.troops > 0 && p.training < 100, 'As tropas já atingiram o treinamento máximo.');
  if (order.action === 'develop') assert(p.development < 3, 'Desenvolvimento máximo atingido.');
  if (order.action === 'pacify') assert(p.unrest > 0, 'A província já está pacificada.');
  if (order.action === 'convert')
    assert(p.faith !== player.faith, 'Essa província já segue sua crença.');
  const orders = [...g.orders[playerId].filter((o) => o.provinceId !== p.id), order];
  const total = orders.reduce(
    (n, o) => {
      const c = orderCost(
        o,
        g.provinces.find((p) => p.id === o.provinceId)!,
      );
      return {
        gold: n.gold + c.gold,
        manpower: n.manpower + c.manpower,
        influence: n.influence + c.influence,
      };
    },
    { gold: 0, manpower: 0, influence: 0 },
  );
  assert(total.gold <= player.gold, 'Ouro insuficiente para as ordens planejadas.');
  assert(total.manpower <= player.manpower, 'Reservas de recrutamento insuficientes.');
  assert(total.influence <= player.influence, 'Influência insuficiente.');
  g.orders[playerId] = orders;
}
export function cancelOrder(g: GameState, id: string, provinceId: string) {
  assert(
    g.phase === 'planning' && !g.players.find((p) => p.id === id)?.ready,
    'Reabra suas ordens antes de alterá-las.',
  );
  g.orders[id] = g.orders[id].filter((o) => o.provinceId !== provinceId);
}
export function proposeAlliance(g: GameState, from: string, to: string) {
  assert(g.phase === 'planning', 'A diplomacia está disponível durante a campanha.');
  assert(from !== to && g.players.some((p) => p.id === to), 'Escolha outro reino.');
  assert(
    g.provinces.some((p) => p.ownerId === from) && g.provinces.some((p) => p.ownerId === to),
    'Reinos sem território não podem formar novas alianças.',
  );
  assert(!g.players.find((p) => p.id === from)!.ready, 'Reabra suas ordens para negociar.');
  assert(!relation(g, from, to)?.allied, 'Vocês já são aliados.');
  assert(
    activeAlliances(g, from).length < 2 && activeAlliances(g, to).length < 2,
    'Cada reino pode ter até 2 alianças.',
  );
  assert(
    !g.offers.some((o) => (o.from === from && o.to === to) || (o.from === to && o.to === from)),
    'Já existe uma proposta entre esses reinos.',
  );
  g.offers.push({ id: randomUUID(), from, to, kind: 'alliance' });
  if (g.players.find((p) => p.id === to)!.bot)
    answerAlliance(g, to, g.offers.at(-1)!.id, (relation(g, from, to)?.trust ?? 0) >= 0);
  else
    log(
      g,
      `${g.players.find((p) => p.id === from)!.nation} enviou uma proposta de aliança.`,
      'diplomacy',
    );
}
export function answerAlliance(g: GameState, playerId: string, offerId: string, accept: boolean) {
  assert(g.phase === 'planning', 'A campanha terminou.');
  const offer = g.offers.find((o) => o.id === offerId && o.to === playerId);
  assert(offer, 'Proposta não encontrada.');
  if (accept) {
    assert(
      activeAlliances(g, offer.from).length < 2 && activeAlliances(g, offer.to).length < 2,
      'Limite de 2 alianças por reino.',
    );
    const r = relation(g, offer.from, offer.to)!;
    r.allied = true;
    r.trust = clamp(r.trust + 20, -100, 100);
    // Cancel attacks that would contradict the new pact, including sealed orders.
    for (const id of [offer.from, offer.to])
      g.orders[id] = g.orders[id].filter(
        (o) =>
          o.action !== 'move' ||
          g.provinces.find((p) => p.id === o.targetId)?.ownerId !==
            (id === offer.from ? offer.to : offer.from),
      );
    log(
      g,
      `${g.players.find((p) => p.id === offer.from)!.nation} e ${g.players.find((p) => p.id === offer.to)!.nation} firmaram uma aliança.`,
      'diplomacy',
    );
  } else log(g, 'Uma proposta de aliança foi recusada.', 'diplomacy');
  g.offers = g.offers.filter((o) => o.id !== offerId);
}
export function breakAlliance(g: GameState, from: string, to: string) {
  assert(
    g.phase === 'planning' && !g.players.find((p) => p.id === from)!.ready,
    'Reabra suas ordens para negociar.',
  );
  const r = relation(g, from, to);
  assert(r?.allied, 'Não existe aliança entre esses reinos.');
  r.allied = false;
  r.truceUntil = g.turn + 1;
  r.trust = clamp(r.trust - 50, -100, 100);
  const actor = g.players.find((p) => p.id === from)!;
  actor.influence = Math.max(0, actor.influence - 4);
  actor.peaceTurns = 0;
  for (const p of g.provinces.filter((p) => p.ownerId === from)) p.morale = clamp(p.morale - 10);
  // Diplomacy must not spend influence already reserved by province orders.
  let reserved = g.orders[from].reduce((n, o) => n + ACTIONS[o.action].influence, 0);
  while (reserved > actor.influence) {
    const index = g.orders[from].findLastIndex((o) => ACTIONS[o.action].influence > 0);
    const [removed] = g.orders[from].splice(index, 1);
    reserved -= ACTIONS[removed.action].influence;
  }
  log(
    g,
    `${actor.nation} rompeu uma aliança: −4 de influência, −10 de moral e trégua até o fim da rodada ${r.truceUntil}.`,
    'diplomacy',
  );
}
export function refreshScores(g: GameState) {
  for (const p of g.players) {
    const own = g.provinces.filter((t) => t.ownerId === p.id),
      stable = own.filter((t) => t.unrest <= 25);
    p.score =
      p.objective === 'conquest'
        ? own.length + Math.floor(p.wonBattles / 2)
        : p.objective === 'prosperity'
          ? own.reduce((n, t) => n + t.development * 2, 0) +
            Math.floor(p.gold / 30) +
            stable.filter((t) => t.resource === 'trade').length
          : p.objective === 'concord'
            ? stable.length +
              Math.min(6, p.peaceTurns) +
              activeAlliances(g, p.id).filter((r) =>
                g.provinces.some((t) => t.ownerId === (r.a === p.id ? r.b : r.a)),
              ).length *
                2
            : stable.filter((t) => t.faith === p.faith).length * 2 + Math.floor(p.conversions / 2);
  }
}
function merge(p: Province, n: number, morale: number, training: number) {
  const sum = p.troops + n;
  p.morale = Math.round((p.morale * p.troops + morale * n) / sum);
  p.training = Math.round((p.training * p.troops + training * n) / sum);
  p.troops = sum;
}
function random(g: GameState, salt: string) {
  let h = g.seed + g.turn * 7919;
  for (const char of salt) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
export function resolveTurn(g: GameState) {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  for (const bot of g.players.filter((p) => p.bot)) planBot(g, bot);
  const marched = new Set<string>(),
    fought = new Set<string>();
  const movements: {
    from: string;
    to: string;
    owner: string;
    troops: number;
    morale: number;
    training: number;
  }[] = [];
  // All local actions and departures happen before any arrival. No province acts twice.
  for (const player of g.players)
    for (const o of g.orders[player.id]) {
      const p = g.provinces.find((p) => p.id === o.provinceId)!;
      if (p.ownerId !== player.id) continue;
      const c = orderCost(o, p);
      player.gold -= c.gold;
      player.manpower -= c.manpower;
      player.influence -= c.influence;
      if (o.action === 'move') {
        const target = g.provinces.find((p) => p.id === o.targetId)!;
        if (!canAttack(g, player.id, target.ownerId)) continue;
        const count = Math.min(o.amount!, p.troops - 1);
        if (count > 0) {
          p.troops -= count;
          movements.push({
            from: p.id,
            to: target.id,
            owner: player.id,
            troops: count,
            morale: clamp(p.morale - 6),
            training: p.training,
          });
          marched.add(p.id);
        }
      }
      if (o.action === 'recruit') merge(p, 3, 60, 25);
      if (o.action === 'train') {
        p.training = clamp(p.training + 18);
        p.morale = clamp(p.morale + 8);
      }
      if (o.action === 'develop') p.development++;
      if (o.action === 'pacify') p.unrest = clamp(p.unrest - 25);
      if (o.action === 'convert') {
        p.conversion += 50;
        p.unrest = clamp(p.unrest + 6);
        if (p.conversion >= 100) {
          p.faith = player.faith;
          p.conversion = 0;
          player.conversions++;
          log(g, `Uma missão de ${player.nation} concluiu a conversão de ${p.name}.`);
        }
      }
    }
  // Seeded initiative changes each round and never depends on message arrival order.
  movements.sort((a, b) => random(g, a.from + a.owner) - random(g, b.from + b.owner));
  for (const army of movements) {
    const target = g.provinces.find((p) => p.id === army.to)!,
      origin = g.provinces.find((p) => p.id === army.from)!;
    const attacker = g.players.find((p) => p.id === army.owner)!;
    if (target.ownerId === army.owner) {
      merge(target, army.troops, army.morale, army.training);
      continue;
    }
    if (!canAttack(g, army.owner, target.ownerId)) {
      if (origin.ownerId === army.owner) merge(origin, army.troops, army.morale, army.training);
      else
        log(
          g,
          `Um exército de ${attacker.nation} se dispersou após perder acesso ao destino e à origem.`,
          'battle',
        );
      continue;
    }
    fought.add(attacker.id);
    if (target.ownerId) fought.add(target.ownerId);
    const defender = g.players.find((p) => p.id === target.ownerId),
      defendingTroops = target.troops;
    const power =
      army.troops *
      (0.65 + army.morale * 0.006) *
      (0.8 + army.training * 0.005) *
      (0.93 + random(g, army.from + army.to) * 0.14);
    const defense =
      target.troops * (0.65 + target.morale * 0.006) * (0.8 + target.training * 0.005) * 1.12;
    if (power > defense) {
      const loss = Math.min(
        army.troops - 1,
        Math.max(1, Math.round(army.troops * (defense / power) * 0.55)),
      );
      const oldOwner = target.ownerId;
      target.ownerId = attacker.id;
      target.troops = army.troops - loss;
      target.morale = clamp(army.morale - 8);
      target.training = army.training;
      target.unrest = clamp(target.unrest + 35);
      target.conversion = 0;
      attacker.wonBattles++;
      if (oldOwner)
        relation(g, attacker.id, oldOwner)!.trust = clamp(
          relation(g, attacker.id, oldOwner)!.trust - 20,
          -100,
          100,
        );
      log(
        g,
        `${attacker.nation} tomou ${target.name} de ${defender?.nation ?? 'forças locais'}: ${army.troops} atacantes × ${defendingTroops} defensores; ${loss} baixas no ataque, ${target.troops} sobreviventes.`,
        'battle',
      );
    } else {
      const loss = Math.min(
        target.troops - 1,
        Math.max(0, Math.round(target.troops * (power / Math.max(1, defense)) * 0.4)),
      );
      target.troops = Math.max(1, target.troops - loss);
      target.morale = clamp(target.morale - 5);
      if (defender) defender.wonBattles++;
      const survivors = Math.floor(army.troops * 0.35);
      if (survivors && origin.ownerId === attacker.id)
        merge(origin, survivors, clamp(army.morale - 18), army.training);
      log(
        g,
        `${attacker.nation} foi repelido em ${target.name}. ${army.troops - survivors} baixas no ataque; ${loss} na defesa.${survivors ? ' Sobreviventes recuam se a origem continuar sob seu controle.' : ''}`,
        'battle',
      );
    }
  }
  for (const player of g.players) {
    const eco = economyOf(g.provinces, player.id);
    const before = player.gold;
    player.gold = Math.max(0, player.gold + eco.net);
    player.manpower = Math.min(60, player.manpower + eco.manpower);
    player.influence = Math.min(
      30,
      player.influence +
        1 +
        eco.owned.filter((p) => p.resource === 'shrine').length +
        (player.doctrine === 'devout'
          ? eco.owned.filter((p) => p.faith === player.faith).length
          : 0),
    );
    player.peaceTurns = fought.has(player.id) ? 0 : player.peaceTurns + 1;
    player.warExhaustion =
      g.mode === 'campaign' ? clamp(player.warExhaustion + (fought.has(player.id) ? 10 : -6)) : 0;
    for (const p of eco.owned) {
      const cultural = p.faith !== player.faith && player.doctrine === 'devout' ? 6 : -4;
      p.unrest = clamp(
        p.unrest + cultural + (g.mode === 'campaign' ? Math.floor(player.warExhaustion / 20) : 0),
      );
      if (before + eco.net < 0) p.morale = clamp(p.morale - 12);
      else if (!marched.has(p.id)) p.morale = clamp(p.morale + 4);
      const capacity = 6 + p.development * 3 + (p.resource === 'grain' ? 3 : 0);
      if (g.mode === 'campaign' && p.troops > capacity)
        p.morale = clamp(p.morale - (p.troops - capacity) * 3);
      if (p.unrest >= 85) {
        p.ownerId = null;
        p.troops = Math.max(2, Math.floor(p.troops / 2));
        p.morale = 55;
        p.unrest = 40;
        log(g, `${p.name} se rebelou e passou ao controle de forças locais.`, 'economy');
      }
    }
  }
  refreshScores(g);
  const active = g.players.filter((p) => g.provinces.some((t) => t.ownerId === p.id));
  const ranked = [...active].sort(
    (a, b) =>
      b.score - a.score ||
      g.provinces.filter((p) => p.ownerId === b.id).length -
        g.provinces.filter((p) => p.ownerId === a.id).length ||
      b.gold - a.gold ||
      a.id.localeCompare(b.id),
  );
  if (ranked.length <= 1 || ranked[0]?.score >= g.targetScore || g.turn >= g.maxTurns) {
    g.phase = 'finished';
    g.winnerId = ranked[0]?.id ?? null;
    g.deadline = null;
    log(
      g,
      ranked[0]
        ? `${ranked[0].nation} venceu a campanha com ${ranked[0].score} pontos de legado.`
        : 'A campanha terminou sem um reino vencedor.',
    );
  } else {
    g.turn++;
    g.deadline = g.demo ? null : Date.now() + g.turnSeconds * 1000;
    log(g, `Rodada ${g.turn}: rendimentos recebidos. Novas ordens podem ser preparadas.`);
  }
  for (const p of g.players) {
    g.orders[p.id] = [];
    p.ready = p.bot || !g.provinces.some((t) => t.ownerId === p.id);
  }
}
export function planBot(g: GameState, p: Player) {
  g.orders[p.id] = [];
  p.ready = false;
  const owned = g.provinces.filter((t) => t.ownerId === p.id);
  for (const province of [...owned].sort((a, b) => b.troops - a.troops)) {
    const enemy = province.neighbors
      .map((id) => g.provinces.find((t) => t.id === id)!)
      .filter((t) => t.ownerId !== p.id && canAttack(g, p.id, t.ownerId))
      .sort((a, b) => a.troops - b.troops)[0];
    const candidates: Order[] = [];
    if (province.unrest > 35) candidates.push({ provinceId: province.id, action: 'pacify' });
    if (enemy && province.troops > enemy.troops * 1.6 + 1)
      candidates.push({
        provinceId: province.id,
        action: 'move',
        targetId: enemy.id,
        amount: province.troops - 1,
      });
    if (p.objective === 'faith' && province.faith !== p.faith)
      candidates.push({ provinceId: province.id, action: 'convert' });
    if (p.objective === 'prosperity' && province.development < 3)
      candidates.push({ provinceId: province.id, action: 'develop' });
    if (province.troops < 9) candidates.push({ provinceId: province.id, action: 'recruit' });
    if (province.training < 85) candidates.push({ provinceId: province.id, action: 'train' });
    if (province.development < 3) candidates.push({ provinceId: province.id, action: 'develop' });
    for (const order of candidates) {
      try {
        submitOrder(g, p.id, order);
        break;
      } catch {
        /* Try the next affordable legal action. */
      }
    }
  }
  p.ready = true;
}
export function allReady(g: GameState) {
  return g.players.every((p) => p.bot || p.ready || !g.provinces.some((t) => t.ownerId === p.id));
}
export function viewFor(g: GameState, playerId: string): GameView {
  const { orders, seed: _seed, ...publicState } = g;
  return { ...structuredClone(publicState), myOrders: structuredClone(orders[playerId] ?? []) };
}
