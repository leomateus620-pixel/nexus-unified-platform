import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePetAppearance } from "./PetAppearance";
import { filterPetPickerOptions, type PetPickerOption } from "./preparation-domain";
import "./pet-preparation.css";

export function PetPicker({
  id: suppliedId,
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Buscar e selecionar",
  hint,
  error,
}: {
  id?: string;
  label: string;
  value: string;
  options: PetPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const { theme } = usePetAppearance();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const rows = filterPetPickerOptions(options, search);
  const selected = options.find((option) => option.id === value);
  const activeIndex =
    rows[active] && !rows[active]?.disabled ? active : rows.findIndex((row) => !row.disabled);
  const describedBy =
    [hint ? id + "-hint" : "", error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined;
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-picker-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, search]);
  const choose = (index: number) => {
    const option = rows[index];
    if (!option || option.disabled) return;
    onChange(option.id);
    setOpen(false);
    setSearch("");
    setActive(0);
  };
  const move = (direction: 1 | -1) => {
    let next = activeIndex;
    do {
      next += direction;
    } while (rows[next]?.disabled);
    if (rows[next]) setActive(next);
  };
  return (
    <div className="nx-pet-field pet-picker">
      <span id={id + "-label"}>{label}</span>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSearch("");
            setActive(0);
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            className="pet-picker-trigger"
            disabled={disabled}
            aria-labelledby={id + "-label"}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            aria-haspopup="listbox"
          >
            <span>{selected?.label || (value ? "Vínculo preservado" : placeholder)}</span>
            <ChevronsUpDown size={16} aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="pet-picker-popup"
            data-pet-theme={theme}
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              input.current?.focus();
            }}
          >
            <div className="pet-picker-search">
              <Search size={17} aria-hidden />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
                aria-expanded={open}
                aria-controls={id + "-list"}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? id + "-option-" + activeIndex : undefined}
                placeholder="Buscar…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    move(event.key === "ArrowDown" ? 1 : -1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    setActive(rows.findIndex((row) => !row.disabled));
                  } else if (event.key === "End") {
                    event.preventDefault();
                    setActive(rows.map((row) => !!row.disabled).lastIndexOf(false));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    choose(activeIndex);
                  }
                }}
              />
            </div>
            <div
              ref={list}
              id={id + "-list"}
              className="pet-picker-options"
              role="listbox"
              aria-labelledby={id + "-label"}
            >
              {rows.map((option, index) => (
                <button
                  key={option.id}
                  id={id + "-option-" + index}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={option.id === value}
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  data-picker-index={index}
                  data-active={index === activeIndex}
                  onMouseMove={() => {
                    if (!option.disabled) setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.id === value && <Check size={17} aria-hidden />}
                </button>
              ))}
            </div>
            {!rows.length && (
              <p role="status" className="pet-picker-empty">
                Nenhum resultado encontrado.
              </p>
            )}
            <p className="pet-picker-help">Use ↑ ↓ para navegar e Enter para selecionar.</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {hint && <small id={id + "-hint"}>{hint}</small>}
      {error && (
        <span role="alert" id={id + "-error"} className="nx-pet-field-error">
          {error}
        </span>
      )}
    </div>
  );
}
