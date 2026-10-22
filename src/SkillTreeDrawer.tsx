import { getNationAuthority } from '../shared/economy';
import { BRANCHES, SKILLS, skillBlock } from '../shared/military';
import type { GameView } from '../shared/types';
import { technologyCost } from '../shared/world';
import type { Command } from './ui';
export default function SkillTreeDrawer({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!;
  return (
    <div className="skill-tree-ledger">
      <h2>🎖️ Doutrinas & Árvore de Tropas</h2>
      <p className="xp-balance">
        {getNationAuthority(me)} Autoridade · doutrinas, diplomacia e decretos
      </p>
      {Object.entries(BRANCHES).map(([branch, title]) => (
        <section className="skill-branch" key={branch}>
          <h3>{title}</h3>
          <div className="skill-nodes">
            {SKILLS.filter((s) => s.branch === branch).map((s) => {
              const done = me.unlockedSkills.includes(s.id),
                reason = skillBlock(me, s.id, game);
              return (
                <article
                  className={`skill-node tier-${s.tier} ${done ? 'unlocked' : ''}`}
                  key={s.id}
                >
                  <small>
                    NÍVEL {s.tier} · {technologyCost(game, s.tier, s.cost)} Autoridade
                    {s.tier === 2 ? ' · ESCOLHA EXCLUSIVA A/B' : ''}
                  </small>
                  <strong>{s.name}</strong>
                  <p>{s.description}</p>
                  <button
                    title={reason ?? ''}
                    disabled={done || !!reason || me.ready || game.phase !== 'planning'}
                    onClick={() => command({ type: 'UNLOCK_SKILL', skillId: s.id })}
                  >
                    {done
                      ? '✓ Desbloqueada'
                      : me.ready
                        ? 'Reabra suas ordens'
                        : (reason ??
                          `Desbloquear · ${technologyCost(game, s.tier, s.cost)} Autoridade`)}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
