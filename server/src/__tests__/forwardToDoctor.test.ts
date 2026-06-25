import request from "supertest";
import { startServer } from "../index";

describe("POST /api/tickets/:id/forward-to-doctor", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;
  let doctorId: number;

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
        name: "Dr. Fila",
        specialization: "Clinica",
        prefix: "DFL",
        room: "Sala 5",
        username: "dr_fila",
        password: "senha",
      });
    doctorId = doctor.body.id;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  const criarTicketEmAtendimento = async () => {
    const ws = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    const created = await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });

    await ctx.db.run(
      "UPDATE tickets SET status = 'calling', workstation_id = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?",
      [ws.id, created.body.id],
    );
    await ctx.db.run(
      "UPDATE tickets SET status = 'in_attendance', started_at = CURRENT_TIMESTAMP WHERE id = ?",
      [created.body.id],
    );
    return created.body.id;
  };

  it("encaminha com sucesso: finaliza o ticket e adiciona na fila do medico", async () => {
    const ticketId = await criarTicketEmAtendimento();

    const res = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Paciente Teste" });

    expect(res.status).toBe(200);
    expect(res.body.entry.patientName).toBe("Paciente Teste");

    const ticket = await ctx.db.get("SELECT status FROM tickets WHERE id = ?", [ticketId]);
    expect(ticket.status).toBe("finished");
  });

  it("rejeita 400 quando medico não tem login", async () => {
    const semLoginDoctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Sem Fila", specialization: "Clinica", prefix: "DSF" });

    const ticketId = await criarTicketEmAtendimento();

    const res = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: semLoginDoctor.body.id, patient_name: "Paciente X" });

    expect(res.status).toBe(400);
  });

  it("idempotente: a segunda chamada retorna 409 e não duplica na fila", async () => {
    const ticketId = await criarTicketEmAtendimento();

    const primeira = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Duplicado" });
    expect(primeira.status).toBe(200);

    const segunda = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Duplicado" });
    expect(segunda.status).toBe(409);

    const medicoLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_fila", password: "senha" });
    const fila = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoLogin.body.token}`);

    const ocorrencias = fila.body.filter((e: any) => e.patientName === "Duplicado");
    expect(ocorrencias.length).toBe(1);
  });
});
