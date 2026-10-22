import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { WindowProps } from './FloatingWindow';
export default function CampaignPanel({ id, title, icon, onClose, children }: WindowProps) {
  const contextual = id === 'province' || id === 'battalion',
    root = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (contextual) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      const elements = Array.from(
        root.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (!first) {
        e.preventDefault();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === root.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || document.activeElement === root.current)
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    root.current?.addEventListener('keydown', keyboard);
    const current = root.current;
    return () => {
      current?.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [contextual]);
  const card = (
    <section
      ref={root}
      className={`campaign-panel ${contextual ? 'context-panel' : 'consultation-panel'}`}
      role={contextual ? 'region' : 'dialog'}
      aria-label={title}
      aria-modal={contextual ? undefined : true}
      tabIndex={-1}
      data-window={id}
      data-context-panel={contextual || undefined}
    >
      <header className="window-title">
        <span>
          {icon}
          <strong>{title}</strong>
        </span>
        <div className="window-controls">
          <button aria-label={`Fechar ${title}`} onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="window-body">{children}</div>
    </section>
  );
  return contextual ? (
    card
  ) : (
    <div
      className="consultation-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {card}
    </div>
  );
}
