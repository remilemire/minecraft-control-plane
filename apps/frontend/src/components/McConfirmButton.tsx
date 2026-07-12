// apps/frontend/src/components/McConfirmButton.tsx

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { McButton } from "./McButton";

type McConfirmButtonProps = Omit<ComponentProps<typeof McButton>, "onClick" | "children"> & {
  onConfirm: () => void;
  confirmLabel?: string;
  children: ReactNode;
};

const ARM_TIMEOUT_MS = 3_000;

/**
 * Destructive-action button: the first click arms it, a second click within
 * three seconds confirms.
 */
export function McConfirmButton({
  onConfirm,
  confirmLabel = "Are you sure?",
  children,
  ...props
}: McConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (armed) {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
      return;
    }

    setArmed(true);
    timerRef.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
  }

  return (
    <McButton variant="danger" onClick={handleClick} {...props}>
      {armed ? confirmLabel : children}
    </McButton>
  );
}
