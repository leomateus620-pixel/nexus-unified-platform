/** Visual conventions from the A1 legend. The operational record remains the rev. 56 manifest. */
export const lvhfAppearance = {
  montada: { label: "Montada", primary: "#14694d" },
  "a-montar": { label: "A montar", primary: "#b78a12" },
  "montada-aditivo": { label: "Montada com aditivo", primary: "#14694d", secondary: "#2866a9" },
  fora: { label: "Fora do projeto", primary: "#616d69" },
  retirada: { label: "Retirada", primary: "#616d69" },
} as const;

export const activeLegend = ["montada", "a-montar", "montada-aditivo"] as const;
export type LvhfState = keyof typeof lvhfAppearance;

export function lvhfState(status: string | undefined): LvhfState | undefined {
  switch (status) {
    case "Montada":
      return "montada";
    case "Montada · aditivo":
      return "montada-aditivo";
    case "A montar":
      return "a-montar";
    case "Fora do projeto":
      return "fora";
    case "Retirada":
      return "retirada";
  }
  return undefined;
}

export function lvhfSwatch(state: LvhfState) {
  const look = lvhfAppearance[state];
  return "secondary" in look
    ? `linear-gradient(90deg, ${look.primary} 50%, ${look.secondary} 50%)`
    : look.primary;
}
