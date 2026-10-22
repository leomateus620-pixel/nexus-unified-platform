import type { QueryClient } from "@tanstack/react-query";

/** A resposta só pertence ao contexto que iniciou a operação, mesmo após outro login com os mesmos IDs. */
export function captureStockContinuation(
  client: QueryClient,
  accessKey: readonly unknown[],
  isActive: () => boolean,
) {
  const cache = client.getQueryCache();
  const query = cache.find({ queryKey: accessKey, exact: true });
  const permissions = JSON.stringify(query?.state.data);
  return () =>
    isActive() &&
    !!query &&
    cache.find({ queryKey: accessKey, exact: true }) === query &&
    query.state.status === "success" &&
    JSON.stringify(query.state.data) === permissions;
}
