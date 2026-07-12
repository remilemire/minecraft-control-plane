// apps/frontend/src/components/ErrorText.tsx

import type { ApiError } from "@/lib/apiClient";

interface ErrorTextProps {
  error: ApiError | string | null;
  className?: string;
}

export function ErrorText({ error, className = "" }: ErrorTextProps) {
  if (error === null) return null;

  const message = typeof error === "string" ? error : error.message;

  return (
    <p role="alert" className={`text-danger ${className}`}>
      {message}
    </p>
  );
}
