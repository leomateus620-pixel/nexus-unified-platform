import { describe, it, expect } from "vitest";
import { ProposalSaveQueue } from "../src/features/propostas/save-queue";

describe("proposal save boundary", () => {
  it("captures prior edits; new edits stay after the checkpoint without remounting", async () => {
    const queue = new ProposalSaveQueue();
    const order: string[] = [];
    let release!: () => void;
    const first = queue.enqueue("field", async () => {
      await new Promise<void>((done) => {
        release = done;
      });
      order.push("old input");
    });
    const checkpoint = queue.enqueue("checkpoint", async () => {
      queue.assertHealthy();
      order.push("checkpoint");
    });
    const next = queue.enqueue("field", async () => {
      order.push("new input");
    });
    await Promise.resolve();
    release();
    await Promise.all([first, checkpoint, next]);
    expect(order).toEqual(["old input", "checkpoint", "new input"]);
  });
  it("failed draft blocks confirmation until that same object is successfully retried", async () => {
    const queue = new ProposalSaveQueue();
    await expect(
      queue.enqueue("field-A", async () => {
        throw new Error("conflict");
      }),
    ).rejects.toThrow("conflict");
    await queue.enqueue("field-B", async () => true);
    expect(() => queue.assertHealthy()).toThrow("conflict");
    await queue.enqueue("field-A", async () => true);
    expect(() => queue.assertHealthy()).not.toThrow();
  });
  it("allows consolidation to retry a failed technical calculation without inventing an edit", async () => {
    const queue = new ProposalSaveQueue();
    await queue
      .enqueue("calculo", async () => {
        throw new Error("offline");
      })
      .catch(() => {});
    expect(() => queue.assertHealthy()).not.toThrow();
    expect(queue.pending).toBe(0);
  });
});
