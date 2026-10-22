import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { FloatingWindow } from './FloatingWindow';
export function TopBarModal({
  id,
  title,
  children,
  onClose,
  footer,
}: {
  id: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
    };
    const outside = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('.map-stage')) close.current();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('click', outside);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('click', outside);
      if (previous?.isConnected) previous.focus();
    };
  }, [id]);
  return (
    <div className="strategy-backdrop" data-modal-backdrop>
      <FloatingWindow
        id={id}
        title={title}
        rootRef={root}
        role="dialog"
        anchor="center"
        width={940}
        height={680}
        minWidth={400}
        maxWidth={1200}
        minHeight={240}
        className={`strategy-modal ${id === 'result' ? 'campaign-result' : ''}`}
        bodyClassName="strategy-content"
        onClose={onClose}
        footer={footer}
      >
        <Suspense fallback={<p role="status">Abrindo conselho…</p>}>{children}</Suspense>
      </FloatingWindow>
    </div>
  );
}
