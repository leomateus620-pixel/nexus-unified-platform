import { isPetTransportFailure } from "./draft-recovery";
export function petResult(r: { data: unknown; error: { code?: string; message: string } | null }) {
  if (!r.error) return r.data;
  if (isPetTransportFailure(r.error))
    throw new Error("Falha de conexão ao consultar a PET. Tente novamente com conexão.");
  if (["42501", "23503", "PGRST116"].includes(r.error.code ?? ""))
    throw new Error("Registro indisponível para seu acesso atual.");
  if (r.error.code === "40001")
    throw new Error(
      "A PET mudou em outro dispositivo. Seu preenchimento foi preservado; confira a versão atual.",
    );
  if (r.error.code === "23505")
    throw new Error(
      "Operação já registrada ou chave utilizada com outro conteúdo. Confira o histórico.",
    );
  if (r.error.code === "23514") {
    if (r.error.message.startsWith("[")) {
      try {
        const pendencias = JSON.parse(r.error.message) as { mensagem?: string }[];
        throw new Error(
          pendencias
            .map((p) => p.mensagem)
            .filter(Boolean)
            .join(" · ") || "A conferência encontrou pendências. Confira a lista da PET.",
        );
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new Error("A conferência encontrou pendências. Confira a lista da PET.");
        throw error;
      }
    }
    throw new Error(r.error.message);
  }
  if (["42883", "42P01", "PGRST202"].includes(r.error.code ?? ""))
    throw new Error("Integração não configurada: migrações de PET indisponíveis neste ambiente.");
  throw new Error(
    "Não foi possível confirmar a operação. Seu preenchimento foi preservado; consulte o histórico antes de repetir.",
  );
}
