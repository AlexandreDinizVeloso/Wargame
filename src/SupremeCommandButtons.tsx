import { SUPREME_COMMANDS, supremeCommandBlock } from '../shared/supreme';
import type { GameView, SupremeCommandOrder } from '../shared/types';
import type { Command } from './ui';
export default function SupremeCommandButtons({
  game,
  playerId,
  command,
  battalionId,
  provinceId,
  compact = false,
}: {
  game: GameView;
  playerId: string;
  command: Command;
  battalionId?: string;
  provinceId?: string;
  compact?: boolean;
}) {
  const selected = game.battalions.find((a) => a.id === battalionId);
  const ownCapital = game.provinces.find(
    (p) => p.capitalOf === playerId && p.ownerId === playerId && !p.occupierId,
  );
  return (
    <section
      className={`supreme-command-bar ${compact ? 'compact' : ''}`}
      aria-label="Comandos Supremos de Autoridade"
    >
      {!compact && <h3>👑 Comando Supremo</h3>}
      {SUPREME_COMMANDS.map((definition) => {
        const province = provinceId ?? selected?.provinceId;
        const targetArmy =
          definition.target === 'ENEMY_ARMY'
            ? (selected ??
              game.battalions.find((a) => a.provinceId === province && a.ownerId !== playerId))
            : (selected ??
              game.battalions.find(
                (a) => a.ownerId === playerId && (!province || a.provinceId === province),
              ));
        const payload: SupremeCommandOrder = {
          type: 'EXECUTE_SUPREME_COMMAND',
          command: definition.id,
          ...(definition.target.endsWith('ARMY') && targetArmy
            ? { battalionId: targetArmy.id }
            : {}),
          ...(definition.target === 'OWN_PROVINCE'
            ? { provinceId: province ?? ownCapital?.id }
            : {}),
          ...(definition.target === 'ENEMY_PROVINCE'
            ? {
                provinceId:
                  province ?? game.provinces.find((p) => p.siege?.attackerOwnerId === playerId)?.id,
              }
            : {}),
        };
        const reason = supremeCommandBlock(game, playerId, payload);
        return (
          <button
            key={definition.id}
            className="supreme-command-button"
            data-supreme-command={definition.id}
            disabled={!!reason}
            title={`${definition.description}${reason ? ` ${reason}` : ''}`}
            aria-label={`${definition.name} · ${definition.cost} Autoridade`}
            onClick={() => command(payload)}
          >
            <span>
              {definition.icon}{' '}
              {compact
                ? {
                    BLITZ_MARCH: 'Marcha',
                    WAR_BONDS: 'Tesouro',
                    ELITE_GUARD: 'Guarda',
                    SIEGE_BREAKER: 'Ruptura',
                    SABOTAGE_SUPPLY: 'Sabotagem',
                  }[definition.id]
                : definition.name}
            </span>
            <b>{definition.cost} 👑</b>
          </button>
        );
      })}
    </section>
  );
}
