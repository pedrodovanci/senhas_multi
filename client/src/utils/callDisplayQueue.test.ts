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
