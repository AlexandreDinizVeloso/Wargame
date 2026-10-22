import type { BuildingType, CityOrder, GameState, Player, Province } from './types';
import { controller } from './rules';
export const BUILDINGS: Record<
  BuildingType,
  {
    name: string;
    description: string;
    baseCost: number;
    field:
      'marketLevel' | 'barracksLevel' | 'fortLevel' | 'foundryLevel' | 'templeLevel' | 'portLevel';
  }
> = {
  MARKET: {
    name: 'Mercado / Bolsa',
    description: '+3 comércio por nível.',
    baseCost: 20,
    field: 'marketLevel',
  },
  BARRACKS: {
    name: 'Quartel / Academia',
    description:
      '+5 limite militar, +8 capacidade e +1,5 regeneração de reservas por nível; recruta 4/7 e libera armas avançadas.',
    baseCost: 24,
    field: 'barracksLevel',
  },
  FORT: {
    name: 'Fortaleza / Cidadela',
    description: '+15% defesa, +2 resistência de cerco e zona de controle por nível.',
    baseCost: 24,
    field: 'fortLevel',
  },
  FOUNDRY: {
    name: 'Arsenal / Fundição',
    description:
      '+10% equipamento de infantaria/artilharia e +2 indústria; 1,5 ouro de manutenção por nível, isento em ferro.',
    baseCost: 30,
    field: 'foundryLevel',
  },
  TEMPLE: {
    name: 'Templo / Catedral',
    description: '−15 revolta, +25% pacificação e +2 Fervor/estabilidade por nível.',
    baseCost: 22,
    field: 'templeLevel',
  },
  PORT: {
    name: 'Estaleiro / Porto',
    description: 'Recruta frotas; +2,5 comércio e +4 suprimento costeiro por nível.',
    baseCost: 28,
    field: 'portLevel',
  },
};
export const buildingLevel = (p: Province, b: BuildingType) => p[BUILDINGS[b].field];
export const setBuildingLevel = (p: Province, b: BuildingType, n: number) => {
  p[BUILDINGS[b].field] = n;
};
export const buildingLimit = (b: BuildingType, p?: Player) =>
  b === 'FORT' && p?.nationId === 'kaldor' ? 3 : 2;
export const buildingSlots = (p: Pick<Province, 'capitalOf' | 'strategicResource'>) =>
  p.capitalOf || p.strategicResource === 'GOLD_MINE' || p.strategicResource === 'RELIC' ? 3 : 2;
export const usedSlots = (p: Province) =>
  Object.keys(BUILDINGS).filter((b) => buildingLevel(p, b as BuildingType) > 0).length;
export const constructionType = (o: CityOrder): BuildingType | null =>
  o.type === 'BUILD_BUILDING'
    ? o.building
    : o.type === 'BUILD_FORT'
      ? 'FORT'
      : o.type === 'BUILD_PORT'
        ? 'PORT'
        : o.type === 'BUILD_MARKET'
          ? 'MARKET'
          : null;
export const imperialInflation = (g: Pick<GameState, 'provinces'>, id: string) =>
  1 +
  Math.max(0, g.provinces.filter((p) => p.kind === 'LAND' && controller(p) === id).length - 6) *
    0.12;
export function canBuild(p: Province, b: BuildingType, actor: Player) {
  return (
    p.kind === 'LAND' &&
    (b !== 'PORT' || p.isCoastal) &&
    buildingLevel(p, b) < buildingLimit(b, actor) &&
    (buildingLevel(p, b) > 0 || usedSlots(p) < buildingSlots(p))
  );
}
export function subjugationEligible(
  g: Pick<GameState, 'provinces' | 'players'>,
  winnerId: string,
  loserId: string,
) {
  const owned = g.provinces.filter((p) => p.kind === 'LAND' && p.ownerId === loserId),
    capital =
      owned.find((p) => p.capitalOf === loserId) ||
      owned.find((p) => p.id === g.players.find((p) => p.id === loserId)?.originalCapitalId);
  return (
    owned.length > 0 &&
    (owned.length <= 3 ||
      (!!capital &&
        capital.occupierId === winnerId &&
        owned.filter((p) => p.occupierId === winnerId).length / owned.length >= 0.75))
  );
}
