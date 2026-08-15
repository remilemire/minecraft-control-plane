// apps/backend/src/features/users/users.repository.integration.test.ts

import { db, DatabaseProvider } from "@/infrastructure/db/index.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./users.repository.js";

describe("UserRepository", () => {
  const repository = new UserRepository(new DatabaseProvider(db));

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

  it("finds a user by email, and returns null for an unknown one", async () => {
    const existing = await createUser();

    expect(await repository.findByEmail(existing.email)).toEqual(existing);
    expect(await repository.findByEmail("nobody@example.com")).toBeNull();
  });

  it("creates users as non-owners by default", async () => {
    const created = await repository.create({ email: `${randomUUID()}@example.com` });

    expect(created.isOwner).toBe(false);
  });

  it("finds the owner, and returns null when none exists", async () => {
    expect(await repository.findOwner()).toBeNull();

    const owner = await createUser({ isOwner: true });

    expect(await repository.findOwner()).toEqual(owner);
  });

  // The single-owner invariant lives in the database (partial unique index),
  // so a lost race is deterministic to reproduce: the second insert fails.
  it("maps a second owner insert to OWNER_ALREADY_EXISTS", async () => {
    await createUser({ isOwner: true });

    await expect(
      repository.create({ email: `${randomUUID()}@example.com`, isOwner: true }),
    ).rejects.toMatchObject({
      code: "OWNER_ALREADY_EXISTS",
    });
  });

  it("demotes only a current owner: clearOwner returns null for a non-owner", async () => {
    const owner = await createUser({ isOwner: true });
    const regular = await createUser();

    expect(await repository.clearOwner(regular.id)).toBeNull();

    const demoted = await repository.clearOwner(owner.id);
    expect(demoted).toMatchObject({ id: owner.id, isOwner: false });
  });

  it("promotes a user with setOwner, and maps the violation while an owner exists", async () => {
    const owner = await createUser({ isOwner: true });
    const target = await createUser();

    await expect(repository.setOwner(target.id)).rejects.toMatchObject({
      code: "OWNER_ALREADY_EXISTS",
    });

    await repository.clearOwner(owner.id);

    expect(await repository.setOwner(target.id)).toMatchObject({ id: target.id, isOwner: true });
    expect(await repository.setOwner(randomUUID())).toBeNull();
  });
});
