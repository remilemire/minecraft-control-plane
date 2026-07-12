// apps/frontend/src/components/McPanel.tsx

import type { ReactNode } from "react";

interface McPanelProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

export function McPanel({ title, className = "", children }: McPanelProps) {
  return (
    <section className={`bg-panel mc-raised p-6 ${className}`}>
      {title !== undefined && <h2 className="mb-4 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}
