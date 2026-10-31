import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NrClientBrand, type NrClientIdentity } from "./NrClientBrand";

// The context gate remounts this control on an authorized client change.
// Carry only the requested focus target across that remount, never customer content.
let pendingClientFocus: { id: string; value: string; expires: number } | null = null;

/** Mantém o ID canônico como valor e confirma a troca apenas ao selecionar uma opção. */
export function NrClientSelect({
  clientes,
  value,
  onValueChange,
  id,
  disabled = false,
}: {
  clientes: NrClientIdentity[];
  value: string;
  onValueChange: (id: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = clientes.find((client) => client.id === value);
  useEffect(() => {
    if (pendingClientFocus && pendingClientFocus.expires < Date.now()) pendingClientFocus = null;
    if (id && pendingClientFocus?.id === id && pendingClientFocus.value === value) {
      pendingClientFocus = null;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [id, value]);
  const choose = (next: string) => {
    if (next !== value) {
      if (id) pendingClientFocus = { id, value: next, expires: Date.now() + 30_000 };
      onValueChange(next);
    }
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          ref={trigger}
          type="button"
          role="combobox"
          aria-label={`Cliente: ${selected?.nome || (value ? "indisponível" : "Todos os clientes")}`}
          aria-expanded={open}
          aria-controls={list}
          aria-haspopup="listbox"
          disabled={disabled}
          className="nr-client-combobox"
        >
          {selected ? (
            <NrClientBrand client={selected} compact />
          ) : (
            <span>{value ? "Cliente indisponível" : "Todos os clientes"}</span>
          )}
          <ChevronsUpDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="nr-brand-options"
        collisionPadding={12}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <Command defaultValue={value || "__todos_clientes__"}>
          <CommandInput aria-label="Buscar cliente" placeholder="Buscar cliente…" />
          <CommandList id={list}>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__todos_clientes__"
                keywords={["Todos os clientes"]}
                onSelect={() => choose("")}
              >
                <span className="nr-brand-option-name">Todos os clientes</span>
                {!value && (
                  <>
                    <Check size={16} aria-hidden="true" />
                    <span className="sr-only">Contexto atual</span>
                  </>
                )}
              </CommandItem>
              {clientes.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  keywords={[client.nome]}
                  onSelect={() => choose(client.id)}
                >
                  <NrClientBrand client={client} compact />
                  {value === client.id && (
                    <>
                      <Check size={16} aria-hidden="true" />
                      <span className="sr-only">Cliente atual</span>
                    </>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
