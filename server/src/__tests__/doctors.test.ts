import request from "supertest";
import jwt from "jsonwebtoken";
import { startServer } from "../index";

describe("/api/doctors com login de medico", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const login = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = login.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("cria medico sem login quando username/senha não são enviados", async () => {
    const res = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Sem Login", specialization: "Clinica", prefix: "DSL", room: "Sala 1" });

    expect(res.status).toBe(200);
    expect(res.body.room).toBe("Sala 1");
    expect(res.body.medico_username).toBeNull();
  });

  it("cria medico com login quando username/senha são enviados", async () => {
    const res = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Com Login",
        specialization: "Clinica",
        prefix: "DCL",
        room: "Sala 2",
        username: "dr_login",
        password: "senha123",
      });

    expect(res.status).toBe(200);
    expect(res.body.medico_username).toBe("dr_login");

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_login", password: "senha123" });
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.user.role).toBe("medico");
    const decoded = jwt.decode(loginRes.body.token) as any;
    expect(decoded.doctor_id).toBe(res.body.id);
  });

  it("GET /api/doctors?has_login=true só retorna medicos com login", async () => {
    const res = await request(ctx.app).get("/api/doctors?has_login=true");
    expect(res.status).toBe(200);
    expect(res.body.every((d: any) => d.medico_username)).toBe(true);
    expect(res.body.some((d: any) => d.medico_username === "dr_login")).toBe(true);
  });

  it("PUT adiciona login depois, sem ter sido criado na criação", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Tardio", specialization: "Clinica", prefix: "DTD" });

    const updated = await request(ctx.app)
      .put(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Tardio",
        specialization: "Clinica",
        prefix: "DTD",
        username: "dr_tardio",
        password: "outrasenha",
      });

    expect(updated.body.medico_username).toBe("dr_tardio");
  });

  it("PUT sem senha mantém a senha atual (login continua funcionando)", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Manter",
        specialization: "Clinica",
        prefix: "DMT",
        username: "dr_manter",
        password: "senhaoriginal",
      });

    await request(ctx.app)
      .put(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Manter Editado", specialization: "Clinica", prefix: "DMT", username: "dr_manter" });

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_manter", password: "senhaoriginal" });
    expect(loginRes.body.success).toBe(true);
  });

  it("DELETE remove também o login vinculado", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Removido",
        specialization: "Clinica",
        prefix: "DRM",
        username: "dr_removido",
        password: "senha",
      });

    await request(ctx.app)
      .delete(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_removido", password: "senha" });
    expect(loginRes.body.success).toBe(false);
  });
});
