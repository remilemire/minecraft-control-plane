// apps/backend/src/features/users/users.repository.integration.test.ts

import { db } from "@/db/client.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./users.repository.js";

describe("UserRepository", () => {
  const repository = new UserRepository(db);

  it("creates a user and finds it by id", async () => {
    const created = await repository.create({
      email: `${randomUUID()}@example.com`,
    });

    expect(await repository.findById(created.id)).toEqual(created);
  });

  it("lists every user ordered by creation date", async () => {
    const first = await createUser();
    const second = await createUser();

    const all = await repository.findAll();

    expect(all).toEqual(expect.arrayContaining([first, second]));
    const timestamps = all.map((user) => user.createdAt.getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("returns null for an unknown id", async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
  });

  it("maps a duplicate email to EMAIL_TAKEN", async () => {
    const existing = await createUser();

    await expect(repository.create({ email: existing.email })).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });
});
