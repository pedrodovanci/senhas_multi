import request from "supertest";
import jwt from "jsonwebtoken";
import { startServer } from "../index";

describe("/api/login com doctor_id", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const adminLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("login de medico retorna doctor_id no user e no token", async () => {
    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Login Test",
        specialization: "Clinica",
        prefix: "DLT",
        username: "dr_login_test",
        password: "senha123",
      });

    const res = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_login_test", password: "senha123" });

    expect(res.body.user.doctor_id).toBe(doctor.body.id);

    const decoded = jwt.decode(res.body.token) as any;
    expect(decoded.doctor_id).toBe(doctor.body.id);
  });

  it("login de atendente retorna doctor_id null", async () => {
    const ws = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    const res = await request(ctx.app)
      .post("/api/login")
      .send({ username: "atendente1", password: "1234", workstation_id: ws.id });

    expect(res.body.user.doctor_id).toBeNull();
  });

  it("login de atendente sem posto de trabalho é rejeitado", async () => {
    const res = await request(ctx.app)
      .post("/api/login")
      .send({ username: "atendente1", password: "1234" });

    expect(res.status).toBe(400);
  });
});
