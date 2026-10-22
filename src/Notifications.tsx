import { useEffect, useRef, useState } from 'react';
import type { GameView, GameNotification } from '../shared/types';
import type { Command } from './ui';
import { audio } from './audio';
export function NotificationCard({
  notice,
  game,
  playerId,
  command,
  onFocus,
  onRead,
}: {
  notice: GameNotification;
  game: GameView;
  playerId: string;
  command: Command;
  onFocus: (id: string) => void;
  onRead?: () => void;
}) {
  const offer = notice.offerId
    ? game.offers.find((o) => o.id === notice.offerId && o.to === playerId)
    : null;
  const read = () => {
    command({ type: 'READ_NOTIFICATIONS', notificationIds: [notice.id] });
    onRead?.();
  };
  return (
    <article
      className={`notification-card severity-${notice.severity.toLowerCase()}`}
      data-notification={notice.type}
      data-notification-id={notice.id}
    >
      <header>
        <strong>
          {notice.severity === 'CRITICAL' ? '🚨' : notice.severity === 'WARNING' ? '⚠️' : '🔔'}{' '}
          Rodada {notice.turn}
        </strong>
        <button onClick={read} aria-label="Marcar alerta como lido">
          ✓
        </button>
      </header>
      <p>{notice.text}</p>
      <div className="notification-actions">
        {notice.focusProvinceId && (
          <button
            onClick={() => {
              onFocus(notice.focusProvinceId!);
              read();
            }}
          >
            📍 Focar no Mapa
          </button>
        )}
        {offer && (
          <>
            <button
              onClick={() => {
                command({ type: 'ANSWER_OFFER', offerId: offer.id, accept: true });
                read();
              }}
            >
              ✅ Aceitar
            </button>
            <button
              onClick={() => {
                command({ type: 'ANSWER_OFFER', offerId: offer.id, accept: false });
                read();
              }}
            >
              ❌ Recusar
            </button>
          </>
        )}
      </div>
    </article>
  );
}
export default function PersonalAlerts({
  game,
  playerId,
  command,
  onFocus,
  compact = false,
  onShowAll,
}: {
  compact?: boolean;
  onShowAll?: () => void;
  game: GameView;
  playerId: string;
  command: Command;
  onFocus: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const seen = useRef(new Set<string>()),
    read = new Set(game.readNotificationIds);
  const pending = game.notifications.filter(
    (n) =>
      n.type !== 'WORLD' &&
      n.severity === 'CRITICAL' &&
      n.involvesPlayerIds.includes(playerId) &&
      !read.has(n.id),
  );
  useEffect(() => {
    let fresh = false;
    for (const n of pending)
      if (!seen.current.has(n.id)) {
        seen.current.add(n.id);
        fresh = true;
      }
    if (fresh) audio.play('alert');
  }, [pending.map((n) => n.id).join()]);
  if (!pending.length) return null;
  return (
    <aside
      className="personal-alerts"
      aria-label="Alertas pessoais críticos"
      aria-live="polite"
      data-hud-surface
    >
      <button
        className="critical-alert-badge"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        🔔 Alertas críticos ({pending.length})
      </button>
      {expanded && (
        <>
          <div className="alert-count">
            {pending.length} alerta(s) pendente(s)
            {compact && pending.length > 1 && <button onClick={onShowAll}>Ver todos</button>}
          </div>
          {pending
            .slice(-8)
            .reverse()
            .map((n) => (
              <NotificationCard
                key={n.id}
                notice={n}
                game={game}
                playerId={playerId}
                command={command}
                onFocus={onFocus}
              />
            ))}
        </>
      )}
    </aside>
  );
}
