import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export interface CenterTab {
  id: string;
  label: string;
  icon: ReactNode;
}
export function TopBarModal({
  id,
  title,
  children,
  onClose,
  tabs,
  tab,
  onTabChange,
  footer,
}: {
  id: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  tabs?: CenterTab[];
  tab?: string;
  onTabChange?: (id: string) => void;
}) {
  const root = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = root.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? [],
      ).filter((e) => e.getClientRects().length > 0 && !e.closest('[hidden]'));
    (
      node?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      focusable()[0] ??
      node
    )?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          node?.focus();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first || !node?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || !node?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [id]);
  return (
    <div
      className="strategy-backdrop"
      data-modal-backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={root}
        className={`strategy-modal ${id === 'result' ? 'campaign-result' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-window={id}
      >
        <header>
          <div>
            <span className="eyebrow">CONCÓRDIA · CONSELHO ESTRATÉGICO</span>
            <h2>{title}</h2>
          </div>
          <button aria-label={`Fechar ${title}`} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {tabs && (
          <nav className="strategy-tabs" role="tablist" aria-label="Conselhos da campanha">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                id={`center-tab-${t.id}`}
                role="tab"
                aria-controls="center-content"
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => onTabChange?.(t.id)}
                onKeyDown={(e) => {
                  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    const next =
                      e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? tabs.length - 1
                          : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                    onTabChange?.(tabs[next].id);
                    requestAnimationFrame(() =>
                      document.getElementById(`center-tab-${tabs[next].id}`)?.focus(),
                    );
                  }
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
        <div
          className="strategy-content"
          id={tabs ? 'center-content' : undefined}
          role={tabs ? 'tabpanel' : undefined}
          aria-labelledby={tabs ? `center-tab-${tab}` : undefined}
        >
          <Suspense fallback={<p role="status">Abrindo conselho…</p>}>{children}</Suspense>
        </div>
        {footer && <footer className="strategy-modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}
