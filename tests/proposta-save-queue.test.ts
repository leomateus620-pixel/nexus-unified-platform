import { afterEach, describe, it, expect, vi } from "vitest";
import { ProposalSaveCoordinator, ProposalSaveQueue } from "../src/features/propostas/save-queue";
import { applyRevisionPatch } from "../src/features/propostas/revision-patch";
import { PARAMETROS_MODELO, type Parametros } from "../src/features/calculo/domain";

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

describe("revision autosave coordinator", () => {
  afterEach(() => vi.useRealTimers());
  function coordinator(consolidate = vi.fn(async () => ({ evento: true, objetos: 2, campos: 3 }))) {
    const states: { status: string; calculation: string; msg: string | null }[] = [];
    let id = 0;
    const save = new ProposalSaveCoordinator({
      consolidate,
      confirmed: vi.fn(async () => {}),
      changed: (state) => states.push(state),
      operationId: () => `operation-${++id}`,
    });
    return { save, consolidate, states };
  }
  it("groups rapid typing, flushes captured inputs before one calculation/checkpoint", async () => {
    vi.useFakeTimers();
    const { save, consolidate, states } = coordinator();
    let text = "";
    const writes: string[] = [];
    save.register("textos", () => {
      const captured = text;
      save.settle("textos");
      void save.run("textos", async () => {
        writes.push(captured);
        return true;
      });
    });
    for (text of ["a", "ab", "abc"]) {
      save.local("textos");
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(consolidate).not.toHaveBeenCalled();
    expect(states.some((state) => ["salvo", "confirmado"].includes(state.status))).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(writes).toEqual(["abc"]);
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.status).toBe("confirmado");
    await vi.advanceTimersByTimeAsync(1600);
    expect(consolidate).toHaveBeenCalledTimes(1);
    save.dispose();
  });
  it("flushes valid inputs on stage unmount and preserves an invalid draft across stages", async () => {
    const { save, consolidate, states } = coordinator();
    save.remember("textos", { objeto: "trabalho local" });
    save.local("textos");
    const unregister = save.register("textos", () => {
      throw new Error("Textos inválidos");
    });
    unregister();
    expect(save.draft("textos")).toEqual({ objeto: "trabalho local" });
    expect(await save.ensureConsistent()).toBe(false);
    expect(consolidate).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe("erro");
    save.register("textos", () => {
      save.settle("textos");
      void save.run("textos", async () => true);
    });
    expect(await save.ensureConsistent()).toBe(true);
    expect(save.draft("textos")).toBeUndefined();
    save.dispose();
  });
  it("a lost checkpoint reply reuses the operation id before capturing newer edits", async () => {
    const checkpoint = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network response lost"))
      .mockResolvedValue({ evento: true, objetos: 1, campos: 1 });
    const { save } = coordinator(checkpoint);
    await save.run("field", async () => true);
    expect(await save.ensureConsistent()).toBe(false);
    save.remember("field", "newer");
    save.local("field");
    expect(await save.retry()).toBe(false);
    expect(checkpoint.mock.calls.map(([id]) => id)).toEqual(["operation-1", "operation-1"]);
    expect(save.draft("field")).toBe("newer");
    save.settle("field");
    await save.run("field", async () => true);
    expect(await save.ensureConsistent()).toBe(true);
    expect(checkpoint.mock.calls.at(-1)?.[0]).toBe("operation-2");
    save.dispose();
  });
  it("failed input blocks calculation; explicit retry uses the captured work", async () => {
    const { save, consolidate } = coordinator();
    const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    expect(await save.run("field", write)).toBeUndefined();
    expect(await save.ensureConsistent()).toBe(false);
    expect(consolidate).not.toHaveBeenCalled();
    expect(await save.retry()).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(consolidate).toHaveBeenCalledTimes(1);
    save.dispose();
  });
  it("another field on the same object cannot acknowledge a failed field after navigation", async () => {
    const { save, consolidate } = coordinator();
    save.remember("system-1-metragem", "145");
    save.local("system-1-metragem");
    save.settle("system-1-metragem");
    const metric = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline metric"))
      .mockResolvedValue(true);
    await save.run("sistema-system-1-metragem", metric);
    await save.run("sistema-system-1-identificacao", async () => true);
    expect(await save.ensureConsistent()).toBe(false);
    expect(consolidate).not.toHaveBeenCalled();
    expect(save.draft("system-1-metragem")).toBe("145");
    expect(await save.retry()).toBe(true);
    expect(metric).toHaveBeenCalledTimes(2);
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(save.draft("system-1-metragem")).toBeUndefined();
    save.dispose();
  });
  it("old confirmation cannot mark new edits saved or clear their local draft", async () => {
    let release!: (result: { evento: boolean; objetos: number; campos: number }) => void;
    const { save, states } = coordinator(
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    );
    await save.run("old", async () => true);
    const saving = save.ensureConsistent();
    await Promise.resolve();
    await Promise.resolve();
    save.remember("new", "local new value");
    save.local("new");
    release({ evento: true, objetos: 1, campos: 1 });
    expect(await saving).toBe(false);
    expect(states.at(-1)?.status).toBe("local");
    expect(states.at(-1)?.calculation).toBe("pending");
    expect(save.draft("new")).toBe("local new value");
    save.dispose();
  });
  it("coalesces calculation requests and reports a confirmed no-op without inventing history", async () => {
    vi.useFakeTimers();
    const { save, consolidate, states } = coordinator(
      vi.fn(async () => ({ evento: false, objetos: 0, campos: 0 })),
    );
    const calls = [save.requestCalculation(), save.requestCalculation(), save.requestCalculation()];
    await vi.advanceTimersByTimeAsync(800);
    expect(await Promise.all(calls)).toEqual([true, true, true]);
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.msg).toBe("Salvo · sem novas alterações");
    save.dispose();
  });
  it("conflict remains explicit and cannot produce a false saved state", async () => {
    const { save, states } = coordinator();
    await save.run("field", async () => {
      throw new Error("Conflito no mesmo campo");
    });
    expect(await save.ensureConsistent()).toBe(false);
    expect(states.at(-1)?.status).toBe("conflito");
    expect(states.some((state) => state.status === "confirmado")).toBe(false);
    save.dispose();
  });
});

