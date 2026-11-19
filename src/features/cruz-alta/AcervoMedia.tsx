import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileImage } from "lucide-react";
import { caAcervoMidia } from "./acervo.functions";

type Scope = {
  organization_id: string;
  chave: string;
  documento_id: string;
  revisao_id: string;
};
type Media = NonNullable<Awaited<ReturnType<typeof caAcervoMidia>>>;
type ImageVariant = Exclude<Media["variante"], "anexo_office">;

function useImageAuthorization(
  scope: Scope,
  user: string,
  variante: ImageVariant,
  enabled: boolean,
) {
  const authorize = useServerFn(caAcervoMidia);
  return useQuery({
    queryKey: ["cruz-alta-imagem", user, scope, variante],
    queryFn: ({ signal }) => authorize({ data: { ...scope, variante }, signal }),
    enabled,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: enabled && variante !== "miniatura_384" ? 30_000 : false,
  });
}

function usePrivateImage(media: Media | null | undefined, attempt = 0) {
  const latest = useRef(media);
  latest.current = media;
  const key = media ? `${media.variante}/${media.versao}/${attempt}` : "";
  const [result, setResult] = useState<{ key: string; src?: string }>();
  useEffect(() => {
    if (!key || !latest.current) return;
    const controller = new AbortController();
    let localUrl: string | undefined;
    void fetch(latest.current.url, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Imagem indisponível.");
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        localUrl = URL.createObjectURL(blob);
        setResult({ key, src: localUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key });
      });
    return () => {
      controller.abort();
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [key]);
  return key && result?.key === key ? result : undefined;
}

export function AcervoImageThumbnail({ scope, user }: { scope: Scope; user: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const query = useImageAuthorization(scope, user, "miniatura_384", visible);
  const image = usePrivateImage(query.isError ? undefined : query.data);
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (visible || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [visible]);
  return (
    <span className="ca-doc-icon ca-doc-thumbnail" aria-hidden="true" ref={frame}>
      {image?.src && image.src !== failed ? (
        <img src={image.src} alt="" decoding="async" onError={() => setFailed(image.src)} />
      ) : (
        <FileImage size={18} />
      )}
    </span>
  );
}

export function AcervoImageReader({
  scope,
  user,
  title,
}: {
  scope: Scope;
  user: string;
  title: string;
}) {
  const [original, setOriginal] = useState(false);
  const [attempt, setAttempt] = useState({ preview: 0, original: 0 });
  const [loaded, setLoaded] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const preview = useImageAuthorization(scope, user, "previa_768", !original);
  const full = useImageAuthorization(scope, user, "original", original);
  const query = original ? full : preview;
  const authorized = !query.isError;
  const previewImage = usePrivateImage(authorized ? preview.data : undefined, attempt.preview);
  const fullImage = usePrivateImage(
    authorized && original ? full.data : undefined,
    attempt.original,
  );
  const requested = original ? fullImage : previewImage;
  const source = requested?.src;
  const visible = source && source === loaded ? source : previewImage?.src;
  const error = query.isError || (requested && (!source || failed === source));
  const pending = !error && !(source && source === loaded);
  const offerOriginal = preview.data?.variante === "previa_768" && !original;
  return (
    <div className="ca-acervo-image-reader" aria-busy={pending}>
      {offerOriginal && (
        <button className="ca-action" type="button" onClick={() => setOriginal(true)}>
          Ver original
        </button>
      )}
      {error ? (
        <div className="ca-feedback" role="status">
          <span>Não foi possível carregar a imagem.</span>
          <button
            className="ca-action"
            type="button"
            onClick={async () => {
              const refreshed = await query.refetch();
              if (refreshed.data && !refreshed.isError) {
                setFailed(undefined);
                const mode = original ? "original" : "preview";
                setAttempt((value) => ({ ...value, [mode]: value[mode] + 1 }));
              }
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : source && source === loaded ? null : (
        <p role="status">{original ? "Carregando original…" : "Carregando imagem…"}</p>
      )}
      {visible && failed !== visible && visible !== source && (
        <img src={visible} alt={title} className="ca-reader-image" decoding="async" />
      )}
      {source && failed !== source && (
        <img
          key={source}
          src={source}
          alt={visible && visible !== source ? "" : title}
          aria-hidden={!!visible && visible !== source}
          className="ca-reader-image"
          data-ready={source === loaded}
          data-representation={query.data?.variante}
          decoding="async"
          onLoad={() => setLoaded(source)}
          onError={() => setFailed(source)}
        />
      )}
    </div>
  );
}

export function AcervoOfficeDownload({ scope }: { scope: Scope }) {
  const authorize = useServerFn(caAcervoMidia);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const file = await authorize({
        data: { ...scope, variante: "anexo_office" },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!file) throw new Error("Download indisponível.");
      const link = document.createElement("a");
      link.href = file.url;
      link.download = file.nome;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="ca-actions">
      <button className="ca-action" type="button" disabled={busy} onClick={() => void download()}>
        <Download size={16} aria-hidden="true" />{" "}
        {busy ? "Preparando download…" : "Baixar original"}
      </button>
      {failed && <p role="alert">Download privado indisponível. Tente novamente.</p>}
    </div>
  );
}
