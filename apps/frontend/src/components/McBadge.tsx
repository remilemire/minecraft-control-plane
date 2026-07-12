// apps/frontend/src/components/McBadge.tsx

import type { ReactNode } from "react";

interface McBadgeProps {
  variant?: "success" | "danger" | "highlight" | "muted";
  children: ReactNode;
}

const VARIANT_CLASSES = {
  success: "text-success",
  danger: "text-danger",
  highlight: "text-highlight",
  muted: "text-muted",
} as const;

export function McBadge({ variant = "muted", children }: McBadgeProps) {
  return (
    <span className={`bg-slot mc-inset px-2 py-0.5 text-xs ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  );
}
