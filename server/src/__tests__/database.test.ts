import { initDb } from "../database";

describe("database migrations", () => {
  it("cria a coluna doctors.room", async () => {
    const db = await initDb(":memory:");
    const columns = await db.all("PRAGMA table_info(doctors)");
    const names = columns.map((c: any) => c.name);
    expect(names).toContain("room");
    await db.close();
  });
});
