type TimerHandle = ReturnType<typeof setTimeout>;

interface CallDisplayQueueOptions<T> {
  minDisplayMs: number;
  onShow: (item: T) => void;
  setTimer?: (cb: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export class CallDisplayQueue<T> {
  private queue: T[] = [];
  private showing = false;
  private timer: TimerHandle | null = null;
  private readonly minDisplayMs: number;
  private readonly onShow: (item: T) => void;
  private readonly setTimer: (cb: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  constructor(options: CallDisplayQueueOptions<T>) {
    this.minDisplayMs = options.minDisplayMs;
    this.onShow = options.onShow;
    // setTimeout/clearTimeout são métodos de Window e exigem `this === window`
    // quando chamados nativamente. Armazená-los direto em this.setTimer e
    // invocá-los como this.setTimer(...) muda o receiver e lança
    // "TypeError: Illegal invocation" no navegador (não reproduz em Node).
    // O wrapper em arrow function invoca como chamada solta, sem esse problema.
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  push(item: T): void {
    if (!this.showing) {
      this.showNext(item);
      return;
    }
    this.queue.push(item);
  }

  destroy(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.showing = false;
  }

  private showNext(item: T): void {
    this.showing = true;
    this.onShow(item);
    this.timer = this.setTimer(() => {
      this.timer = null;
      const next = this.queue.shift();
      if (next !== undefined) {
        this.showNext(next);
      } else {
        this.showing = false;
      }
    }, this.minDisplayMs);
  }
}