describe("guarded revision inputs", () => {
  const parameterValue = (field: string, value: unknown) =>
    value === undefined ? PARAMETROS_MODELO[field as keyof Parametros] : value;
  it("implicit parameter defaults remain sparse when no effective edit occurred", async () => {
    const write = vi.fn();
    const read = vi.fn();
    await applyRevisionPatch(
      { write, read },
      { version: 1, values: { desconto: 0 } },
      { markup: PARAMETROS_MODELO.markup },
      parameterValue,
    );
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("a sparse local parameter edit preserves another editor's newly explicit field", async () => {
    const write = vi.fn(async () => 3);
    const read = vi.fn(async () => ({
      version: 2,
      values: { desconto: 0, produtividade_telhado_m_dia: 45 },
    }));
    await applyRevisionPatch(
      { write, read },
      { version: 1, values: { desconto: 0 } },
      { markup: 0.45 },
      parameterValue,
    );
    expect(write).toHaveBeenCalledWith(2, {
      desconto: 0,
      produtividade_telhado_m_dia: 45,
      markup: 0.45,
    });
  });
  it("an editor can restore an implicit default after its prior write was acknowledged", async () => {
    const write = vi.fn(async () => 3);
    const read = vi.fn(async () => ({ version: 2, values: { desconto: 0, markup: 0.45 } }));
    await applyRevisionPatch(
      { write, read },
      { version: 2, values: { desconto: 0, markup: 0.45 } },
      { markup: PARAMETROS_MODELO.markup },
      parameterValue,
    );
    expect(write).toHaveBeenCalledWith(2, { desconto: 0, markup: PARAMETROS_MODELO.markup });
  });
  it("recognizes a persisted write after its transport confirmation was lost", async () => {
    const write = vi.fn(async () => {
      throw new Error("lost response");
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce({ version: 1, values: { objeto: "antes", garantia: "mantida" } })
      .mockResolvedValue({ version: 2, values: { objeto: "novo", garantia: "mantida" } });
    expect(
      await applyRevisionPatch(
        { write, read },
        { version: 1, values: { objeto: "antes", garantia: "mantida" } },
        { objeto: "novo", garantia: "mantida" },
      ),
    ).toEqual({ version: 2, values: { objeto: "novo", garantia: "mantida" } });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("preserves another editor's unrelated field while applying the local edit", async () => {
    const write = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(3);
    const read = vi.fn(async () => ({
      version: 2,
      values: { objeto: "antes", garantia: "externa" },
    }));
    const result = await applyRevisionPatch(
      { write, read },
      { version: 1, values: { objeto: "antes", garantia: "antiga" } },
      { objeto: "novo", garantia: "antiga" },
    );
    expect(write.mock.calls[1]).toEqual([2, { objeto: "novo", garantia: "externa" }]);
    expect(result.version).toBe(3);
  });
  it("a second full-form flush keeps an untouched concurrent value despite an older displayed value", async () => {
    let server = {
      version: 2,
      values: { objeto: "antes", validade: "45 dias", condicoes: "antes" },
    };
    const write = vi.fn(async (_version, values) => {
      server = { version: server.version + 1, values };
      return server.version;
    });
    const read = async () => structuredClone(server);
    const baseline = {
      version: 1,
      values: { objeto: "antes", validade: "30 dias", condicoes: "antes" },
    };
    await applyRevisionPatch({ write, read }, baseline, {
      objeto: "local",
      validade: "30 dias",
      condicoes: "antes",
    });
    // Only the local object field is acknowledged by the still-dirty form.
    const acknowledged = { version: 3, values: { ...baseline.values, objeto: "local" } };
    await applyRevisionPatch({ write, read }, acknowledged, {
      objeto: "local",
      validade: "30 dias",
      condicoes: "novas",
    });
    expect(server.values).toEqual({ objeto: "local", validade: "45 dias", condicoes: "novas" });
  });
  it("rejects a concurrent edit of the same field and does not overwrite it", async () => {
    const write = vi.fn(async () => null);
    const read = vi.fn(async () => ({ version: 2, values: { objeto: "externo" } }));
    await expect(
      applyRevisionPatch(
        { write, read },
        { version: 1, values: { objeto: "antes" } },
        { objeto: "novo" },
      ),
    ).rejects.toThrow("Conflito");
    expect(write).not.toHaveBeenCalled();
  });
  it("no-op does not call persistence or create a version", async () => {
    const write = vi.fn();
    const read = vi.fn();
    await applyRevisionPatch(
      { write, read },
      { version: 1, values: { desconto: 0 } },
      { desconto: 0 },
    );
    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
