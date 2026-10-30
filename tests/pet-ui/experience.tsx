/* eslint-disable react-refresh/only-export-components -- Standalone presentation-only test entry. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/nexus/AppShell";
import { PetFicha } from "@/features/pet/PetWorkspace";
import { PetAppearanceProvider } from "@/features/pet/PetAppearance";
import { PetDocumentos } from "@/features/pet/PetDocumentos";
import { PetContingencia } from "@/features/pet/PetContingencia";
import { experienceDetail, experienceOptions, ORG, USER } from "./experience-fixtures";
import type { PetUICommand } from "@/features/pet/ui-types";
import "@/styles.css";

const state = new URLSearchParams(location.search).get("state") || "emitted";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
Object.assign(window, { __petCommands: [] });
function Presentation() {
  const [record, setRecord] = useState(() => experienceDetail(state));
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const controls = window as unknown as { __petSetState?: (state: string) => void };
    controls.__petSetState = (nextState) =>
      setRecord((previous) => {
        const next = experienceDetail(nextState);
        return { ...next, pet: { ...next.pet, version: previous.pet.version + 1 } };
      });
    return () => {
      delete controls.__petSetState;
    };
  }, []);
  async function command(command: PetUICommand) {
    (window as unknown as { __petCommands: PetUICommand[] }).__petCommands.push(command);
    if (new URLSearchParams(location.search).get("failure") === "1") {
      setError(new Error("Falha de rede de apresentação. O preenchimento foi preservado."));
      return false;
    }
    if (command.comando === "encerrar")
      setRecord((previous) => ({
        ...previous,
        pet: {
          ...previous.pet,
          version: previous.pet.version + 1,
          estado_documental: "encerramento_pendente",
          revisao_atual_id: "local-final",
        },
        revisoes: [
          ...previous.revisoes,
          {
            id: "local-final",
            finalidade: "encerramento",
            versao: 2,
            conteudo: {
              condicao_final: command.dados["condicao_final"],
              motivo: command.dados["motivo"],
              termino_operacional_em: previous.pet.termino_operacional_em,
            },
          },
        ],
      }));
    if (command.comando === "registrar_saida") setRecord(experienceDetail("closing-preparation"));
    if (command.comando === "cancelar") setRecord(experienceDetail("cancelled"));
    return true;
  }
  return (
    <QueryClientProvider client={client}>
      <div
        style={{
          padding: "9px 15px",
          fontSize: 12,
          lineHeight: 1.5,
          textAlign: "center",
          background: "#263832",
          color: "white",
        }}
      >
        APRESENTAÇÃO · registros sintéticos · sem banco, provedor ou validação de emissão
        certificada
      </div>
      <AppShell>
        <PetAppearanceProvider organizationId={ORG} userId={USER}>
          <PetFicha
            detail={record}
            options={experienceOptions}
            onCommand={command}
            error={error}
            documentos={
              <PetDocumentos
                organizationId={ORG}
                petId={record.pet.id}
                versao={record.pet.version}
                documentos={record.documentos}
              />
            }
            contingencia={<PetContingencia organizationId={ORG} petId={record.pet.id} />}
          />
        </PetAppearanceProvider>
      </AppShell>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Presentation />);
