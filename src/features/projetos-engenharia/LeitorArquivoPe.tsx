import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { baixarArquivoPe, obterArquivoPe, type PeArquivo } from "./pe-arquivos.functions";
import { createPeReaderAdapter } from "./reader-adapter";

const LeitorOriginalPe = lazy(() =>
  import("./leitor/LeitorOriginalPe").then((module) => ({ default: module.LeitorOriginalPe })),
);
export type LeitorArquivoPeProps = {
  organizationId: string;
  versaoId: string;
  arquivo: PeArquivo;
  onClose: () => void;
};
class ReaderLoadBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <div role="alert" className="grid gap-2 rounded-md border border-border p-3 text-sm">
          <p>Não foi possível carregar o leitor. Feche e tente novamente.</p>
          <ActionButton variant="ghost" onClick={this.props.onClose}>
            Fechar leitor
          </ActionButton>
        </div>
      );
    return this.props.children;
  }
}
export function LeitorArquivoPe({
  organizationId,
  versaoId,
  arquivo,
  onClose,
}: LeitorArquivoPeProps) {
  const [scope, setScope] = useState<AbortController | null>(null);
  useEffect(() => {
    // Effect ownership creates a fresh scope after StrictMode's simulated cleanup.
    const controller = new AbortController();
    setScope(controller);
    return () => controller.abort();
  }, []);
  const { id, projeto_id, sha256, tamanho, mime, caminho } = arquivo;
  const adapter = useMemo(
    () =>
      createPeReaderAdapter({
        expected: {
          id,
          organization_id: organizationId,
          projeto_id,
          versao_id: versaoId,
          sha256,
          tamanho,
          mime,
          caminho,
        },
        storageBaseUrl: import.meta.env["VITE_SUPABASE_URL"] ?? "",
        obter: (signal) =>
          obterArquivoPe({ data: { organization_id: organizationId, id }, signal }),
        baixar: (signal) =>
          baixarArquivoPe({ data: { organization_id: organizationId, id }, signal }),
      }),
    [organizationId, versaoId, id, projeto_id, sha256, tamanho, mime, caminho],
  );
  return (
    <ReaderLoadBoundary onClose={onClose}>
      <Suspense
        fallback={
          <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <span>Carregando leitor…</span>
            <ActionButton variant="ghost" onClick={onClose}>
              Cancelar abertura
            </ActionButton>
          </div>
        }
      >
        {scope && !scope.signal.aborted && (
          <LeitorOriginalPe
            organizationId={organizationId}
            versaoId={versaoId}
            arquivo={{ id, nome: arquivo.nome, sha256, tamanho, mime }}
            fetchAuthorized={adapter.fetchAuthorized}
            checkAccess={adapter.checkAccess}
            sessionSignal={scope.signal}
            onClose={onClose}
          />
        )}
      </Suspense>
    </ReaderLoadBoundary>
  );
}
