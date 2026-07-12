// apps/frontend/src/components/McButton.tsx

import type { ComponentProps } from "react";

type McButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "danger";
};

export function McButton({
  variant = "default",
  className = "",
  type = "button",
  ...props
}: McButtonProps) {
  const variantClasses = variant === "danger" ? "text-danger" : "";

  return (
    <button
      type={type}
      className={`mc-raised bg-slot-raised enabled:hover:bg-slot-hover enabled:hover:text-highlight focus-visible:outline-highlight disabled:bg-slot disabled:text-disabled cursor-pointer px-4 py-2 font-bold focus-visible:outline-2 disabled:cursor-not-allowed ${variantClasses} ${className}`}
      {...props}
    />
  );
}
