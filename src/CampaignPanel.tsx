import { Suspense } from 'react';
import type { WindowProps } from './FloatingWindow';
import { ContextualInspectorDock } from './ContextualInspectorDock';
export default function CampaignPanel({ children, ...props }: WindowProps) {
  return (
    <ContextualInspectorDock {...props}>
      <Suspense fallback={<p role="status">Abrindo relatório…</p>}>{children}</Suspense>
    </ContextualInspectorDock>
  );
}
