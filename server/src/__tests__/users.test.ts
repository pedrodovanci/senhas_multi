import request from "supertest";
import { startServer } from "../index";

describe("/api/users exclui medico", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const login = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = login.body.token;

    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Oculto",
        specialization: "Clinica",
        prefix: "DOC",
        username: "dr_oculto",
        password: "senha",
      });
    expect(doctor.body.medico_username).toBe("dr_oculto");
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("GET /api/users não inclui contas medico", async () => {
    const res = await request(ctx.app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.some((u: any) => u.username === "dr_oculto")).toBe(false);
  });

  it("POST /api/users rejeita role medico", async () => {
    const res = await request(ctx.app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "tentativa_medico", password: "senha", role: "medico" });

    expect(res.status).toBe(400);
  });

  it("PUT /api/users/:id rejeita role medico", async () => {
    const attendant = await request(ctx.app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "atendente_normal", password: "senha", role: "attendant" });

    const res = await request(ctx.app)
      .put(`/api/users/${attendant.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "atendente_normal", role: "medico", active: true });

    expect(res.status).toBe(400);
  });
});
