import {
  dilemmaBlock,
  dilemmaConsequences,
  dilemmaDefinition,
  dilemmaFor,
} from '../shared/dilemmas';
import { buildingLevel, canBuild, setBuildingLevel } from '../shared/development';
import { spendNationAuthority, syncNationAuthority } from '../shared/economy';
import type { CouncilEffect } from '../shared/councilEffects';
import { clamp, compositionOf, reservedResources, roundMoney } from '../shared/rules';
import { siegeResistance } from '../shared/siege';
import type { GameState, Player, TurnResolutionReport } from '../shared/types';
import { assert, createBattalion, playerOf } from './state';
import { notify } from './notifications';

/** Deferred only when the whole realm has no legal market/fort upgrade remaining. */
export function applyDilemmaBuildingCredits(g: GameState, player: Player): string[] {
  const built: string[] = [];
  while ((player.dilemmaBuildingCredits ?? 0) > 0) {
    const provinces = g.provinces
      .filter((p) => p.kind === 'LAND' && p.ownerId === player.id && !p.occupierId)
      .sort(
        (a, b) =>
          Number(b.capitalOf === player.id) - Number(a.capitalOf === player.id) ||
          a.id.localeCompare(b.id),
      );
    const candidate = provinces
      .flatMap((p) => (['FORT', 'MARKET'] as const).map((building) => ({ p, building })))
      .find(({ p, building }) => canBuild(p, building, player));
    if (!candidate) break;
    const { p, building } = candidate;
    setBuildingLevel(p, building, buildingLevel(p, building) + 1);
    if (building === 'FORT' && p.siege) p.siege.required = siegeResistance(g, p);
    player.dilemmaBuildingCredits = (player.dilemmaBuildingCredits ?? 0) - 1;
    built.push(`${building === 'FORT' ? 'Fortaleza' : 'Mercado'} gratuito em ${p.name}`);
  }
  return built;
}

