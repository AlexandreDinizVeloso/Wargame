import { siegeProgressPerTurn, siegeResistance } from '../shared/siege';
import type { Battalion, GameView, Province } from '../shared/types';
import { atWar, controller, getRelation } from '../shared/rules';
import { combatPowers } from '../shared/combat';
import { commanderFor, TRAITS } from '../shared/military';
import { TERRAIN_LABELS } from '../shared/map';
export function battlePreview(game: GameView, army: Battalion, province: Province) {
  const from = game.provinces.find((p) => p.id === army.provinceId),
    owner = controller(province);
  if (
    !from?.neighbors.includes(province.id) ||
    army.isFleet ||
    army.embarkedOnId ||
    province.kind !== 'LAND' ||
    owner === army.ownerId ||
    (owner && getRelation(game, army.ownerId, owner)?.allied)
  )
    return null;
  const defenders = game.battalions.filter(
    (b) =>
      b.provinceId === province.id &&
      !b.isFleet &&
      !b.embarkedOnId &&
      !b.stranded &&
      b.ownerId !== army.ownerId &&
      (b.ownerId === 'NEUTRAL' || b.ownerId === owner || atWar(game, army.ownerId, b.ownerId)),
  );
  const powers = combatPowers(game, [army], defenders, province);
  const currentSiege = province.siege?.attackerOwnerId === army.ownerId ? province.siege : null;
  const besiegers = game.battalions.filter(
    (b) =>
      b.provinceId === province.id &&
      b.ownerId === army.ownerId &&
      !b.isFleet &&
      !b.embarkedOnId &&
      !b.stranded &&
      b.id !== army.id,
  );
  const progress = siegeProgressPerTurn(game, army.ownerId, [...besiegers, army], province);
  const siegeTurns = Math.max(
    1,
    (currentSiege ? 0 : 1) +
      Math.ceil(
        ((currentSiege?.required ?? siegeResistance(game, province)) -
          (currentSiege?.progress ?? 1)) /
          progress,
      ),
  );
  const verdict =
    army.disorganized || army.morale < 25
      ? '🔴 Desorganizado: ofensiva bloqueada'
      : powers.ratio >= 1.25 || !defenders.length
        ? '🟢 Vitória Provável'
        : powers.ratio >= 0.85
          ? '🟡 Batalha Equilibrada'
          : '🔴 Alto Risco / Desvantagem';
  return {
    ...powers,
    siegeTurns,
    verdict,
    needsWar: !!owner && !atWar(game, army.ownerId, owner),
    leader: commanderFor(game, army),
  };
}
export default function BattlePreviewTooltip({
  game,
  army,
  province,
  x,
  y,
}: {
  game: GameView;
  army: Battalion;
  province: Province;
  x: number;
  y: number;
}) {
  const preview = battlePreview(game, army, province);
  if (!preview) return null;
  return (
    <aside
      className="battle-preview-tooltip"
      role="tooltip"
      aria-label="Prévia de combate"
      style={{
        left: Math.max(8, Math.min(innerWidth - 308, x + 18)),
        top: Math.max(8, Math.min(innerHeight - 270, y + 18)),
      }}
    >
      <strong>{province.name} · Prévia tática</strong>
      <div>
        ⚔️ Seu Poder Estimado <b>{Math.round(preview.attackPower)}</b> vs. 🛡️ Defesa Local{' '}
        <b>{Math.round(preview.defensePower)}</b>
      </div>
      <ul>
        {preview.riverCrossingModifier < 1 && (
          <li className="danger">🌊 Travessia de Rio: −15% de ataque</li>
        )}
        <li>
          Terreno: {TERRAIN_LABELS[province.terrain]} · defesa +
          {Math.round((province.terrainDefenseBonus - 1) * 100)}%
        </li>
        <li>
          Forte: {province.fortLevel} · {preview.neutralizedFortLevels} neutralizado(s)
        </li>
        <li>
          General:{' '}
          {preview.leader
            ? `${preview.leader.name} · ${TRAITS[preview.leader.trait].name}`
            : 'sem líder'}
        </li>
        <li>
          Moral: {Math.round(army.morale)}% · treino {Math.round(army.training * 100)}%
        </li>
      </ul>
      <b
        className={
          preview.verdict.startsWith('🟢')
            ? 'positive'
            : preview.verdict.startsWith('🟡')
              ? 'warning'
              : 'danger'
        }
      >
        {preview.verdict}
      </b>
      <div>
        🏰 {province.siege ? 'Cerco em andamento' : 'Inicia Cerco se vencer'} (~{preview.siegeTurns}{' '}
        turnos sem reforços/assaltos)
      </div>
      <small>
        {preview.needsWar ? 'Requer declaração de guerra. ' : ''}Estimativa das forças visíveis.
        Ordens simultâneas, reforços e forças ocultas podem alterar o resultado.
      </small>
    </aside>
  );
}
