import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
export function ContextualInspectorDock({
  id,
  title,
  children,
  onClose,
}: {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section
      className={`inspector-dock ${id === 'report' ? 'report-dock' : ''} ${collapsed ? 'collapsed' : ''}`}
      aria-label={title}
      data-window={id}
      data-context-panel={id === 'province' || id === 'battalion' || undefined}
      data-hud-surface
    >
      <header>
        <strong>{title}</strong>
        <div>
          <button
            aria-label={`${collapsed ? 'Restaurar' : 'Recolher'} ${title}`}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button aria-label={`Fechar ${title}`} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </header>
      {!collapsed && <div className="inspector-body">{children}</div>}
    </section>
  );
}
