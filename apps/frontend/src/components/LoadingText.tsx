// apps/frontend/src/components/LoadingText.tsx

interface LoadingTextProps {
  label?: string;
}

export function LoadingText({ label = "Loading..." }: LoadingTextProps) {
  return (
    <p role="status" className="text-muted">
      {label}
    </p>
  );
}
