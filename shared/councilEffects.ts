/** Persistent policy effects. Durations include the decision round. */
export interface CouncilModifiers {
  incomeMultiplier: number;
  upkeepMultiplier: number;
  goldPerTurn: number;
  manpowerGain: number;
  authorityGain: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  navalAttackMultiplier: number;
  moraleBonus: number;
  moraleRecovery: number;
  supplyBonus: number;
}
export interface CouncilEffect {
  id: string;
  sourceId: string;
  label: string;
  startsTurn: number;
  expiresTurn: number;
  provinceId?: string;
  modifiers: Partial<CouncilModifiers>;
}
export type CouncilNation = { councilEffects?: CouncilEffect[] };
export const neutralCouncilModifiers = (): CouncilModifiers => ({
  incomeMultiplier: 1,
  upkeepMultiplier: 1,
  goldPerTurn: 0,
  manpowerGain: 0,
  authorityGain: 0,
  attackMultiplier: 1,
  defenseMultiplier: 1,
  navalAttackMultiplier: 1,
  moraleBonus: 0,
  moraleRecovery: 0,
  supplyBonus: 0,
});
const multipliers = new Set<keyof CouncilModifiers>([
  'incomeMultiplier',
  'upkeepMultiplier',
  'attackMultiplier',
  'defenseMultiplier',
  'navalAttackMultiplier',
]);
export function activeCouncilEffects(
  nation: CouncilNation | undefined,
  turn: number,
): CouncilEffect[] {
  return (nation?.councilEffects ?? []).filter(
    (effect) => effect.startsTurn <= turn && effect.expiresTurn >= turn,
  );
}
export function councilModifiers(
  nation: CouncilNation | undefined,
  turn: number,
  provinceId?: string,
): CouncilModifiers {
  const result = neutralCouncilModifiers();
  for (const effect of activeCouncilEffects(nation, turn)) {
    if (effect.provinceId && effect.provinceId !== provinceId) continue;
    for (const key of Object.keys(effect.modifiers) as (keyof CouncilModifiers)[]) {
      const amount = effect.modifiers[key];
      if (amount === undefined || !Number.isFinite(amount)) continue;
      if (multipliers.has(key)) result[key] *= amount;
      else result[key] += amount;
    }
  }
  return result;
}
export function councilModifierLabels(modifiers: Partial<CouncilModifiers>): string[] {
  const labels: string[] = [];
  const percent = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
  const ratios: [keyof CouncilModifiers, string][] = [
    ['incomeMultiplier', 'receita'],
    ['upkeepMultiplier', 'manutenção'],
    ['attackMultiplier', 'ataque'],
    ['defenseMultiplier', 'defesa'],
    ['navalAttackMultiplier', 'ataque naval'],
  ];
  for (const [key, label] of ratios) {
    const amount = modifiers[key];
    if (amount !== undefined && amount !== 1) labels.push(`${percent(amount - 1)} ${label}`);
  }
  const additions: [keyof CouncilModifiers, string][] = [
    ['goldPerTurn', 'Ouro/rodada'],
    ['manpowerGain', 'regeneração de Recrutas/rodada'],
    ['authorityGain', 'Autoridade/rodada'],
    ['moraleBonus', 'moral efetiva'],
    ['moraleRecovery', 'recuperação de moral/rodada'],
    ['supplyBonus', 'suprimento local'],
  ];
  for (const [key, label] of additions) {
    const amount = modifiers[key];
    if (amount !== undefined && amount !== 0) labels.push(`${signed(amount)} ${label}`);
  }
  return labels;
}
