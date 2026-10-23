/** Only a recognized transport failure can keep an already authorized view mounted.
 * Authorization failures and unknown/server errors must continue to fail closed. */
export function isPetTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const message = String(value.message || "");
  const code = String(value.code || "");
  const status = Number(value.status || value.statusCode || 0);
  if (
    [401, 403].includes(status) ||
    ["42501", "23503", "PGRST116", "PGRST301", "PGRST302", "PGRST303"].includes(code)
  )
    return false;
  if (
    /unauthori[sz]ed|forbidden|\b(?:jwt|token)\b|sess[aã]o|permiss[aã]o|acesso|authenticat|autorizad/i.test(
      message,
    )
  )
    return false;
  return /failed to fetch|fetch failed|network(?:error| request failed| error)|load failed|err_(?:network|internet_disconnected|connection)|econn(?:reset|refused)|etimedout|tempo de conex[aã]o|falha de conex[aã]o|erro de rede|sem conex[aã]o|request timed out/i.test(
    `${code} ${message}`,
  );
}
export function retainPetDraftView(error: unknown, hasAuthorizedCache: boolean): boolean {
  return hasAuthorizedCache && isPetTransportFailure(error);
}
