interface NexusLogoProps {
  className?: string;
}

/** Marca tipográfica central: nítida em qualquer tamanho e sempre monocromática. */
export function NexusLogo({ className = "text-3xl" }: NexusLogoProps) {
  return (
    <span
      aria-label="NEXUS"
      role="img"
      className={`select-none whitespace-nowrap font-display font-extrabold italic leading-none tracking-tight text-foreground ${className}`}
    >
      NEXUS
    </span>
  );
}
