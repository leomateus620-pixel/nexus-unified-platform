/** FIFO captures the click boundary: writes submitted after a checkpoint stay behind it. */
export class ProposalSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  readonly failures = new Map<string, Error>();
  private retries = new Map<string, () => Promise<unknown>>();
  pending = 0;
  enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    this.pending++;
    const task = this.tail
      .then(work)
      .then(
        (value) => {
          this.failures.delete(key);
          this.retries.delete(key);
          return value;
        },
        (cause) => {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failures.set(key, error);
          this.retries.set(key, work);
          throw error;
        },
      )
      .finally(() => {
        this.pending--;
      });
    this.tail = task.catch(() => {});
    return task;
  }
  assertHealthy() {
    const failure = [...this.failures.entries()].find(
      ([key]) => key !== "checkpoint" && key !== "calculo",
    );
    if (failure) throw new Error(`Rascunho não consolidado: ${failure[1].message}`);
  }
  /** Failed writes retain their captured values; retries never reconstruct a newer payload. */
  async retryFailed() {
    for (const [key, work] of [...this.retries]) {
      if (key !== "checkpoint" && key !== "calculo") await this.enqueue(key, work);
    }
  }
}

export type SaveStatus =
  "idle" | "local" | "salvando" | "salvo" | "consolidando" | "confirmado" | "erro" | "conflito";
export type CalculationStatus = "pending" | "calculating" | "current" | "error";
export type SaveConfirmation = {
  evento: boolean;
  objetos: number;
  campos: number;
  pendencias?: number;
};
type SaveState = {
  status: SaveStatus;
  calculation: CalculationStatus;
  msg: string | null;
  busy: boolean;
};

