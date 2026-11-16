import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
export function createRequireBearerToken(token: string): RequestHandler {
  const expected = Buffer.from(`Bearer ${token}`);

  return (req, res, next) => {
    const provided = Buffer.from(req.get("authorization") ?? "");

    // timingSafeEqual demands equal lengths; a length mismatch is already a
    // rejection, and comparing against `expected` twice keeps the timing flat.
    const matches = provided.length === expected.length && timingSafeEqual(provided, expected);

    if (!matches) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }
    next();
  };
}
