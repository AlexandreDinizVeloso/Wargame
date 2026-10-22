import { BUILDINGS } from '../shared/development';
import { SKILLS, TRAITS } from '../shared/military';
import type {
  Composition,
  GameCommand,
  PeaceTerm,
  PlayerOrder,
  NationId,
  Theater,
  ReligiousPolicy,
  CasusBelli,
  DiplomacyAction,
  BuildingType,
  CommanderTrait,
  SkillId,
  InstantArmyAction,
} from '../shared/types';
import { NATIONS, compositionOf, UNIT_KEYS } from '../shared/rules';
import { assert } from './state';
const object = (v: unknown): Record<string, unknown> => {
  assert(v && typeof v === 'object' && !Array.isArray(v), 'Objeto JSON inválido.');
  return v as Record<string, unknown>;
};
const string = (v: unknown, max = 100) => {
  assert(typeof v === 'string' && v.length > 0 && v.length <= max, 'Texto inválido.');
  return v;
};
const boolean = (v: unknown) => {
  assert(typeof v === 'boolean', 'Booleano inválido.');
  return v;
};
const integer = (v: unknown, min = 0, max = 50) => {
  assert(
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
    'Número inteiro fora da faixa.',
  );
  return v;
};
const strings = (v: unknown, max = 100) => {
  assert(Array.isArray(v) && v.length <= max, 'Lista inválida.');
  return v.map((s) => string(s));
};
function composition(v: unknown): Composition {
  const raw = object(v);
  return compositionOf(
    Object.fromEntries(UNIT_KEYS.map((k) => [k, raw[k] === undefined ? 0 : integer(raw[k])])),
  );
}
export function parseOrder(value: unknown): PlayerOrder {
  const o = object(value),
    type = string(o.type);
  if (type === 'RECRUIT_BATTALION') {
    const result: PlayerOrder = { type, provinceId: string(o.provinceId), ...composition(o) };
    if (o.battalionId !== undefined) result.battalionId = string(o.battalionId);
    if (o.isFleet !== undefined) result.isFleet = boolean(o.isFleet);
    if (o.isMercenary !== undefined) result.isMercenary = boolean(o.isMercenary);
    if (o.name !== undefined) result.name = string(o.name, 40);
    return result;
  }
  if (['BUILD_FORT', 'BUILD_PORT', 'BUILD_MARKET', 'PACIFY'].includes(type))
    return {
      type: type as 'BUILD_FORT' | 'BUILD_PORT' | 'BUILD_MARKET' | 'PACIFY',
      provinceId: string(o.provinceId),
    };
  if (type === 'BUILD_BUILDING' || type === 'DEMOLISH_BUILDING') {
    assert(Object.hasOwn(BUILDINGS, String(o.building)), 'Edifício desconhecido.');
    return { type, provinceId: string(o.provinceId), building: o.building as BuildingType };
  }
  if (type === 'AUTO_TRANSPORT')
    return {
      type,
      battalionId: string(o.battalionId),
      targetProvinceId: string(o.targetProvinceId),
    };
  if (type === 'NAVAL_BRIDGE')
    return {
      type,
      battalionId: string(o.battalionId),
      fleetId: string(o.fleetId),
      targetProvinceId: string(o.targetProvinceId),
    };
  if (type === 'CONVERT') return { type, targetProvinceId: string(o.targetProvinceId) };
  if (type === 'MOVE_BATTALION') {
    assert(
      (o.targetProvinceId !== undefined) !== (o.path !== undefined),
      'Informe destino ou caminho, exclusivamente.',
    );
    return o.path !== undefined
      ? { type, battalionId: string(o.battalionId), path: strings(o.path) }
      : { type, battalionId: string(o.battalionId), targetProvinceId: string(o.targetProvinceId) };
  }
  if (
    type === 'ENTRENCH_BATTALION' ||
    type === 'TRAIN_BATTALION' ||
    type === 'RAZE_PROVINCE' ||
    type === 'MERGE_ALL' ||
    type === 'ASSAULT_SIEGE'
  )
    return { type, battalionId: string(o.battalionId) };
  if (type === 'MERGE_BATTALIONS')
    return {
      type,
      battalionId: string(o.battalionId),
      targetBattalionId: string(o.targetBattalionId),
    };
  if (type === 'SPLIT_BATTALION')
    return {
      type,
      battalionId: string(o.battalionId),
      composition: composition(o.composition),
      ...(o.name !== undefined ? { name: string(o.name, 40) } : {}),
    };
  if (type === 'EMBARK_BATTALION') {
    assert(
      (o.fleetId !== undefined) !== (o.disembarkProvinceId !== undefined),
      'Informe frota ou destino de desembarque.',
    );
    return {
      type,
      battalionId: string(o.battalionId),
      ...(o.fleetId !== undefined
        ? { fleetId: string(o.fleetId) }
        : { disembarkProvinceId: string(o.disembarkProvinceId) }),
    };
  }
  if (type === 'DIPLOMACY') {
    const action = string(o.action);
    assert(
      [
        'PROPOSE_ALLIANCE',
        'BREAK_ALLIANCE',
        'MILITARY_ACCESS',
        'DEMAND_TRIBUTE',
        'EMBARGO',
        'FUND_REBELS',
        'SEND_SUBSIDY',
        'OFFER_VASSALAGE',
        'BUY_VISION_OR_BRIHC',
      ].includes(action),
      'Ação diplomática inválida.',
    );
    return {
      type,
      action: action as DiplomacyAction,
      targetRealmId: string(o.targetRealmId),
      ...(o.amount !== undefined ? { amount: integer(o.amount, 1, 1000) } : {}),
      ...(o.targetProvinceId !== undefined ? { targetProvinceId: string(o.targetProvinceId) } : {}),
    };
  }
  throw new Error('Ordem desconhecida para o protocolo 6.');
}
export function parseTerms(value: unknown): PeaceTerm[] {
  assert(Array.isArray(value) && value.length <= 5, 'Termos de paz inválidos.');
  return value.map((raw) => {
    const t = object(raw),
      type = string(t.type);
    if (type === 'CEDE_PROVINCES') return { type, provinceIds: strings(t.provinceIds, 56) };
    if (type === 'WAR_REPARATIONS')
      return { type, immediateTribute: integer(t.immediateTribute, 0, 100) };
    if (type === 'HUMILIATE_DISARM' || type === 'SUBJUGATE') return { type };
    if (type === 'FORCE_EMPIRE_OR_RELIGION') {
      assert(t.choice === 'RELIGION', 'Exigência inválida.');
      return { type, choice: t.choice };
    }
    throw new Error('Termo de paz desconhecido.');
  });
}
export function parseCommand(value: unknown): GameCommand {
  const c = object(value),
    type = string(c.type);
  if (type === 'ASSIGN_LEADER')
    return {
      type,
      battalionId: string(c.battalionId),
      commanderId: c.commanderId === null ? null : string(c.commanderId),
    };
  if (type === 'INSTANT_ARMY_ACTION') {
    const a = object(c.action);
    if (a.type === 'ASSIGN_LEADER') {
      const parsed = parseCommand(a);
      assert(parsed.type === 'ASSIGN_LEADER', 'Atribuição inválida.');
      return { type, action: parsed };
    }
    const action = parseOrder(a);
    assert(
      ['MERGE_BATTALIONS', 'MERGE_ALL', 'SPLIT_BATTALION'].includes(action.type),
      'Ação não instantânea.',
    );
    return { type, action: action as InstantArmyAction };
  }
  if (type === 'RECRUIT_COMMANDER') {
    assert(Object.hasOwn(TRAITS, String(c.trait)), 'Traço inválido.');
    return {
      type,
      isAdmiral: boolean(c.isAdmiral),
      trait: c.trait as CommanderTrait,
      ...(c.name !== undefined ? { name: string(c.name, 40) } : {}),
    };
  }
  if (type === 'UNLOCK_SKILL') {
    assert(
      SKILLS.some((s) => s.id === c.skillId),
      'Doutrina inválida.',
    );
    return { type, skillId: c.skillId as SkillId };
  }
  if (type === 'SET_AUTO_MERGE')
    return { type, battalionId: string(c.battalionId), autoMerge: boolean(c.autoMerge) };
  if (type === 'SUBMIT_ORDER') return { type, order: parseOrder(c.order) };
  if (type === 'CANCEL_ORDER') return { type, key: string(c.key) };
  if (type === 'READY') return { type, ready: boolean(c.ready) };
  if (type === 'ANSWER_OFFER')
    return { type, offerId: string(c.offerId), accept: boolean(c.accept) };
  if (['START_GAME', 'ADD_BOT'].includes(type))
    return {
      type: type as 'START_GAME' | 'ADD_BOT',
    };
  if (type === 'SET_MODE') {
    assert(c.mode === 'quick' || c.mode === 'campaign', 'Modo inválido.');
    if (c.theater !== undefined)
      assert(['EUROPE', 'AMERICAS', 'ASIA'].includes(String(c.theater)), 'Teatro inválido.');
    return { type, mode: c.mode, ...(c.theater ? { theater: c.theater as Theater } : {}) };
  }
  if (type === 'SET_IDENTITY') {
    assert(
      NATIONS.some((n) => n.id === c.nationId),
      'Nação inválida.',
    );
    if (c.religiousPolicy !== undefined)
      assert(
        ['INQUISITION', 'TOLERANCE'].includes(String(c.religiousPolicy)),
        'Política inválida.',
      );
    return {
      type,
      nationId: c.nationId as NationId,
      ...(c.religiousPolicy ? { religiousPolicy: c.religiousPolicy as ReligiousPolicy } : {}),
    };
  }
  if (type === 'SET_PLAYER_NAME') {
    const name = string(c.name, 30).trim().replace(/\s+/g, ' ');
    assert(
      name.length > 0 && !/[\u0000-\u001f\u007f]/.test(name),
      'Escolha um nome válido de até 30 caracteres.',
    );
    return { type, name };
  }
  if (type === 'SET_BOT_NATION') {
    assert(
      NATIONS.some((n) => n.id === c.nationId),
      'Nação inválida.',
    );
    return { type, playerId: string(c.playerId), nationId: c.nationId as NationId };
  }
  if (type === 'SET_RELIGIOUS_POLICY') {
    assert(c.policy === 'INQUISITION' || c.policy === 'TOLERANCE', 'Política inválida.');
    return { type, policy: c.policy };
  }
  if (type === 'EMERGENCY_LEVY' || type === 'CONTINUE_SANDBOX') return { type };
  if (type === 'READ_NOTIFICATIONS')
    return { type, notificationIds: strings(c.notificationIds, 250) };
  if (type === 'REPLACE_WITH_BOT') return { type, playerId: string(c.playerId) };
  if (type === 'CHAT') return { type, text: string(c.text, 280) };
  if (type === 'JOIN_COALITION' || type === 'DECLARE_COALITION_WAR')
    return { type, targetRealmId: string(c.targetRealmId) };
  if (type === 'CHOOSE_SECRET_OBJECTIVE') return { type, objectiveId: string(c.objectiveId) };
  if (type === 'SET_LOBBY_OPTIONS')
    return {
      type,
      roomName: string(c.roomName, 60).trim(),
      isPublic: boolean(c.isPublic),
      enableSecretObjectives: boolean(c.enableSecretObjectives),
      ...(c.allowBotSecretVictory !== undefined
        ? { allowBotSecretVictory: boolean(c.allowBotSecretVictory) }
        : {}),
      turnTimerSeconds: integer(c.turnTimerSeconds, 15, 600),
    };
  if (type === 'DECLARE_WAR_AND_MOVE') {
    const war = parseCommand({ ...c, type: 'DECLARE_WAR' });
    if (war.type !== 'DECLARE_WAR') throw new Error('Declaração inválida.');
    return {
      ...war,
      type,
      battalionId: string(c.battalionId),
      targetProvinceId: string(c.targetProvinceId),
      ...(c.bridgeFleetId !== undefined ? { bridgeFleetId: string(c.bridgeFleetId) } : {}),
      ...(c.autoTransport !== undefined ? { autoTransport: boolean(c.autoTransport) } : {}),
    };
  }
  if (type === 'CALL_TO_ARMS') return { type, warId: string(c.warId), allyId: string(c.allyId) };
  if (type === 'DECLARE_WAR') {
    assert(
      ['CONQUEST', 'HOLY_WAR', 'HUMILIATION', 'COALITION'].includes(String(c.casusBelli)),
      'Casus belli inválido.',
    );
    return {
      type,
      targetRealmId: string(c.targetRealmId),
      casusBelli: c.casusBelli as CasusBelli,
      ...(c.offensiveAllyIds !== undefined
        ? { offensiveAllyIds: strings(c.offensiveAllyIds, 7) }
        : {}),
    };
  }
  if (type === 'OFFER_PEACE') return { type, warId: string(c.warId), terms: parseTerms(c.terms) };
  throw new Error('Comando desconhecido para o protocolo 6.');
}
