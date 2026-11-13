import { useRef } from "react";

export function useInspecoesChave() {
  const ref = useRef<{ signature: string; id: string } | null>(null);
  return (value: unknown) => {
    const signature = JSON.stringify(value);
    if (ref.current?.signature !== signature) ref.current = { signature, id: crypto.randomUUID() };
    return ref.current.id;
  };
}
