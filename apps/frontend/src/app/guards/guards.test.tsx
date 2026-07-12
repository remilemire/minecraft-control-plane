// apps/frontend/src/app/guards/guards.test.tsx

import { makeAuthValue, makeUser, renderWithAuth } from "@test/helpers/auth";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { RequireAdmin } from "./RequireAdmin";
import { RequireAuth } from "./RequireAuth";
import { RequireGuest } from "./RequireGuest";

function TestRoutes() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<p>Login page</p>} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route index element={<p>Home page</p>} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<p>Admin page</p>} />
        </Route>
      </Route>
    </Routes>
  );
}

describe("route guards", () => {
  it("shows a loading state while the session is being restored", () => {
    renderWithAuth(<TestRoutes />, {
      auth: makeAuthValue({ status: "loading", user: null }),
    });

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("redirects unauthenticated visitors to the login page", () => {
    renderWithAuth(<TestRoutes />, {
      auth: makeAuthValue({ status: "unauthenticated", user: null }),
    });

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected page for authenticated users", () => {
    renderWithAuth(<TestRoutes />);

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("redirects authenticated users away from the login page", () => {
    renderWithAuth(<TestRoutes />, { route: "/login" });

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("redirects non-admins away from admin routes", () => {
    renderWithAuth(<TestRoutes />, { route: "/admin" });

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("lets admins through to admin routes", () => {
    renderWithAuth(<TestRoutes />, {
      auth: makeAuthValue({ user: makeUser({ isAdmin: true }) }),
      route: "/admin",
    });

    expect(screen.getByText("Admin page")).toBeInTheDocument();
  });
});
