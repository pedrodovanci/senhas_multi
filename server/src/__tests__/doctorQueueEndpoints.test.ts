import request from "supertest";
import { startServer } from "../index";

describe("/api/doctor-queue", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;
  let medicoToken: string;
  let doctorId: number;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const adminLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = adminLogin.body.token;

    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Fila Endpoints",
        specialization: "Clinica",
        prefix: "DFE",
        room: "Sala 9",
        username: "dr_fila_endpoints",
        password: "senha",
      });
    doctorId = doctor.body.id;

    const medicoLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_fila_endpoints", password: "senha" });
    medicoToken = medicoLogin.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  const encaminhar = async (patientName: string) => {
    const created = await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });
    const ws = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    await ctx.db.run(
      "UPDATE tickets SET status = 'in_attendance', workstation_id = ?, called_at = CURRENT_TIMESTAMP, started_at = CURRENT_TIMESTAMP WHERE id = ?",
      [ws.id, created.body.id],
    );
    return request(ctx.app)
      .post(`/api/tickets/${created.body.id}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: patientName });
  };

  it("GET /api/doctor-queue/mine exige role medico", async () => {
    const res = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/doctor-queue/mine lista a fila do medico logado", async () => {
    await encaminhar("Paciente Mine");

    const res = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((e: any) => e.patientName === "Paciente Mine")).toBe(true);

    // Drena a fila pra não contaminar os testes seguintes (mesmo doctorId em todo o describe)
    await request(ctx.app)
      .post("/api/doctor-queue/call-next")
      .set("Authorization", `Bearer ${medicoToken}`);
  });

  it("POST call-next remove o primeiro da fila e retorna 404 quando vazia", async () => {
    await encaminhar("Paciente CallNext");

    const chamado = await request(ctx.app)
      .post("/api/doctor-queue/call-next")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(chamado.status).toBe(200);
    expect(chamado.body.patientName).toBe("Paciente CallNext");

    const filaVazia = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(filaVazia.body.find((e: any) => e.patientName === "Paciente CallNext")).toBeUndefined();
  });

  it("POST call/:entryId chama um item especifico fora de ordem", async () => {
    await encaminhar("Primeiro da Fila");
    await encaminhar("Segundo da Fila");

    const filaAntes = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    const segundo = filaAntes.body.find((e: any) => e.patientName === "Segundo da Fila");

    const chamado = await request(ctx.app)
      .post(`/api/doctor-queue/call/${segundo.id}`)
      .set("Authorization", `Bearer ${medicoToken}`);

    expect(chamado.status).toBe(200);
    expect(chamado.body.patientName).toBe("Segundo da Fila");

    const filaDepois = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(filaDepois.body.map((e: any) => e.patientName)).toContain("Primeiro da Fila");
    expect(filaDepois.body.map((e: any) => e.patientName)).not.toContain("Segundo da Fila");
  });
});
