import type { QueryClient } from "@tanstack/react-query";

/** Não adota respostas de um contexto removido, mesmo se outro login reutilizar os mesmos IDs. */
export function captureOperationalContinuation(
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
