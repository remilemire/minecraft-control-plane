// apps/frontend/src/pages/NotFoundPage.tsx

import { McPanel } from "@/components/McPanel";
import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <McPanel className="text-center">
        <h1 className="mb-2 text-2xl font-bold">404</h1>
        <p className="text-muted mb-4">This page does not exist.</p>
        <Link to="/" className="hover:text-highlight underline">
          Back to safety
        </Link>
      </McPanel>
    </div>
  );
}
