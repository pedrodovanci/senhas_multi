import { initDb } from "../database";

describe("database migrations", () => {
  it("cria a coluna doctors.room", async () => {
    const db = await initDb(":memory:");
    const columns = await db.all("PRAGMA table_info(doctors)");
    const names = columns.map((c: any) => c.name);
    expect(names).toContain("room");
    await db.close();
  });

  it("aceita role 'medico' e tem coluna doctor_id única", async () => {
    const db = await initDb(":memory:");
    const columns = await db.all("PRAGMA table_info(users)");
    const names = columns.map((c: any) => c.name);
    expect(names).toContain("doctor_id");

    const insertResult = await db.run(
      "INSERT INTO doctors (name, specialization, prefix) VALUES ('Dr. Teste', 'Clinica', 'TST')",
    );
    const doctorId = insertResult.lastID;

    await db.run(
      "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
      ["medico_teste", "hash", doctorId],
    );

    await expect(
      db.run(
        "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
        ["medico_teste2", "hash", doctorId],
      ),
    ).rejects.toThrow();

    await db.close();
  });
});
