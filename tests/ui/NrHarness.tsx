// Isolated UI harness. These fixtures and this entry never ship in the Nexus application.
import { useEffect, useState } from "react";
import { NrWorkspace, type NrSearch, type NrSection } from "@/features/nr/NrWorkspace";
import { nrSearchSchema } from "@/features/nr/route-state";
const parseSearch = (params: URLSearchParams) =>
  nrSearchSchema.parse({
    ...Object.fromEntries(params),
    lixeira: params.get("lixeira") === "true",
    copias: params.get("copias") === "true",
  });
export function NrHarness({ norma }: { norma: "NR33" | "NR35" }) {
  const params = new URLSearchParams(location.search);
  const [search, setSearch] = useState<NrSearch>(() => parseSearch(params));
  const [path, setPath] = useState(params.get("nrPath") || "");
  useEffect(() => {
    const update = () => {
      const p = new URLSearchParams(location.search);
      setPath(p.get("nrPath") || "");
      setSearch(parseSearch(p));
    };
    window.addEventListener("popstate", update);
    window.addEventListener("nr-lab-navigation", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("nr-lab-navigation", update);
    };
  }, []);
  const [section, id] = path.split("/");
  return (
    <>
      <p
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 90,
          background: "#fff4c0",
          border: "1px solid #b38300",
          color: "#382b00",
          padding: "4px 8px",
          fontSize: 12,
        }}
      >
        Laboratório isolado · dados sintéticos
      </p>
      <NrWorkspace
        norma={norma}
        section={(section || "visao-geral") as NrSection}
        id={id}
        search={search}
        onSearch={(patch) => {
          const next = { ...search, ...patch };
          setSearch(next);
          const url = new URL(location.href);
          for (const [key, value] of Object.entries(next)) {
            if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
            else url.searchParams.delete(key);
          }
          history.pushState({}, "", url);
        }}
      />
    </>
  );
}