/** One revision owns the pause, field flushers, FIFO writes and idempotent checkpoint. */
export class ProposalSaveCoordinator {
  readonly queue = new ProposalSaveQueue();
  private flushers = new Map<string, () => void>();
  private localFields = new Set<string>();
  private drafts = new Map<string, { value: unknown; generation: number }>();
  private generation = 0;
  private confirmedGeneration = 0;
  private operation: { id: string; generation: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<boolean> | null = null;
  private disposed = false;
  private needsCalculation = false;
  private calculationWaiters = new Set<(confirmed: boolean) => void>();
  private state: SaveState = { status: "idle", calculation: "current", msg: null, busy: false };
  constructor(
    private options: {
      consolidate: (operationId: string) => Promise<SaveConfirmation>;
      confirmed: () => Promise<void>;
      changed: (state: SaveState) => void;
      validate?: () => void;
      operationId?: () => string;
      pause?: number;
    },
  ) {}
  set = (status: SaveStatus, msg?: string) => {
    this.publish({ status, msg: msg ?? null });
  };
  private publish(patch: Partial<SaveState>) {
    // Typing advances the local generation without rerendering every subscriber for the same state.
    if (
      Object.entries(patch).every(([key, value]) =>
        Object.is(this.state[key as keyof SaveState], value),
      )
    )
      return;
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.options.changed(this.state);
  }
  private schedule() {
    if (this.disposed || this.saving) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.ensureConsistent();
    }, this.options.pause ?? 800);
  }
  local = (key = "form") => {
    this.localFields.add(key);
    this.generation++;
    const draft = this.drafts.get(key);
    if (draft) draft.generation = this.generation;
    this.publish({ status: "local", calculation: "pending", msg: null });
    this.schedule();
  };
  settle = (key = "form") => {
    this.localFields.delete(key);
    if (!this.localFields.size && !this.queue.pending && !this.queue.failures.size) {
      this.publish({ status: "local", calculation: "pending", msg: null });
      this.schedule();
    }
  };
  remember = (key: string, value: unknown) => {
    if (value === undefined) this.drafts.delete(key);
    else this.drafts.set(key, { value, generation: this.generation + 1 });
  };
  draft = <T>(key: string): T | undefined => this.drafts.get(key)?.value as T | undefined;
  register = (key: string, flush: () => void) => {
    this.flushers.set(key, flush);
    return () => {
      // Route changes capture valid values before the form disappears. Invalid drafts stay local.
      if (this.localFields.has(key)) {
        try {
          flush();
        } catch (cause) {
          this.failed(cause);
        }
      }
      if (this.flushers.get(key) === flush) this.flushers.delete(key);
    };
  };
  run = async <T>(key: string, work: () => Promise<T>): Promise<T | undefined> => {
    if (key === "calculo") return (await this.requestCalculation()) as T;
    this.generation++;
    this.publish({ status: "salvando", calculation: "pending", busy: true, msg: null });
    try {
      const result = await this.queue.enqueue(key, work);
      // A persisted draft is not yet a confirmed commercial checkpoint.
      if (!this.saving && !this.queue.failures.size)
        this.publish({ status: "local", busy: this.queue.pending > 0 });
      this.schedule();
      return result;
    } catch (cause) {
      this.failed(cause);
      return undefined;
    }
  };
  requestCalculation = () => {
    this.needsCalculation = true;
    this.publish({ calculation: "pending" });
    // Coalesce callers within the same pause. No calculation can overtake queued input writes.
    this.schedule();
    return new Promise<boolean>((resolve) => this.calculationWaiters.add(resolve));
  };
  private failed(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    this.publish({
      status: /conflito/i.test(message) ? "conflito" : "erro",
      calculation: "error",
      msg: message,
      busy: this.queue.pending > 0,
    });
  }
  ensureConsistent = (): Promise<boolean> => {
    if (this.saving) return this.saving;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Enter the async boundary before flushing: a flusher may itself enqueue work.
    this.saving = Promise.resolve().then(() => this.consolidate());
    void this.saving.finally(() => {
      this.saving = null;
      if (
        !this.queue.failures.size &&
        this.generation > this.confirmedGeneration &&
        this.state.status === "local"
      )
        this.schedule();
    });
    return this.saving;
  };
  private async consolidate(): Promise<boolean> {
    this.publish({ busy: true });
    try {
      // A lost checkpoint response is retried with its original UUID before capturing newer edits.
      if (!this.operation) {
        this.flushers.forEach((flush) => flush());
        this.options.validate?.();
        if (this.localFields.size)
          throw new Error(
            "Entrada pendente: conclua o campo ou a justificativa. Edição local preservada.",
          );
        this.operation = {
          id: this.options.operationId?.() ?? crypto.randomUUID(),
          generation: this.generation,
        };
      }
      const operation = this.operation;
      this.publish({ status: "consolidando", calculation: "calculating", msg: null });
      const result = await this.queue.enqueue("checkpoint", async () => {
        this.queue.assertHealthy();
        return this.options.consolidate(operation.id);
      });
      this.operation = null;
      this.needsCalculation = false;
      this.confirmedGeneration = operation.generation;
      // Query refresh is part of confirmation: all views must read the same confirmed total.
      await this.options.confirmed();
      const newer = this.generation !== operation.generation || this.localFields.size > 0;
      if (!newer) {
        for (const [key, draft] of this.drafts)
          if (draft.generation <= operation.generation) this.drafts.delete(key);
      }
      this.publish({
        status: newer ? "local" : "confirmado",
        calculation: newer ? "pending" : "current",
        busy: this.queue.pending > 0,
        msg: newer
          ? "Novas edições aguardam confirmação."
          : result.evento
            ? `Salvo automaticamente · ${result.objetos} objetos · ${result.campos} campos`
            : "Salvo · sem novas alterações",
      });
      if (!newer) this.finishCalculation(true);
      return !newer;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/conflito|inválid|pendente|não consolidado|Acesso|imutável/i.test(message))
        this.operation = null;
      this.failed(cause);
      this.finishCalculation(false);
      return false;
    } finally {
      this.publish({ busy: this.queue.pending > 0 });
    }
  }
  retry = async () => {
    try {
      await this.queue.retryFailed();
    } catch (cause) {
      this.failed(cause);
      return false;
    }
    return this.ensureConsistent();
  };
  /** Flush on backgrounding, while normal typing remains debounced. */
  flush = () => {
    if (this.localFields.size || this.queue.pending || this.operation || this.needsCalculation)
      return this.ensureConsistent();
    return Promise.resolve(true);
  };
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.finishCalculation(false);
  }
  activate() {
    this.disposed = false;
  }
  private finishCalculation(confirmed: boolean) {
    this.calculationWaiters.forEach((resolve) => resolve(confirmed));
    this.calculationWaiters.clear();
  }
}
