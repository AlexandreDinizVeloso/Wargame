import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleReport, GameView, TurnResolutionReport } from '../../shared/types';
import { CINEMATIC_DURATION } from '../../shared/cinematics';
import { verticalRules } from '../../shared/fogOfWar';
import { audio } from '../audio';
import { buildBattlePlaylist } from './battlePresentation';

interface Replay {
  report: TurnResolutionReport;
  progress: number;
  nonce: number;
  battles: BattleReport[];
  manual: boolean;
}
interface Screening {
  battles: BattleReport[];
  index: number;
  manual: boolean;
}

/** Presents an already resolved, viewer-filtered report. Never changes the campaign clock. */
export function useBattlePresentation(
  game: GameView | null,
  playerId: string,
  campaignBusy: boolean,
  autoplayBattles: boolean,
  snapshotEpoch = 0,
) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [screening, setScreening] = useState<Screening | null>(null);
  const context = useRef({ playerId, autoplayBattles });
  context.current = { playerId, autoplayBattles };
  const generation = useRef(0);
  const clock = useRef<{ nonce: number; elapsed: number } | null>(null);
  const seenReport = useRef<{ code: string; reportTurn: number | null; epoch: number } | null>(
    null,
  );
  const resetPresentation = useCallback(() => {
    setReplay(null);
    setScreening(null);
  }, []);
  const beginReplay = useCallback((report: TurnResolutionReport, manual: boolean) => {
    setScreening(null);
    const battles =
      manual || context.current.autoplayBattles
        ? buildBattlePlaylist(report, context.current.playerId, {
            includeOtherVisibleBattles: manual,
          })
        : [];
    setReplay({ report, progress: 0, nonce: ++generation.current, battles, manual });
  }, []);
  const playReplay = useCallback(
    (report: TurnResolutionReport) => {
      audio.unlock();
      beginReplay(report, true);
    },
    [beginReplay],
  );
  const showBattle = useCallback((battle: BattleReport) => {
    audio.unlock();
    setReplay(null);
    setScreening({ battles: [battle], index: 0, manual: true });
  }, []);
  const advanceBattle = useCallback(
    () =>
      setScreening((current) =>
        current && current.index + 1 < current.battles.length
          ? { ...current, index: current.index + 1 }
          : null,
      ),
    [],
  );

  useEffect(() => {
    if (!game) {
      seenReport.current = null;
      resetPresentation();
      return;
    }
    const previous = seenReport.current;
    seenReport.current = {
      code: game.code,
      reportTurn: game.lastReport?.turn ?? null,
      epoch: snapshotEpoch,
    };
    if (previous?.code !== game.code || previous.epoch !== snapshotEpoch) resetPresentation();
    // Initial loads and reconnects do not replay old battles.
    else if (game.lastReport && game.lastReport.turn > (previous.reportTurn ?? 0))
      beginReplay(game.lastReport, false);
  }, [game?.code, game?.lastReport?.turn, beginReplay, resetPresentation, snapshotEpoch]);

  const modern = verticalRules(game);
  useEffect(() => {
    if (!replay || campaignBusy) return;
    const current =
      clock.current?.nonce === replay.nonce ? clock.current : { nonce: replay.nonce, elapsed: 0 };
    clock.current = current;
    const duration = 1500;
    const before = current.elapsed;
    let started = performance.now();
    let frame = 0;
    let published = 0;
    let pausedAt = document.hidden ? performance.now() : 0;
    let marchPlayed = before >= 350;
    let peacePlayed = before >= 700;
    if (before === 0) audio.play('horn');
    const visibility = () => {
      if (document.hidden) pausedAt = performance.now();
      else if (pausedAt) {
        started += performance.now() - pausedAt;
        pausedAt = 0;
      }
    };
    document.addEventListener('visibilitychange', visibility);
    const tick = (time: number) => {
      if (document.hidden) {
        frame = requestAnimationFrame(tick);
        return;
      }
      current.elapsed = Math.min(duration, before + time - started);
      if (!marchPlayed && current.elapsed >= 350) {
        marchPlayed = true;
        if (replay.report.movements.some((move) => !move.isFleet)) audio.playMarchSound();
        if (replay.report.movements.some((move) => move.isFleet)) audio.playSailSound();
      }
      if (!peacePlayed && current.elapsed >= 700) {
        peacePlayed = true;
        if (replay.report.diplomaticChanges.some((change) => change.action === 'PEACE'))
          audio.play('peace');
      }
      if (current.elapsed >= duration) {
        setReplay(null);
        if (replay.battles.length)
          setScreening({ battles: replay.battles, index: 0, manual: replay.manual });
        return;
      }
      // Canvas and CSS animate independently; map state need not rerender at display frequency.
      if (time - published >= 1000 / 30) {
        published = time;
        setReplay((value) =>
          value?.nonce === replay.nonce
            ? { ...value, progress: current.elapsed / duration }
            : value,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [replay?.nonce, campaignBusy, modern]);

  return {
    replay,
    tacticalBattle: screening?.battles[screening.index] ?? null,
    battleIndex: screening?.index ?? 0,
    battleCount: screening?.battles.length ?? 0,
    battleAutoAdvance: screening ? !screening.manual : true,
    playReplay,
    showBattle,
    advanceBattle,
    skipPresentation: resetPresentation,
    resetPresentation,
  };
}
