// apps/frontend/test/helpers/auth.tsx

import { AuthContext, type AuthContextValue } from "@/app/providers/auth-context";
import type { User } from "@/features/users/api";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
    email: "steve@example.com",
    fullName: "Steve Miner",
    isOwner: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: makeUser(),
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

interface RenderWithAuthOptions {
  auth?: AuthContextValue;
  route?: string;
}

export function renderWithAuth(
  ui: ReactNode,
  { auth = makeAuthValue(), route = "/" }: RenderWithAuthOptions = {},
): RenderResult {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}
