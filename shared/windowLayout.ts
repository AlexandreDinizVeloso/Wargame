export const DOCK_EDGE_MARGIN = 16;
export const DOCK_BOTTOM_MARGIN = 56;
export type WindowAnchor = 'left' | 'right' | 'bottom' | 'center';
export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}
/** Pure viewport placement shared by the renderer and acceptance checks. */
export function defaultDockGeometry(
  viewport: { width: number; height: number },
  requestedWidth: number,
  requestedHeight: number,
  anchor: WindowAnchor,
): WindowGeometry {
  const width = Math.min(requestedWidth, viewport.width - DOCK_EDGE_MARGIN);
  const height = Math.min(
    requestedHeight,
    viewport.height * (anchor === 'center' ? 0.8 : 0.72),
    viewport.height - 130,
  );
  return {
    width,
    height,
    minimized: false,
    x:
      anchor === 'center' || anchor === 'bottom'
        ? (viewport.width - width) / 2
        : anchor === 'right'
          ? viewport.width - width - DOCK_EDGE_MARGIN
          : DOCK_EDGE_MARGIN,
    y:
      anchor === 'center'
        ? Math.max(116, (viewport.height - height) / 2)
        : Math.max(116, viewport.height - height - DOCK_BOTTOM_MARGIN),
  };
}
