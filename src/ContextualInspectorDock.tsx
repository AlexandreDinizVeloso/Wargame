import { FloatingWindow, type WindowProps } from './FloatingWindow';
export function ContextualInspectorDock(props: WindowProps) {
  const report = props.id === 'report';
  return (
    <FloatingWindow
      {...props}
      width={report ? 640 : 480}
      height={report ? 440 : 540}
      minWidth={400}
      maxWidth={report ? 1100 : 760}
      anchor={report ? 'right' : 'left'}
      className={`inspector-dock ${report ? 'report-dock' : ''}`}
      bodyClassName="inspector-body"
      hudSurface
    />
  );
}
