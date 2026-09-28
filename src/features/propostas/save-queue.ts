/** FIFO captures the click boundary: writes submitted after a checkpoint stay behind it. */
export class ProposalSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  readonly failures = new Map<string, Error>();
  pending = 0;
  enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    this.pending++;
    const task = this.tail
      .then(work)
      .then(
        (value) => {
          this.failures.delete(key);
          return value;
        },
        (cause) => {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failures.set(key, error);
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
}
