// HTTP transports only; real domain RPCs run as authenticated in the disposable DB.
export async function rpc(name: string, { data, signal }: { data: unknown; signal?: AbortSignal }) {
  const r = await fetch("/__cotrirosa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
    signal,
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error);
  return result;
}
