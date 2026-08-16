// apps/frontend/src/components/McPanel.tsx

import type { ReactNode } from "react";

interface McPanelProps {
  title?: string;
  // Panel-wide controls, right-aligned on the title row. For something that
  // acts on the panel as a whole (Refresh); a control that belongs to one row
  // or one field stays down there with it.
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function McPanel({ title, actions, className = "", children }: McPanelProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <section className={`bg-panel mc-raised p-6 ${className}`}>
      {hasHeader && (
        <div className="mb-4 flex min-h-8 items-center gap-3">
          {title !== undefined && <h2 className="text-lg font-bold">{title}</h2>}
          {actions !== undefined && <div className="ml-auto">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
