import { abortError } from "./domain";
type Dispose = () => void | Promise<void>;
/** Owns only one reader session. Late resources are disposed instead of resurrecting a closed file. */
export class ReaderLifetime {
  readonly controller = new AbortController();
  private disposers = new Set<Dispose>();
  private closing: Promise<void> | null = null;
  get active() {
    return !this.controller.signal.aborted;
  }
  assertActive() {
    if (!this.active) throw abortError();
  }
  register(dispose: Dispose) {
    if (!this.active) {
      void Promise.resolve()
        .then(dispose)
        .catch(() => undefined);
      return () => undefined;
    }
    this.disposers.add(dispose);
    return () => {
      this.disposers.delete(dispose);
    };
  }
  async acquire<T>(promise: Promise<T>, dispose: (value: T) => void | Promise<void>): Promise<T> {
    const resource = await promise;
    if (!this.active) {
      await dispose(resource);
      throw abortError();
    }
    this.register(() => dispose(resource));
    return resource;
  }
  close() {
    if (this.closing) return this.closing;
    this.controller.abort();
    const jobs = [...this.disposers].reverse();
    this.disposers.clear();
    this.closing = Promise.allSettled(jobs.map((dispose) => Promise.resolve().then(dispose))).then(
      () => undefined,
    );
    return this.closing;
  }
}
