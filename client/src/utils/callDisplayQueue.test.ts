import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CallDisplayQueue } from "./callDisplayQueue";

describe("CallDisplayQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra o primeiro item imediatamente", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });

  it("enfileira chamadas que chegam antes do tempo minimo passar", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");
    queue.push("C003");

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });

  it("mostra o proximo da fila só depois do tempo minimo", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");

    vi.advanceTimersByTime(4999);
    expect(onShow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow).toHaveBeenLastCalledWith("C002");
  });

  it("respeita a ordem de chegada (FIFO) entre tres chamadas em rajada", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");
    queue.push("C003");

    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenLastCalledWith("C002");

    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenLastCalledWith("C003");
  });

  it("nao agenda novo timer quando a fila esvazia", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenCalledTimes(1);

    queue.push("C002");
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it("destroy cancela o timer pendente e impede novas exibições agendadas", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");

    queue.destroy();
    vi.advanceTimersByTime(10000);

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });
});

describe("CallDisplayQueue sem mock de timer (reproduz checagem de receiver do navegador)", () => {
  it("nao lanca 'Illegal invocation' usando setTimeout/clearTimeout globais reais", () => {
    // No navegador, setTimeout/clearTimeout são métodos de Window e lançam
    // TypeError se invocados com `this` diferente de window — isso não
    // reproduz em Node (onde são funções soltas), então simulamos a checagem
    // de receiver aqui pra pegar essa regressão sem precisar de jsdom/browser.
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;

    function strictSetTimeout(this: unknown, cb: () => void, ms: number) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return realSetTimeout(cb, ms);
    }
    function strictClearTimeout(this: unknown, handle: ReturnType<typeof setTimeout>) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return realClearTimeout(handle);
    }

    globalThis.setTimeout = strictSetTimeout as typeof setTimeout;
    globalThis.clearTimeout = strictClearTimeout as typeof clearTimeout;

    try {
      const onShow = vi.fn();
      const queue = new CallDisplayQueue<string>({ minDisplayMs: 10, onShow });

      expect(() => queue.push("C001")).not.toThrow();
      expect(() => queue.destroy()).not.toThrow();
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });
});