export function issueDilemmas(g: GameState) {
  if (g.phase !== 'planning') return;
  for (const p of g.players) {
    const built = applyDilemmaBuildingCredits(g, p);
    if (built.length)
      notify(g, {
        type: 'ECONOMY',
        severity: 'INFO',
        involvesPlayerIds: [p.id],
        text: `${p.nation} concluiu obras anteriormente reservadas: ${built.join('; ')}.`,
      });
    if (
      g.turn % 4 === 0 &&
      g.provinces.some((q) => q.kind === 'LAND' && q.ownerId === p.id) &&
      !p.activeDilemma &&
      p.lastDilemmaTurn !== g.turn
    )
      p.activeDilemma = dilemmaFor(g.seed, p.id, g.turn, g);
  }
}
export function chooseDilemma(
  g: GameState,
  id: string,
  index: 0 | 1,
  automatic = false,
  report?: TurnResolutionReport,
) {
  const p = playerOf(g, id),
    active = p.activeDilemma;
  assert(index === 0 || index === 1, 'Escolha de Conselho inválida.');
  assert(active && active.turn === g.turn, 'Não há decisão do Conselho nesta rodada.');
  assert(automatic || !p.ready, 'Reabra suas ordens para escolher a decisão do Conselho.');
  const definition = dilemmaDefinition(active);
  assert(definition, 'Decisão do Conselho desconhecida.');
  const choice = definition.options[index],
    reserved = reservedResources(g, p.id);
  const reason = dilemmaBlock(p, choice, {
    gold: reserved.gold,
    manpower: reserved.manpower,
    authority: reserved.influence,
  });
  assert(!reason, reason ?? 'Recursos livres insuficientes.');
  const ownLand = g.provinces
    .filter((q) => q.kind === 'LAND' && q.ownerId === p.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  assert(ownLand.length > 0, 'A nação precisa possuir território para receber o Conselho.');
  const capital =
    ownLand.find((q) => q.id === p.originalCapitalId) ??
    ownLand.find((q) => q.capitalOf === p.id) ??
    ownLand[0];
  const target =
    ownLand.find((q) => q.id === active.targetProvinceId && !q.occupierId) ??
    ownLand.find((q) => !q.occupierId) ??
    capital;
  if (choice.authority < 0)
    assert(spendNationAuthority(p, -choice.authority), 'Autoridade insuficiente.');
  else if (choice.authority > 0) p.militaryXP += choice.authority;
  p.gold = roundMoney(p.gold + choice.gold);
  if (choice.manpower < 0) p.manpower += choice.manpower;
  else if (choice.manpower > 0 && p.manpower < p.manpowerCap)
    p.manpower = Math.min(p.manpowerCap, p.manpower + choice.manpower);
  if (choice.unrestChange) target.unrest = clamp(target.unrest + choice.unrestChange);
  if (choice.pacificationChange)
    target.pacification = clamp(target.pacification + choice.pacificationChange);
  if (choice.moraleChange)
    for (const army of g.battalions.filter(
      (a) => a.ownerId === p.id && (!choice.navalOnly || a.isFleet),
    ))
      army.morale = clamp(army.morale + choice.moraleChange, 0, army.moraleCap ?? 100);
  if (choice.infantry)
    createBattalion(g, p.id, capital.id, compositionOf({ infantry: choice.infantry }), {
      name: `Milícia do Conselho de ${capital.name}`,
      morale: 80,
      training: 1.1,
    });
  const nationalModifiers = { ...choice.modifiers },
    effects: CouncilEffect[] = [];
  const effectBase = {
    sourceId: definition.id,
    label: `${definition.name} · ${choice.label.replace(/^[AB] · /, '')}`,
    startsTurn: g.turn,
    expiresTurn: g.turn + choice.duration - 1,
  };
  if (choice.local && nationalModifiers.supplyBonus !== undefined) {
    effects.push({
      ...effectBase,
      id: `council-${g.turn}-${p.id}-${choice.effect}-local`,
      provinceId: target.id,
      modifiers: { supplyBonus: nationalModifiers.supplyBonus },
    });
    delete nationalModifiers.supplyBonus;
  }
  if (Object.keys(nationalModifiers).length)
    effects.push({
      ...effectBase,
      id: `council-${g.turn}-${p.id}-${choice.effect}`,
      modifiers: nationalModifiers,
    });
  p.councilEffects = [
    ...(p.councilEffects ?? []).filter((e) => e.expiresTurn >= g.turn),
    ...effects,
  ].slice(-32);
  p.lastDilemmaTurn = g.turn;
  p.lastDilemmaId = definition.id;
  p.activeDilemma = null;
  syncNationAuthority(p);
  const text = `${p.nation} — ${definition.name}: ${choice.label}${automatic ? ' (decisão automática)' : ''}. ${dilemmaConsequences(choice).join('; ')}.${choice.unrestChange || choice.pacificationChange || choice.local ? ` Região: ${target.name}.` : ''}`;
  report?.events.push(text);
  notify(g, {
    type: 'ECONOMY',
    severity: 'INFO',
    involvesPlayerIds: [id],
    focusProvinceId: target.id,
    text,
  });
}
export function resolveUnansweredDilemmas(g: GameState, report: TurnResolutionReport) {
  for (const p of g.players) {
    const built = applyDilemmaBuildingCredits(g, p);
    if (built.length) report.events.push(`${p.nation}: ${built.join('; ')}.`);
    if (!p.activeDilemma) continue;
    if (!g.provinces.some((q) => q.kind === 'LAND' && q.ownerId === p.id)) {
      p.activeDilemma = null;
      continue;
    }
    const d = dilemmaDefinition(p.activeDilemma)!;
    const reserved = reservedResources(g, p.id),
      paid = d.options[1];
    const affordable = !dilemmaBlock(p, paid, {
      gold: reserved.gold,
      manpower: reserved.manpower,
      authority: reserved.influence,
    });
    const urgent =
      p.warExhaustion >= 20 ||
      g.wars.some((w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(p.id));
    chooseDilemma(g, p.id, p.bot && affordable && (urgent || p.gold > 35) ? 1 : 0, true, report);
  }
}
