import { spendNationAuthority, syncNationAuthority } from '../shared/economy';
import { supremeCommandBlock, supremeCommandDefinition } from '../shared/supreme';
import { atWar, clamp, compositionOf } from '../shared/rules';
import { siegeResistance } from '../shared/siege';
import { emptyTurnReport, type GameState, type SupremeCommandOrder } from '../shared/types';
import { markDisorganized } from '../shared/morale';
import { assert, createBattalion, playerOf } from './state';
import { completeSiege } from './siege';
import { notify } from './notifications';

export function executeSupremeCommand(g: GameState, actorId: string, command: SupremeCommandOrder) {
  const reason = supremeCommandBlock(g, actorId, command);
  assert(!reason, reason ?? 'Comando indisponível.');
  const actor = playerOf(g, actorId),
    definition = supremeCommandDefinition(command.command);
  assert(spendNationAuthority(actor, definition.cost), 'Autoridade insuficiente.');
  const army = g.battalions.find((a) => a.id === command.battalionId);
  const province = g.provinces.find((p) => p.id === command.provinceId);
  let effect = '';
  if (command.command === 'WAR_BONDS') {
    actor.gold += 120;
    effect = '+120 Ouro no tesouro.';
  } else if (command.command === 'BLITZ_MARCH') {
    army!.morale = clamp(army!.morale + 25, 0, army!.moraleCap ?? 100);
    army!.disorganized = false;
    army!.supplySabotagedUntilTurn = undefined;
    army!.encircled = false;
    army!.blitzUntilTurn = g.turn;
    army!.movementPoints = Math.max(2, army!.movementPoints);
    effect = `${army!.name}: +25 Moral, reorganizado e duas etapas nesta rodada.`;
  } else if (command.command === 'ELITE_GUARD') {
    createBattalion(g, actorId, province!.id, compositionOf({ infantry: 4, cavalry: 2 }), {
      name: 'Guarda Imperial',
      morale: 100,
      training: 1.3,
    });
    effect = `Guarda Imperial mobilizada em ${province!.name}: 4 Infantarias e 2 Cavalarias.`;
  } else if (command.command === 'SABOTAGE_SUPPLY') {
    army!.morale = clamp(army!.morale - 40);
    army!.supplySabotagedUntilTurn = g.turn;
    army!.encircled = true;
    markDisorganized(army!);
    effect = `${army!.name}: −40 Moral e suprimento cortado nesta rodada.`;
  } else if (province) {
    province.fortLevel = Math.max(0, province.fortLevel - 1);
    const siege = province.siege ?? {
      attackerOwnerId: actorId,
      progress: 0,
      required: siegeResistance(g, province),
      turnsUnderSiege: 1,
      startedTurn: g.turn,
      lastProgressTurn: g.turn,
    };
    siege.progress += 4;
    siege.required = siegeResistance(g, province);
    province.siege = siege;
    const guarded = g.battalions.some(
      (a) =>
        a.provinceId === province.id &&
        !a.isFleet &&
        !a.embarkedOnId &&
        a.ownerId !== actorId &&
        (a.ownerId === 'NEUTRAL' || atWar(g, actorId, a.ownerId)),
    );
    effect = `${province.name}: −1 nível de Forte e +4 progresso de cerco.`;
    if (!guarded && siege.progress >= siege.required) {
      completeSiege(g, actorId, province, emptyTurnReport(g.turn, g.diet));
      effect += ' Cerco concluído imediatamente.';
    }
  }
  syncNationAuthority(actor);
  notify(g, {
    type: 'ECONOMY',
    severity: 'INFO',
    involvesPlayerIds: [
      actorId,
      ...(army?.ownerId && army.ownerId !== actorId && army.ownerId !== 'NEUTRAL'
        ? [army.ownerId]
        : []),
    ],
    focusProvinceId: province?.id ?? army?.provinceId,
    text: `👑 ${actor.nation} — ${definition.name} (${definition.cost} Autoridade): ${effect}`,
  });
}
