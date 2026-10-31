import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, LoaderCircle } from "lucide-react";
import { nrArquivoImagem } from "./files.functions";

// Signing and transfer work begins close to the viewport, with a bounded client queue.
let active = 0;
const waiting: (() => void)[] = [];
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  if (active < 4) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
type Variant = "miniatura_384" | "previa_768" | "original";
export function NrMediaImage({
  org,
  fileId,
  version,
  alt,
  full = false,
  zoom = 1,
  variant,
  fallbackFileId,
  onOriginalAvailabilityChange,
}: {
  org: string;
  fileId: string | null;
  version?: string;
  alt: string;
  full?: boolean;
  zoom?: number;
  variant?: Variant | undefined;
  fallbackFileId?: string | null;
  onOriginalAvailabilityChange?: (available: boolean | null) => void;
}) {
  const load = useServerFn(nrArquivoImagem);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(full);
  const [failed, setFailed] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [densityVariant, setDensityVariant] = useState<Variant | null>(null);
  const effectiveVariant = variant ?? (full ? "original" : densityVariant);
  const renewal = useRef(false);
  const generation = useRef({ id: 0 });
  // Resolve density before visibility enables signing, avoiding a 384 request followed by 768.
  useEffect(() => {
    if (full || variant) return;
    const density = window.matchMedia("(min-resolution: 1.5dppx)");
    const update = () => setDensityVariant(density.matches ? "previa_768" : "miniatura_384");
    update();
    density.addEventListener("change", update);
    return () => density.removeEventListener("change", update);
  }, [full, variant]);
  useEffect(() => {
    const current = generation.current;
    current.id++;
    setFailed(false);
    setRenewing(false);
    setAttempt(0);
    setLoadedUrl(null);
    renewal.current = false;
    return () => {
      current.id++;
    };
  }, [org, fileId, version, effectiveVariant]);
  useEffect(() => {
    if (full || !ref.current || !fileId) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!!entry?.isIntersecting);
      },
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [full, fileId]);
  const query = useQuery({
    queryKey: ["nr", org, "imagem-privada", fileId, effectiveVariant, version],
    enabled: visible && !!fileId && !!effectiveVariant,
    queryFn: ({ signal }) =>
      bounded(() => {
        signal.throwIfAborted();
        return load({
          data: { organization_id: org, id: fileId!, variante: effectiveVariant! },
          signal,
        });
      }),
    staleTime: (query) =>
      Math.max(0, Date.parse(query.state.data?.expira_em || "") - Date.now() - 5000) || 0,
    gcTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      visible &&
      query.state.dataUpdateCount < 7 &&
      ["fila", "processando"].includes(query.state.data?.estado || "")
        ? 5000
        : false,
  });
  useEffect(() => {
    onOriginalAvailabilityChange?.(
      query.isError ||
        failed ||
        renewing ||
        !query.data?.url ||
        !loadedUrl ||
        loadedUrl !== query.data.url
        ? null
        : (query.data?.original_disponivel ?? null),
    );
  }, [
    onOriginalAvailabilityChange,
    query.isError,
    query.data?.url,
    query.data?.original_disponivel,
    loadedUrl,
    failed,
    renewing,
  ]);
  const status = !fileId
    ? "Arquivo ainda não recuperado"
    : query.isError
      ? /acesso|autorizad/i.test(query.error.message)
        ? "Acesso não autorizado"
        : "Prévia temporariamente indisponível"
      : failed
        ? "Falha ao carregar a imagem"
        : query.data?.estado === "falhou"
          ? "Falha ao processar a miniatura"
          : query.data?.estado === "sem_representacao"
            ? "Miniatura ainda não gerada"
            : ["fila", "processando"].includes(query.data?.estado || "")
              ? "Miniatura em processamento"
              : query.isFetching && renewal.current
                ? "Renovando acesso à imagem…"
                : full
                  ? "Carregando imagem…"
                  : "Carregando miniatura…";
  const showSourcePreview =
    !full &&
    !!fallbackFileId &&
    fallbackFileId !== fileId &&
    !query.isError &&
    !query.data?.url &&
    ["fila", "processando", "falhou", "sem_representacao"].includes(query.data?.estado || "");
  return (
    <div ref={ref} className={full ? "nr-media-image nr-media-image--full" : "nr-media-image"}>
      {showSourcePreview ? (
        <div className="flex h-full w-full flex-col" data-nr-media-source="origem">
          <NrMediaImage
            key={`${org}:${fallbackFileId}`}
            org={org}
            fileId={fallbackFileId!}
            variant="original"
            alt={`${alt} · prévia da origem`}
          />
          <p className="nr-media-state" role="status">
            Prévia da origem · {status}
          </p>
        </div>
      ) : query.data?.url && !failed && !renewing ? (
        <img
          key={attempt}
          src={query.data.url}
          alt={alt}
          loading={full ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedUrl(query.data!.url)}
          onError={() => {
            setLoadedUrl(null);
            if (!renewal.current) {
              const requestedGeneration = generation.current.id;
              renewal.current = true;
              setRenewing(true);
              void query.refetch().then((result) => {
                if (requestedGeneration !== generation.current.id) return;
                setAttempt((value) => value + 1);
                setRenewing(false);
                if (result.isError || !result.data?.url) setFailed(true);
              });
            } else setFailed(true);
          }}
          style={
            full
              ? { width: `${zoom * 100}%`, height: `${60 * zoom}dvh`, maxWidth: "none" }
              : undefined
          }
        />
      ) : (
        <div className="nr-media-state" role="status">
          {fileId && query.isFetching ? (
            <LoaderCircle size={22} aria-hidden className="nr-media-loading" />
          ) : (
            <ImageOff size={24} aria-hidden />
          )}
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
