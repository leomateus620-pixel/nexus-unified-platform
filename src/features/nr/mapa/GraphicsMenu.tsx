import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PROFILE_LABELS,
  type GraphicsChoice,
  type GraphicsProfile,
  type LightState,
} from "./graphics";

export function GraphicsMenu({
  choice,
  active,
  limit,
  light,
  onChoice,
  onLight,
}: {
  choice: GraphicsChoice;
  active: GraphicsProfile;
  limit: string;
  light: LightState;
  onChoice: (choice: GraphicsChoice) => void;
  onLight: (light: LightState) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Qualidade gráfica" title="Qualidade gráfica">
          <SlidersHorizontal size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="unit-map-quality"
        align="end"
        sideOffset={8}
        collisionPadding={10}
        aria-label="Qualidade gráfica"
      >
        <fieldset>
          <legend>Qualidade gráfica</legend>
          {(["auto", "low", "balanced", "high"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="unit-map-quality"
                value={value}
                checked={choice === value}
                onChange={() => onChoice(value)}
              />
              <span>{value === "auto" ? "Automática (recomendada)" : PROFILE_LABELS[value]}</span>
            </label>
          ))}
          <p role="status">
            {choice === "auto"
              ? `Perfil ativo: ${PROFILE_LABELS[active]}`
              : `Perfil escolhido: ${PROFILE_LABELS[active]}`}
          </p>
          {limit && <p className="unit-map-quality-limit">{limit}</p>}
        </fieldset>
        <fieldset>
          <legend>Hora do dia</legend>
          {(["day", "late"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="unit-map-light"
                checked={light === value}
                onChange={() => onLight(value)}
              />
              <span>{value === "day" ? "Dia" : "Fim de tarde"}</span>
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
