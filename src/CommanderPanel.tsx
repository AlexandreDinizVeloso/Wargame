import { useState } from 'react';
import type { Battalion, CommanderTrait, GameView } from '../shared/types';
import { commanderFor, TRAITS } from '../shared/military';
import { reservedResources } from '../shared/rules';
import type { Command } from './ui';
export default function CommanderPanel({
  game,
  army,
  playerId,
  command,
}: {
  game: GameView;
  army: Battalion;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    assigned = commanderFor(game, army),
    leaders = game.commanders.filter((c) => c.ownerId === playerId && c.isAdmiral === army.isFleet),
    [trait, setTrait] = useState<CommanderTrait>(army.isFleet ? 'SEA_WOLF' : 'SIEGE_MASTER');
  const locked = me.ready || game.phase !== 'planning',
    reserved = reservedResources({ ...game, orders: { [playerId]: game.plannedOrders } }, playerId);
  return (
    <section className="commander-panel">
      <h3>{army.isFleet ? '⚓ Almirantado' : '🎖️ Estado-Maior'}</h3>
      {assigned ? (
        <div className="commander-card">
          <strong>
            {'★'.repeat(assigned.stars)} {assigned.name}
          </strong>
          <span>
            {assigned.xp} XP · {TRAITS[assigned.trait].name}
          </span>
          <p>{TRAITS[assigned.trait].description}</p>
          {assigned.trait === 'IRON_WALL' && (
            <small>
              {assigned.lastStandUsed
                ? 'Proteção da primeira derrota consumida'
                : 'Primeira derrota protegida contra aniquilação'}
            </small>
          )}
        </div>
      ) : (
        <p>Sem líder atribuído.</p>
      )}
      <label>
        Líder atribuído (instantâneo)
        <select
          disabled={locked}
          aria-label="Líder atribuído (instantâneo)"
          value={assigned?.id ?? ''}
          onChange={(e) =>
            command({
              type: 'ASSIGN_LEADER',
              battalionId: army.id,
              commanderId: e.target.value || null,
            })
          }
        >
          <option value="">Sem comandante</option>
          {leaders.map((c) => (
            <option key={c.id} value={c.id}>
              {'★'.repeat(c.stars)} {c.name} · {TRAITS[c.trait].name}
              {c.assignedBattalionId && c.assignedBattalionId !== army.id ? ' (transferir)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Traço do novo {army.isFleet ? 'almirante' : 'general'}
        <select
          disabled={locked}
          aria-label="Traço do novo líder"
          value={trait}
          onChange={(e) => setTrait(e.target.value as CommanderTrait)}
        >
          {Object.entries(TRAITS)
            .filter(([id]) =>
              army.isFleet
                ? ['SEA_WOLF', 'QUARTERMASTER', 'IRON_WALL'].includes(id)
                : id !== 'SEA_WOLF',
            )
            .map(([id, t]) => (
              <option key={id} value={id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={
          locked ||
          game.commanders.filter((c) => c.ownerId === playerId).length >= 3 ||
          me.gold - reserved.gold < 60 ||
          me.influence - reserved.influence < 15
        }
        onClick={() => command({ type: 'RECRUIT_COMMANDER', isAdmiral: army.isFleet, trait })}
      >
        Recrutar líder · 60 ouro + 15 influência
      </button>
      <small>
        {game.commanders.filter((c) => c.ownerId === playerId).length}/3 líderes ·{' '}
        {TRAITS[trait].description}
      </small>
    </section>
  );
}
