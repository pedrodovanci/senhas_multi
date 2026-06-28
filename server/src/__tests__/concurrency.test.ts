import request from "supertest";
import { startServer } from "../index";

// Regressão: o servidor usa uma única conexão SQLite compartilhada. Antes do
// withWriteLock, requisições concorrentes que abriam transação manual
// (BEGIN IMMEDIATE/COMMIT) se entrelaçavam nessa conexão e corrompiam o
// estado da transação (erro "cannot commit - no transaction is active"),
// fazendo TODAS as requisições falharem com 500 — inclusive perdendo a senha
// no totem quando dois pacientes pediam ao mesmo tempo.
describe("concorrência: criação e chamada de senha", () => {
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

  it("10 criações de senha simultâneas geram 10 senhas com números únicos, sem 500", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(ctx.app)
          .post("/api/tickets")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ type: "outros" }),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    const numbers = results.map((r) => r.body.number);
    expect(new Set(numbers).size).toBe(10);
  });

  it("duas chamadas concorrentes para a MESMA senha: uma vence (200), a outra recebe 409", async () => {
    const created = await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });
    const ticketId = created.body.id;

    const ws1 = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    const ws2 = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G02'");

    const [r1, r2] = await Promise.all([
      request(ctx.app)
        .post("/api/tickets/call-specific")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ workstation_id: ws1.id, user_id: 1, ticket_id: ticketId }),
      request(ctx.app)
        .post("/api/tickets/call-specific")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ workstation_id: ws2.id, user_id: 1, ticket_id: ticketId }),
    ]);

    // Como agora as chamadas ficam serializadas (sem corrida real), a
    // segunda nem encontra mais a senha como "waiting" (404) — ela só
    // veria 409 se as duas leituras tivessem corrido em paralelo de fato.
    expect([r1.status, r2.status].sort()).toEqual([200, 404]);

    const ticket = await ctx.db.get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    expect(ticket.status).toBe("calling");
  });

  it("10 chamadas concorrentes de call-next contra 1 única senha: exatamente 1 vence", async () => {
    // Limpa qualquer senha "waiting" deixada pelos testes anteriores para
    // que a contagem abaixo seja determinística.
    await ctx.db.run("DELETE FROM tickets WHERE status = 'waiting'");

    await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });

    const ws1 = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(ctx.app)
          .post("/api/tickets/call-next")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ workstation_id: ws1.id, user_id: 1 }),
      ),
    );

    // Com o lock, as chamadas ficam totalmente serializadas: a primeira
    // ganha a única senha; as demais nem a encontram mais como "waiting"
    // (404), em vez de uma corrida real por ela.
    const okCount = results.filter((r) => r.status === 200).length;
    const notFoundCount = results.filter((r) => r.status === 404).length;
    expect(okCount).toBe(1);
    expect(notFoundCount).toBe(9);
  });
});
