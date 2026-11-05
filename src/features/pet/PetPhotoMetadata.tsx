import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { petFotosListar, petFotoRegistrar } from "./consulta.functions";
import { useOrg } from "@/features/org/session";
export function PetPhotoMetadata({
  org,
  petId,
  version,
  editable,
}: {
  org: string;
  petId: string;
  version: number;
  editable: boolean;
}) {
  const load = useServerFn(petFotosListar),
    save = useServerFn(petFotoRegistrar),
    session = useOrg(),
    cache = useQueryClient(),
    key = useCommandKey(),
    lock = useRef(false);
  const [id, setId] = useState(""),
    [when, setWhen] = useState(""),
    [caption, setCaption] = useState(""),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [accuracy, setAccuracy] = useState<number | null>(null),
    [origin, setOrigin] = useState<"declarada" | "dispositivo">("declarada"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const q = useQuery({
    queryKey: ["pet", org, session.data?.userId, "fotos-metadados", petId],
    queryFn: ({ signal }) => load({ data: { organization_id: org, pet_id: petId }, signal }),
    retry: false,
  });
  function locate() {
    if (!navigator.geolocation) {
      setError(new Error("Localização não disponível neste dispositivo."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(String(p.coords.latitude));
        setLng(String(p.coords.longitude));
        setAccuracy(p.coords.accuracy);
        setOrigin("dispositivo");
      },
      () =>
        setError(
          new Error("Não foi possível obter a localização. Nenhuma coordenada foi presumida."),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        organization_id: org,
        pet_id: petId,
        anexo_id: id,
        expected_version: version,
        dados: {
          capturada_em: new Date(when).toISOString(),
          latitude: lat ? Number(lat) : null,
          longitude: lng ? Number(lng) : null,
          precisao_m: accuracy,
          origem: origin,
          legenda: caption,
        },
      };
      await save({ data: { ...payload, chave: key(payload) } });
      setId("");
      await cache.invalidateQueries({ queryKey: ["pet", org] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Metadados não confirmados."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="nx-pet-panel">
      <summary>Fotos · data, hora e localização</summary>
      <p className="nx-pet-hint">
        Anexe o original ao item correspondente e depois registre seus metadados. Data e coordenadas
        são evidências declaradas; não comprovam autenticidade da captura. O arquivo original é
        preservado.
      </p>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length ? (
        q.data.map((p) => (
          <article className="nx-pet-card mt-3" key={p.id}>
            <strong>{p.nome}</strong>
            <p>Item: {p.item ?? "Geral"}</p>
            {p.metadados ? (
              <>
                <p>{p.metadados.legenda}</p>
                <p>
                  {new Date(p.metadados.capturada_em).toLocaleString("pt-BR")} ·{" "}
                  {p.metadados.latitude == null
                    ? "GPS não informado"
                    : `${p.metadados.latitude}, ${p.metadados.longitude}`}{" "}
                  · {p.metadados.origem}
                </p>
              </>
            ) : editable ? (
              <ActionButton
                onClick={() => {
                  setId(p.id);
                  setWhen("");
                  setCaption("");
                  setLat("");
                  setLng("");
                  setAccuracy(null);
                  setOrigin("declarada");
                }}
              >
                Registrar metadados
              </ActionButton>
            ) : (
              <p>Metadados não registrados.</p>
            )}
          </article>
        ))
      ) : (
        <p>Nenhuma foto confirmada nesta PET.</p>
      )}
      {id && editable && (
        <form
          className="grid gap-3 mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Data e hora da captura
            <input
              className="w-full rounded border p-2"
              type="datetime-local"
              value={when}
              required
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label>
            Legenda
            <textarea
              className="w-full rounded border p-2"
              value={caption}
              minLength={3}
              maxLength={2000}
              required
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          <label>
            Latitude
            <input
              className="w-full rounded border p-2"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={lat}
              onChange={(e) => {
                setLat(e.target.value);
                setOrigin("declarada");
                setAccuracy(null);
              }}
            />
          </label>
          <label>
            Longitude
            <input
              className="w-full rounded border p-2"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={lng}
              onChange={(e) => {
                setLng(e.target.value);
                setOrigin("declarada");
                setAccuracy(null);
              }}
            />
          </label>
          <ActionButton type="button" variant="ghost" onClick={locate}>
            Obter localização atual do dispositivo
          </ActionButton>
          <p className="nx-pet-hint">
            Use a localização atual somente se corresponder ao ponto da foto. Nenhuma coordenada do
            mapa 3D é copiada.
          </p>
          <ActionButton type="submit" loading={busy}>
            Confirmar metadados da foto
          </ActionButton>
          <ActionButton type="button" variant="ghost" onClick={() => setId("")}>
            Voltar
          </ActionButton>
        </form>
      )}
      {error && <ErrorState error={error} />}
    </details>
  );
}
