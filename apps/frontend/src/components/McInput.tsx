// apps/frontend/src/components/McInput.tsx

import type { ComponentProps } from "react";

type McInputProps = ComponentProps<"input">;

export function McInput({ className = "", ...props }: McInputProps) {
  return (
    <input
      className={`mc-inset bg-slot placeholder:text-disabled hover:text-highlight focus-visible:outline-highlight disabled:text-disabled px-3 py-2 focus-visible:outline-2 ${className}`}
      {...props}
    />
  );
}
