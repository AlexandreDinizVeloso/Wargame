import { getNationAuthority } from './economy';
import { computeVisibleProvinces, verticalRules, visionPartners } from './fogOfWar';
import { atWar, controller, reservedResources } from './rules';
import { isCamouflaged } from './strategy';
import type { GameState, GameView, SupremeCommandId, SupremeCommandOrder } from './types';

export const SUPREME_COMMANDS: readonly {
  id: SupremeCommandId;
  name: string;
  icon: string;
  cost: number;
  description: string;
  target: 'NONE' | 'OWN_ARMY' | 'OWN_PROVINCE' | 'ENEMY_PROVINCE' | 'ENEMY_ARMY';
}[] = [
  {
    id: 'BLITZ_MARCH',
    name: 'Marcha Forçada',
    icon: '⚡',
    cost: 35,
    target: 'OWN_ARMY',
    description:
      '+25 Moral, reorganização imediata, duas etapas de movimento e ataque sem penalidades de rio ou terreno nesta rodada.',
  },
  {
    id: 'WAR_BONDS',
    name: 'Tesouro de Emergência',
    icon: '💰',
    cost: 30,
    target: 'NONE',
    description: 'Converta 30 Autoridade em 120 Ouro imediatamente.',
  },
  {
    id: 'ELITE_GUARD',
    name: 'Convocar Guarda Imperial',
    icon: '🪂',
    cost: 50,
    target: 'OWN_PROVINCE',
    description:
      'Crie 4 Infantarias e 2 Cavalarias com Moral 100 e Treinamento 1,30, sem gastar Recrutas ou capacidade de Quartel.',
  },
  {
    id: 'SIEGE_BREAKER',
    name: 'Bombardeio de Ruptura',
    icon: '💣',
    cost: 45,
    target: 'ENEMY_PROVINCE',
    description:
      'Destrua 1 nível de Forte e adicione 4 de progresso de cerco. Guardas inimigas precisam ser derrotadas antes da ocupação.',
  },
  {
    id: 'SABOTAGE_SUPPLY',
    name: 'Sabotagem de Comando',
    icon: '🔥',
    cost: 40,
    target: 'ENEMY_ARMY',
    description: 'Reduza a Moral inimiga em 40 e corte seu suprimento durante esta rodada.',
  },
];
export const supremeCommandDefinition = (id: SupremeCommandId) =>
  SUPREME_COMMANDS.find((c) => c.id === id)!;

export function supremeCommandBlock(
  g: GameState | GameView,
  actorId: string,
  order: SupremeCommandOrder,
): string | null {
  const actor = g.players.find((p) => p.id === actorId);
  const definition = SUPREME_COMMANDS.find((c) => c.id === order.command);
  if (!actor || !definition) return 'Comando ou nação inválidos.';
  if (g.phase !== 'planning' || actor.ready)
    return 'Reabra as ordens para exercer o Comando Supremo.';
  const reserves = reservedResources(
    'orders' in g ? g : { ...g, orders: { [actorId]: g.plannedOrders } },
    actorId,
  );
  if (getNationAuthority(actor) - reserves.influence < definition.cost)
    return `Exige ${definition.cost} Autoridade livre.`;
  const province = g.provinces.find((p) => p.id === order.provinceId);
  const army = g.battalions.find((a) => a.id === order.battalionId);
  if (definition.target === 'NONE') return null;
  if (definition.target === 'OWN_ARMY') {
    if (!army || army.ownerId !== actorId) return 'Selecione um batalhão próprio.';
    if (army.embarkedOnId || army.stranded)
      return 'Desembarque ou reagrupe a formação antes da Marcha Forçada.';
    return null;
  }
  if (definition.target === 'OWN_PROVINCE') {
    if (
      !province ||
      province.kind !== 'LAND' ||
      province.ownerId !== actorId ||
      province.occupierId
    )
      return 'Selecione uma província própria e livre de ocupação.';
    if (
      g.battalions.some(
        (a) =>
          a.provinceId === province.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          a.ownerId !== actorId &&
          (a.ownerId === 'NEUTRAL' || atWar(g, actorId, a.ownerId)),
      )
    )
      return 'A Guarda não pode surgir sob ataque inimigo.';
    return null;
  }
  const visible = verticalRules(g)
    ? computeVisibleProvinces(g, actorId)
    : new Set(g.provinces.map((p) => p.id));
  if (definition.target === 'ENEMY_ARMY') {
    if (!army || army.ownerId === actorId || army.embarkedOnId || !visible.has(army.provinceId))
      return 'Selecione um batalhão inimigo visível.';
    if (army.ownerId !== 'NEUTRAL' && !atWar(g, actorId, army.ownerId))
      return 'Declare guerra antes de sabotar esta nação.';
    const recognizedOwners = new Set([
      actorId,
      ...(verticalRules(g) ? visionPartners(g, actorId) : []),
      ...g.players.filter((p) => p.subjectOfId === actorId).map((p) => p.id),
      ...(g.visionContracts ?? [])
        .filter((v) => v.buyerId === actorId && v.untilTurn >= g.turn)
        .map((v) => v.targetId),
    ]);
    if (isCamouflaged(g, army) && !recognizedOwners.has(army.ownerId))
      return 'A formação está oculta no terreno.';
    return null;
  }
  if (!province || province.kind !== 'LAND' || !visible.has(province.id))
    return 'Selecione uma província inimiga visível.';
  const owner = controller(province);
  if (owner === actorId || (owner && !atWar(g, actorId, owner)))
    return 'O alvo precisa ser inimigo em guerra ou uma cidade independente.';
  if (province.siege && province.siege.attackerOwnerId !== actorId)
    return 'Outro exército conduz este cerco.';
  if (
    !g.battalions.some(
      (a) =>
        a.ownerId === actorId &&
        !a.isFleet &&
        !a.embarkedOnId &&
        !a.stranded &&
        (a.provinceId === province.id || province.neighbors.includes(a.provinceId)),
    )
  )
    return 'Aproxime um batalhão terrestre do alvo para dirigir o bombardeio.';
  return null;
}
