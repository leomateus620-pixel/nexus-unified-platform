import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  configuracaoAgenda,
  listaAgenda,
  detalheAgenda,
  acaoAgenda,
  pendentesPage,
  notificacoesPage,
  opcoesPage,
  revisoesPage,
  comentariosPage,
  reciboAgenda,
} from "../src/features/agenda-equipe/schemas";
// Captura SQL de organizações/pessoas fictícias em PostgreSQL descartável, BEGIN/ROLLBACK.
// Não é fixture de aplicação e não representa banco operacional, Auth ou Storage conectado.
const path = process.env["AGENDA_DTO_INPUT"]
  ? resolve(process.env["AGENDA_DTO_INPUT"])
  : new URL("./fixtures/agenda-dto-postgres.json", import.meta.url);
const raw: Record<string, unknown> = JSON.parse(readFileSync(path, "utf8"));
const shapes = {
  configuracao: configuracaoAgenda,
  lista: listaAgenda,
  detalhe: detalheAgenda,
  acao: acaoAgenda,
  pendentes: pendentesPage,
  notificacoes: notificacoesPage,
  opcoes: opcoesPage,
  historico_revisoes: revisoesPage,
  historico_comentarios: comentariosPage,
};
describe("Agenda: paridade DTO PostgreSQL descartável → Zod", () => {
  for (const [name, schema] of Object.entries(shapes))
    it(name, () => {
      expect(schema.safeParse(raw[name])).toMatchObject({ success: true });
    });
  const receipts = raw["recibos"];
  if (!Array.isArray(receipts) || receipts.length < 7)
    throw new Error("A captura precisa conter os sete tipos de recibos, além das nove leituras.");
  for (const [receipt, index] of receipts.map((r: unknown, i: number) => [r, i] as const))
    it(`recibo ${index}`, () => {
      expect(reciboAgenda.safeParse(receipt)).toMatchObject({ success: true });
    });
});
