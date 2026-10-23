export const PESSOA_ACESSO_INDISPONIVEL = "Pessoa indisponível para seu acesso atual.";

export function acessoPessoaNegado(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : typeof error === "string"
        ? error
        : "";
  return [
    PESSOA_ACESSO_INDISPONIVEL,
    "Seu acesso atual não permite consultar esta área.",
    "Registro indisponível ou sem permissão para esta ação.",
  ].includes(message);
}
