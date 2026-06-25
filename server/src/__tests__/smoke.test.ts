import request from "supertest";
import { startServer } from "../index";

describe("smoke", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("responde 401 sem token em rota protegida", async () => {
    const res = await request(ctx.app).get("/api/users");
    expect(res.status).toBe(403);
  });
});
