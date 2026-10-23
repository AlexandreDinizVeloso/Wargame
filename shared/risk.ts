import { ECONOMY_BALANCE } from './balance';
import geometry from './world-geometry.json';
import type { GameState } from './types';
export const CONTINENT_BONUSES = {
  SOUTH_AMERICA: {
    name: 'América do Sul',
    ...ECONOMY_BALANCE.continent.SOUTH_AMERICA,
    provinceIds: geometry.filter((p) => p.continent === 'SOUTH_AMERICA').map((p) => p.id),
  },
  NORTH_AMERICA: {
    name: 'América do Norte e Central',
    ...ECONOMY_BALANCE.continent.NORTH_AMERICA,
    provinceIds: geometry.filter((p) => p.continent === 'NORTH_AMERICA').map((p) => p.id),
  },
  EUROPE: {
    name: 'Europa',
    ...ECONOMY_BALANCE.continent.EUROPE,
    provinceIds: geometry.filter((p) => p.continent === 'EUROPE').map((p) => p.id),
  },
  MENA_AFRICA: {
    name: 'África e Oriente Médio',
    ...ECONOMY_BALANCE.continent.MENA_AFRICA,
    provinceIds: geometry.filter((p) => p.continent === 'MENA_AFRICA').map((p) => p.id),
  },
  ASIA: {
    name: 'Ásia e Oceania',
    ...ECONOMY_BALANCE.continent.ASIA,
    provinceIds: geometry.filter((p) => p.continent === 'ASIA').map((p) => p.id),
  },
} as const;
export type RiskContinent = keyof typeof CONTINENT_BONUSES;
const riskTerritoryIds = new Set(geometry.map((p) => p.id));
export function continentBonuses(g: Pick<GameState, 'provinces'>, playerId: string) {
  if (g.provinces.some((p) => p.kind === 'LAND' && !riskTerritoryIds.has(p.id)))
    return { gold: 0, manpower: 0, authority: 0, controlledContinents: [] as RiskContinent[] };
  const controlledContinents = (Object.keys(CONTINENT_BONUSES) as RiskContinent[]).filter((id) =>
    CONTINENT_BONUSES[id].provinceIds.every((provinceId) =>
      g.provinces.some(
        (p) => p.id === provinceId && p.kind === 'LAND' && (p.occupierId ?? p.ownerId) === playerId,
      ),
    ),
  );
  return controlledContinents.reduce(
    (total, id) => {
      const bonus = CONTINENT_BONUSES[id];
      return {
        ...total,
        gold: total.gold + bonus.gold,
        manpower: total.manpower + bonus.manpower,
        authority: total.authority + bonus.authority,
      };
    },
    { gold: 0, manpower: 0, authority: 0, controlledContinents },
  );
}
