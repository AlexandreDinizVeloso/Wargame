import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, Minus, MoveUpRight, Pin, X } from 'lucide-react';
interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  docked: boolean;
  minimized: boolean;
}
interface Props {
  id: string;
  title: string;
  icon?: ReactNode;
  anchor?: 'left' | 'right' | 'bottom';
  width?: number;
  height?: number;
  children: ReactNode;
  onClose: () => void;
  active?: boolean;
  onActivate?: () => void;
  className?: string;
}
let nextWindowZ = 40;
export function FloatingWindow({
  id,
  title,
  icon,
  anchor = 'left',
  width = 340,
  height = 570,
  children,
  onClose,
  active = false,
  onActivate,
  className = '',
}: Props) {
  const key = `concordia-v4-window-${id}`,
    root = useRef<HTMLElement>(null);
  const defaults = (): Geometry => ({
    x:
      anchor === 'right'
        ? innerWidth - width - 16
        : anchor === 'bottom'
          ? (innerWidth - width) / 2
          : 16,
    y: anchor === 'bottom' ? innerHeight - height - 24 : innerWidth < 700 ? 235 : 188,
    width,
    height,
    docked: true,
    minimized: false,
  });
  const [geometry, setGeometry] = useState<Geometry>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        saved &&
        ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved[k])) &&
        typeof saved.docked === 'boolean' &&
        typeof saved.minimized === 'boolean'
      )
        return saved;
    } catch {}
    return defaults();
  });
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight }),
    [raised, setRaised] = useState(false),
    [zIndex, setZIndex] = useState(() => ++nextWindowZ);
  useEffect(() => {
    if (active) setZIndex(++nextWindowZ);
  }, [active]);
  const gesture = useRef<{
    kind: 'drag' | 'resize';
    clientX: number;
    clientY: number;
    start: Geometry;
  } | null>(null);
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const usableWidth = Math.max(280, viewport.width - 16),
    usableHeight = Math.max(170, viewport.height - (viewport.width < 700 ? 270 : 184));
  const actualWidth = Math.min(usableWidth, Math.max(280, geometry.width)),
    actualHeight = Math.min(usableHeight, Math.max(170, geometry.height));
  const dock = defaults();
  const left = Math.max(
      8,
      Math.min(viewport.width - actualWidth - 8, geometry.docked ? dock.x : geometry.x),
    ),
    top = Math.max(
      viewport.width < 700 ? 174 : 118,
      Math.min(
        viewport.height - (geometry.minimized ? 42 : actualHeight) - 12,
        geometry.docked ? dock.y : geometry.y,
      ),
    );
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(geometry));
    } catch {}
  }, [geometry, key]);
  const begin = (event: React.PointerEvent, kind: 'drag' | 'resize') => {
    if (event.button !== 0) return;
    if (kind === 'drag' && event.target instanceof Element && event.target.closest('button'))
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      kind,
      clientX: event.clientX,
      clientY: event.clientY,
      start: {
        ...geometry,
        x: left,
        y: top,
        width: actualWidth,
        height: actualHeight,
        docked: false,
      },
    };
    setRaised(true);
  };
  const move = (event: React.PointerEvent) => {
    const drag = gesture.current;
    if (!drag) return;
    const dx = event.clientX - drag.clientX,
      dy = event.clientY - drag.clientY;
    setGeometry(
      drag.kind === 'drag'
        ? {
            ...drag.start,
            x: Math.max(8, Math.min(viewport.width - actualWidth - 8, drag.start.x + dx)),
            y: Math.max(
              viewport.width < 700 ? 174 : 118,
              Math.min(viewport.height - 50, drag.start.y + dy),
            ),
          }
        : {
            ...drag.start,
            width: Math.max(280, Math.min(usableWidth, drag.start.width + dx)),
            height: Math.max(170, Math.min(usableHeight, drag.start.height + dy)),
            minimized: false,
          },
    );
  };
  const end = (event: React.PointerEvent) => {
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <section
      ref={root}
      className={`floating-window ${geometry.docked ? 'docked' : 'undocked'} ${geometry.minimized ? 'minimized' : ''} ${raised ? 'raised' : ''} ${className}`}
      aria-label={title}
      data-window={id}
      data-docked={geometry.docked}
      onPointerDownCapture={() => {
        setRaised(true);
        setZIndex(++nextWindowZ);
        onActivate?.();
      }}
      style={{
        left,
        top,
        zIndex,
        width: actualWidth,
        height: geometry.minimized ? 42 : actualHeight,
      }}
    >
      <header
        className="window-title"
        onPointerDown={(e) => begin(e, 'drag')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span>
          {icon}
          <strong>{title}</strong>
        </span>
        <div className="window-controls">
          <button
            title={geometry.docked ? 'Desanexar janela' : 'Fixar janela'}
            aria-label={`${geometry.docked ? 'Desanexar' : 'Fixar'} ${title}`}
            onClick={() => setGeometry((g) => ({ ...g, x: left, y: top, docked: !g.docked }))}
          >
            {geometry.docked ? <MoveUpRight size={14} /> : <Pin size={14} />}
          </button>
          <button
            aria-label={`${geometry.minimized ? 'Restaurar' : 'Minimizar'} ${title}`}
            onClick={() => setGeometry((g) => ({ ...g, minimized: !g.minimized }))}
          >
            {geometry.minimized ? <Maximize2 size={14} /> : <Minus size={14} />}
          </button>
          <button aria-label={`Fechar ${title}`} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>
      {!geometry.minimized && (
        <>
          <div className="window-body">{children}</div>
          <button
            className="window-resize"
            title="Arraste para redimensionar"
            aria-label={`Redimensionar ${title}`}
            onPointerDown={(e) => begin(e, 'resize')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <Minimize2 size={12} />
          </button>
        </>
      )}
    </section>
  );
}
