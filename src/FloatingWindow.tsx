import {
  defaultDockGeometry,
  type WindowAnchor,
  type WindowGeometry,
} from '../shared/windowLayout';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Maximize2, Minus, X } from 'lucide-react';
import { OrnatePanelFrame } from './ui';
type Geometry = WindowGeometry;
type GestureKind = 'drag' | 'right' | 'bottom' | 'corner';
export interface WindowProps {
  id: string;
  title: string;
  icon?: ReactNode;
  anchor?: WindowAnchor;
  width?: number;
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  active?: boolean;
  onActivate?: () => void;
  className?: string;
  bodyClassName?: string;
  role?: 'dialog' | 'region';
  rootRef?: RefObject<HTMLElement | null>;
  hudSurface?: boolean;
}
export function FloatingWindow({
  id,
  title,
  icon,
  anchor = 'left',
  width = 480,
  height = 540,
  minWidth = 400,
  maxWidth = 760,
  minHeight = 240,
  children,
  footer,
  headerActions,
  onClose,
  active = false,
  onActivate,
  className = '',
  bodyClassName = '',
  role = 'region',
  rootRef,
  hudSurface = false,
}: WindowProps) {
  const key = `concordia-v095-window-${id}`;
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const defaults = (): Geometry =>
    defaultDockGeometry({ width: innerWidth, height: innerHeight }, width, height, anchor);
  const [geometry, setGeometry] = useState<Geometry>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        v &&
        ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(v[k])) &&
        typeof v.minimized === 'boolean'
      )
        return v;
    } catch {}
    return defaults();
  });
  const gesture = useRef<{ kind: GestureKind; x: number; y: number; start: Geometry } | null>(null);
  const actualWidth = Math.min(viewport.width - 16, maxWidth, Math.max(minWidth, geometry.width));
  const actualHeight = Math.min(viewport.height - 16, Math.max(minHeight, geometry.height));
  const visibleHeight = geometry.minimized ? 42 : actualHeight;
  const left = Math.max(8, Math.min(viewport.width - actualWidth - 8, geometry.x));
  const top = Math.max(8, Math.min(viewport.height - visibleHeight - 8, geometry.y));
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(geometry));
    } catch {}
  }, [geometry, key]);
  const begin = (e: React.PointerEvent, kind: GestureKind) => {
    if (
      e.button !== 0 ||
      (kind === 'drag' && e.target instanceof Element && e.target.closest('button,input,select'))
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind,
      x: e.clientX,
      y: e.clientY,
      start: { ...geometry, x: left, y: top, width: actualWidth, height: actualHeight },
    };
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    setGeometry(
      g.kind === 'drag'
        ? {
            ...g.start,
            x: Math.max(8, Math.min(viewport.width - actualWidth - 8, g.start.x + dx)),
            y: Math.max(8, Math.min(viewport.height - visibleHeight - 8, g.start.y + dy)),
          }
        : {
            ...g.start,
            minimized: false,
            width:
              g.kind === 'bottom'
                ? g.start.width
                : Math.min(
                    maxWidth,
                    viewport.width - g.start.x - 8,
                    Math.max(minWidth, g.start.width + dx),
                  ),
            height:
              g.kind === 'right'
                ? g.start.height
                : Math.min(
                    viewport.height - g.start.y - 8,
                    Math.max(minHeight, g.start.height + dy),
                  ),
          },
    );
  };
  const end = (e: React.PointerEvent) => {
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return (
    <section
      ref={rootRef}
      role={role}
      tabIndex={-1}
      aria-label={title}
      className={`floating-window framed-panel ${geometry.minimized ? 'minimized' : ''} ${className}`}
      data-window={id}
      data-context-panel={id === 'province' || id === 'battalion' || undefined}
      data-hud-surface={hudSurface || undefined}
      onPointerDownCapture={() => onActivate?.()}
      onFocusCapture={() => onActivate?.()}
      style={{ left, top, width: actualWidth, height: visibleHeight, zIndex: active ? 76 : 72 }}
    >
      <OrnatePanelFrame variant="window" seal={geometry.minimized ? 'none' : 'bottom-left'} />
      <header
        className="window-title"
        onPointerDown={(e) => begin(e, 'drag')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="window-heading">
          {icon}
          <strong role="heading" aria-level={2}>
            {title}
          </strong>
        </span>
        <div className="window-controls">
          {headerActions}
          <button
            aria-label={`Restaurar tamanho e posição de ${title}`}
            title="Restaurar tamanho e posição"
            onClick={() => setGeometry(defaults())}
          >
            ↺
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
          <div className={`window-body ${bodyClassName}`}>{children}</div>
          {footer && <footer className="strategy-modal-footer">{footer}</footer>}
          {(['right', 'bottom', 'corner'] as const).map((kind) => (
            <button
              key={kind}
              className={`window-resize-handle resize-${kind}`}
              aria-label={`Redimensionar ${title}: ${kind === 'right' ? 'largura' : kind === 'bottom' ? 'altura' : 'canto'}`}
              onPointerDown={(e) => begin(e, kind)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                e.preventDefault();
                setGeometry((g) => ({
                  ...g,
                  width: Math.min(
                    maxWidth,
                    viewport.width - left - 8,
                    Math.max(
                      minWidth,
                      actualWidth + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0),
                    ),
                  ),
                  height: Math.min(
                    viewport.height - top - 8,
                    Math.max(
                      minHeight,
                      actualHeight + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0),
                    ),
                  ),
                }));
              }}
            />
          ))}
        </>
      )}
    </section>
  );
}
