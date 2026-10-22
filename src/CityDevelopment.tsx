import type { BuildingType, GameView, Province } from '../shared/types';
import {
  BUILDINGS,
  buildingLevel,
  buildingLimit,
  buildingSlots,
  canBuild,
  imperialInflation,
  usedSlots,
} from '../shared/development';
import { orderCost, reservedResources } from '../shared/rules';
import type { Command } from './ui';
export default function CityDevelopment({
  game,
  province,
  playerId,
  command,
}: {
  game: GameView;
  province: Province;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    active =
      !me.ready &&
      game.phase === 'planning' &&
      province.ownerId === playerId &&
      !province.occupierId;
  const reserved = reservedResources(
    { ...game, orders: { [playerId]: game.plannedOrders } },
    playerId,
    `city:${province.id}`,
  );
  return (
    <section className="city-development">
      <h3>🏙️ Especialização da cidade</h3>
      <div
        className="building-slots"
        aria-label={`${usedSlots(province)} de ${buildingSlots(province)} slots ocupados`}
      >
        {Array.from({ length: buildingSlots(province) }, (_, i) => (
          <span className={i < usedSlots(province) ? 'filled' : ''} key={i}>
            {i < usedSlots(province) ? '▣' : '□'}
          </span>
        ))}
        <b>
          {usedSlots(province)}/{buildingSlots(province)} slots
        </b>
      </div>
      <p className="fine-print">
        Níveis compartilham o slot. Administração: custo de construção ×
        {imperialInflation(game, playerId).toFixed(2)}.
      </p>
      {(Object.keys(BUILDINGS) as BuildingType[]).map((b) => {
        const data = BUILDINGS[b],
          level = buildingLevel(province, b),
          order = { type: 'BUILD_BUILDING' as const, provinceId: province.id, building: b },
          cost = orderCost(order, province, me, game);
        return (
          <article className="building-card" key={b}>
            <header>
              <strong>{data.name}</strong>
              <small>
                Nível {level}/{buildingLimit(b, me)}
              </small>
            </header>
            <p>{data.description}</p>
            <div className="button-pair">
              <button
                disabled={
                  !active || !canBuild(province, b, me) || me.gold - reserved.gold < cost.gold
                }
                onClick={() => command({ type: 'SUBMIT_ORDER', order })}
              >
                {level ? 'Melhorar' : 'Construir'} {data.name.split(' / ')[0]} ·{' '}
                {cost.gold.toFixed(0)} ouro
              </button>
              {level > 0 && (
                <button
                  disabled={!active}
                  onClick={() =>
                    command({
                      type: 'SUBMIT_ORDER',
                      order: { type: 'DEMOLISH_BUILDING', provinceId: province.id, building: b },
                    })
                  }
                >
                  Demolir {data.name.split(' / ')[0]}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
