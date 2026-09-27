interface NexusLogoProps {
  className?: string;
}

/**
 * NEXUS-sana piirrettynä fontilla (Saira) rasterikuvan sijaan:
 * pysyy terävänä missä tahansa koossa, X on brändin neonvihreä.
 */
export function NexusLogo({ className = "text-3xl" }: NexusLogoProps) {
  return (
    <span
      aria-label="NEXUS"
      role="img"
      className={`select-none whitespace-nowrap font-display font-extrabold italic leading-none tracking-tight text-foreground ${className}`}
    >
      NE<span className="text-primary">X</span>US
    </span>
  );
}
