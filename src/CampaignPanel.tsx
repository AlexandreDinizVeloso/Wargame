import { Suspense } from 'react';
import type { WindowProps } from './FloatingWindow';
import { ContextualInspectorDock } from './ContextualInspectorDock';
export default function CampaignPanel({ id, title, children, onClose }: WindowProps) {
  return (
    <ContextualInspectorDock id={id} title={title} onClose={onClose}>
      <Suspense fallback={<p role="status">Abrindo relatório…</p>}>{children}</Suspense>
    </ContextualInspectorDock>
  );
}
