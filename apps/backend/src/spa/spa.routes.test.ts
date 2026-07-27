// apps/backend/src/spa/spa.routes.test.ts

import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSpaRoutes } from "./spa.routes.js";

const INDEX_HTML = "<!doctype html><title>spa fixture</title>";

let spaDir: string;
let app: express.Express;

beforeAll(() => {
  spaDir = mkdtempSync(path.join(tmpdir(), "spa-routes-"));
  writeFileSync(path.join(spaDir, "index.html"), INDEX_HTML);
  writeFileSync(path.join(spaDir, "favicon.svg"), "<svg></svg>");
  mkdirSync(path.join(spaDir, "assets"));
  writeFileSync(path.join(spaDir, "assets", "index-abc123.js"), "console.log('hashed');");

  app = express();
  app.use(createSpaRoutes(spaDir));
});

afterAll(() => {
  rmSync(spaDir, { recursive: true, force: true });
});

describe("createSpaRoutes", () => {
  it("serves hashed assets as immutable", async () => {
    const response = await request(app).get("/assets/index-abc123.js");

    expect(response.status).toBe(200);
    expect(response.text).toBe("console.log('hashed');");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("serves top-level files with revalidation", async () => {
    const response = await request(app).get("/favicon.svg");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("answers the root path with index.html", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe(INDEX_HTML);
  });

  it("answers deep links with index.html for the client router", async () => {
    const response = await request(app).get("/some/deep/link");

    expect(response.status).toBe(200);
    expect(response.text).toBe(INDEX_HTML);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("lets non-GET requests fall through", async () => {
    const response = await request(app).post("/some/deep/link");

    // Nothing else is mounted in this fixture app, so falling through the
    // router surfaces Express's default 404.
    expect(response.status).toBe(404);
  });
});
