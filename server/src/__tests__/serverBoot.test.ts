import WebSocket from "ws";
import { startServer } from "../index";

describe("server:boot", () => {
  it("envia bootId para todo cliente que conecta", async () => {
    const ctx = await startServer(false, ":memory:");
    const server = ctx.httpServer.listen(0);
    const port = (server.address() as any).port;

    const received: any[] = [];
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        received.push(JSON.parse(data.toString()));
        resolve();
      });
    });

    expect(received[0].type).toBe("server:boot");
    expect(typeof received[0].data.bootId).toBe("string");
    expect(received[0].data.bootId.length).toBeGreaterThan(0);

    ws.close();
    server.close();
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });
});
