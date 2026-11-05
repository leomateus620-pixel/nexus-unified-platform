import { demoDetail, type DemoDetail } from "./domain";
import type { Json } from "../schemas";

// Export is explicit. Collect bounded pages and reject a moving snapshot.
export async function demoExportDetail(
  read: () => Promise<DemoDetail>,
  page: (
    resource: "eventos" | "anexos",
    index: number,
  ) => Promise<{ total: number; registros: Json[] }>,
): Promise<DemoDetail> {
  const first = await read();
  const collect = async (resource: "eventos" | "anexos") => {
    const rows: Json[] = [];
    let total = -1;
    for (let index = 0; ; index++) {
      const current = await page(resource, index);
      if (total !== -1 && current.total !== total)
        throw Error("O histórico mudou durante a exportação. Tente novamente.");
      total = current.total;
      rows.push(...current.registros);
      if (rows.length >= total) return rows;
      if (!current.registros.length)
        throw Error("A consulta do histórico foi interrompida. Tente novamente.");
    }
  };
  const eventos = demoDetail.shape.eventos.parse(await collect("eventos"));
  const anexos = demoDetail.shape.anexos.parse(await collect("anexos"));
  const last = await read();
  if (first.sessao.version !== last.sessao.version)
    throw Error("A demonstração foi atualizada durante a exportação. Tente novamente.");
  return { ...last, eventos, anexos };
}
