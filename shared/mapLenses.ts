import type { GameView, MapMode, Province } from './types';
import {
  controller,
  getRelation,
  atWar,
  effectiveTax,
  tradeIncomeOf,
  isBlockaded,
  unitCount,
} from './rules';
import { effectiveSupply } from './strategy';
import { supplyConsumption, supplyConnected } from './logistics';
import { seasonRulesAt } from './world';
export const MAP_LENSES: {
  id: MapMode;
  name: string;
  key: string;
  description: string;
  legend: string;
}[] = [
  {
    id: 'POLITICAL',
    name: 'Político',
    key: 'F1',
    description: 'Proprietários, ocupações, fronteiras e forças.',
    legend: 'Cores nacionais · hachura = ocupação',
  },
  {
    id: 'ECONOMIC',
    name: 'Economia',
    key: 'F2',
    description: 'Renda local efetiva e recursos estratégicos.',
    legend: 'Dourado: renda baixa → esmeralda: alta',
  },
  {
    id: 'LOGISTICS',
    name: 'Suprimento',
    key: 'F3',
    description: 'Capacidade, consumo e linhas de abastecimento.',
    legend: 'Azul/verde ≥18 · amarelo 12–17 · laranja <12 · vermelho: atrito',
  },
  {
    id: 'DIPLOMATIC',
    name: 'Diplomacia',
    key: 'F4',
    description: 'Relações com a nação de referência.',
    legend:
      'Azul: próprio · ciano: aliados/vassalos · vermelho: guerra · âmbar: trégua · roxo: coalizão',
  },
  {
    id: 'UNREST',
    name: 'Estabilidade',
    key: 'F5',
    description: 'Pacificacão, fé e risco de rebelião.',
    legend: 'Verde ≥80 e mesma fé · amarelo 50–79 · vermelho/laranja <50',
  },
];
export function provinceIncome(g: GameView, p: Province) {
  const owner = g.players.find((a) => a.id === controller(p));
  if (p.kind !== 'LAND') return 0;
  const mod =
    (owner?.faith === 'MERCHANT' && (p.portLevel > 0 || p.marketLevel > 0) ? 1.25 : 1) *
    (owner?.nationId === 'vespera' && (p.portLevel > 0 || p.marketLevel > 0) ? 1.3 : 1) *
    (g.globalEvent?.id === 'GOLD_RUSH' && p.strategicResource === 'GOLD_MINE' ? 1.5 : 1);
  return (
    (effectiveTax(
      p,
      owner?.faith ?? p.religion,
      isBlockaded(g, p),
      owner?.religiousPolicy ?? 'TOLERANCE',
    ) +
      tradeIncomeOf(p) * seasonRulesAt(g.turn).tradeMultiplier) *
      mod +
    p.foundryLevel * 2 +
    (p.strategicResource === 'RELIC' ? 3 : 0)
  );
}
export function provinceLogistics(g: GameView, p: Province, id: string) {
  const units = g.battalions.filter(
      (a) => a.ownerId === id && a.provinceId === p.id && !a.isFleet && !a.embarkedOnId,
    ),
    nation = g.players.find((a) => a.id === id)?.nationId;
  const troops = units.reduce((n, a) => n + unitCount(a), 0),
    consumption = units.reduce((n, a) => n + supplyConsumption(g, a, nation), 0),
    limit = effectiveSupply(g, id, p);
  const danger =
    consumption > limit ||
    units.some((a) => a.encircled || (p.ownerId !== id && !supplyConnected(g, a)));
  return { troops, consumption, limit, danger };
}
export function provinceLensColor(
  g: GameView,
  p: Province,
  mode: MapMode,
  referenceId: string,
  viewerId = referenceId,
) {
  if (mode === 'ECONOMIC')
    return `hsl(${42 + Math.min(1, provinceIncome(g, p) / 16) * 115} 48% 39%)`;
  if (mode === 'LOGISTICS') {
    const s = provinceLogistics(g, p, viewerId);
    return s.danger
      ? '#dc3636'
      : s.limit >= 24
        ? '#258861'
        : s.limit >= 18
          ? '#247ca5'
          : s.limit >= 12
            ? '#bc9d35'
            : '#be702b';
  }
  const owner = controller(p),
    ref = g.players.find((a) => a.id === referenceId);
  if (mode === 'UNREST')
    return p.pacification >= 80 && p.religion === (ref?.faith ?? p.religion)
      ? '#2c9859'
      : p.pacification >= 50
        ? '#c4a434'
        : p.unrest >= 70
          ? '#d53535'
          : '#c96c2a';
  if (mode === 'DIPLOMATIC') {
    const target = g.players.find((a) => a.id === owner),
      r = owner ? getRelation(g, referenceId, owner) : null;
    if (owner === referenceId) return '#2563eb';
    if (owner && atWar(g, referenceId, owner)) return '#dc2626';
    if (r?.allied || target?.subjectOfId === referenceId || ref?.subjectOfId === owner)
      return '#06b6d4';
    if (
      owner &&
      g.coalitions.some((c) => c.targetId === referenceId && c.memberIds.includes(owner))
    )
      return '#9333ea';
    if (r && r.truceUntil >= g.turn) return '#d97706';
    return '#536a74';
  }
  return g.players.find((a) => a.id === p.ownerId)?.color ?? '#536c67';
}
