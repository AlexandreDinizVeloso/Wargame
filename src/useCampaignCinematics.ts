import { useCallback, useEffect, useRef, useState } from 'react';
import { seasonAt } from '../shared/world';
import type { GameView, Season } from '../shared/types';

type CampaignCinematic =
  | { id: string; type: 'season'; turn: number; season: Season }
  | { id: string; type: 'war'; warId: string };
type Seen = { wars: string[]; seasonStart: number };

/** Snapshot changes queue cinematics once; loading an existing campaign never replays its wars. */
export function useCampaignCinematics(game: GameView | null, playerId: string, snapshotEpoch = 0) {
  const [queue, setQueue] = useState<CampaignCinematic[]>([]);
  const history = useRef<{ key: string; seen: Seen; epoch: number } | null>(null);
  useEffect(() => {
    if (!game || !playerId) return;
    const key = `concordia-v110-cinematics-${game.code}-${playerId}`;
    const initial = history.current?.key !== key || history.current.epoch !== snapshotEpoch;
    if (initial) {
      let seen: Seen = { wars: game.wars.map((war) => war.id), seasonStart: 0 };
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (
          stored &&
          typeof stored === 'object' &&
          'wars' in stored &&
          'seasonStart' in stored &&
          Array.isArray(stored.wars) &&
          stored.wars.every((id) => typeof id === 'string') &&
          Number.isInteger(stored.seasonStart)
        )
          seen = stored as Seen;
      } catch {}
      // Every war in an initial snapshot predates this live connection.
      seen.wars = [...new Set([...seen.wars, ...game.wars.map((war) => war.id)])];
      history.current = { key, seen, epoch: snapshotEpoch };
      setQueue([]);
    }
    const seen = history.current!.seen;
    const events: CampaignCinematic[] = [];
    const seasonStart = Math.floor((game.turn - 1) / 3) * 3 + 1;
    if (game.phase === 'planning' && game.turn > 0 && seen.seasonStart !== seasonStart) {
      if (!initial || game.turn === seasonStart)
        events.push({
          id: `${game.code}-season-${seasonStart}`,
          type: 'season',
          turn: seasonStart,
          season: seasonAt(game.turn),
        });
      seen.seasonStart = seasonStart;
    }
    for (const war of game.wars) {
      if (seen.wars.includes(war.id)) continue;
      seen.wars.push(war.id);
      if (war.active && [...war.attackerIds, ...war.defenderIds].includes(playerId))
        events.push({ id: `${game.code}-war-${war.id}`, type: 'war', warId: war.id });
    }
    if (events.length) setQueue((previous) => [...previous, ...events]);
    try {
      sessionStorage.setItem(key, JSON.stringify(seen));
    } catch {}
  }, [game?.code, game?.phase, game?.turn, game?.wars, playerId, snapshotEpoch]);
  const complete = useCallback(() => setQueue((previous) => previous.slice(1)), []);
  return { cinematic: queue[0], complete };
}
