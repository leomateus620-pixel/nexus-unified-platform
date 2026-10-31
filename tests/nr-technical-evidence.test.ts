import { describe, expect, it } from "vitest";
import {
  photoOccurrences,
  sourceDate,
  technicalEvents,
  treatmentOriginDate,
} from "../src/features/nr/technical-evidence";

describe("projeção das evidências históricas NR", () => {
  it("recupera data sem hora de tratativa somente com a prova da própria conversão UTC", () => {
    const imported = { tipo: "historico_importado", data_origem: "2026-10-11T00:00:00+00:00" };
    expect(treatmentOriginDate(imported, { encerrada_em: "2026-10-11" })).toBe("2026-10-11");
    expect(
      treatmentOriginDate(
        { ...imported, data_origem: "2026-10-11 00:00:00+00" },
        { atualizado_em: "2026-10-11" },
      ),
    ).toBe("2026-10-11");
    expect(
      treatmentOriginDate({ ...imported, tipo: "comentario" }, { encerrada_em: "2026-10-11" }),
    ).toBe(imported.data_origem);
    expect(
      treatmentOriginDate(imported, { encerrada_em: "2026-10-10", atualizado_em: "2026-10-11" }),
    ).toBe(imported.data_origem);
    expect(
      treatmentOriginDate(
        { ...imported, data_origem: "2026-10-11T03:00:00Z" },
        { encerrada_em: "2026-10-11" },
      ),
    ).toBe("2026-10-11T03:00:00Z");
    expect(
      treatmentOriginDate(
        { ...imported, data_origem: "2026-10-11T00:00:00-03:00" },
        { encerrada_em: "2026-10-11" },
      ),
    ).toBe("2026-10-11T00:00:00-03:00");
    expect(
      treatmentOriginDate(
        { ...imported, data_origem: "2026-02-31T00:00:00Z" },
        { encerrada_em: "2026-02-31" },
      ),
    ).toBe("2026-02-31T00:00:00Z");
    expect(
      treatmentOriginDate(
        { tipo: "historico_importado", created_at: "2026-10-30T15:00:00Z" },
        { encerrada_em: "2026-10-11" },
      ),
    ).toBe("2026-10-30T15:00:00Z");
  });
  it("torna cada narrativa técnica acessível sem convertê-la em operação Nexus", () => {
    const values = Array.from({ length: 7 }, (_, index) => ({
      data: "2026-10-11",
      autor: "Responsável histórico",
      acao: `Narrativa integral ${index + 1}`,
      campo_futuro: { fonte: "origem" },
    }));
    const events = technicalEvents(values);
    expect(events).toHaveLength(7);
    expect(events.map((event) => event.action)).toEqual(values.map((value) => value.acao));
    expect(events[0]).toMatchObject({
      date: "2026-10-11",
      author: "Responsável histórico",
      extra: { campo_futuro: { fonte: "origem" } },
    });
    expect(events.every((event) => !("created_at" in event) && !("importado_em" in event))).toBe(
      true,
    );
  });
  it("preserva datas sem hora e datas cuja zona não é conhecida", () => {
    expect(sourceDate("2026-10-11")).toBe("11/10/2026");
    expect(sourceDate("2026-10-11T08:30:00")).toBe("2026-10-11T08:30:00");
    expect(sourceDate("11/10/2026, pela manhã")).toBe("11/10/2026, pela manhã");
    expect(sourceDate(undefined)).toBe("Data não informada");
  });
  it("não elimina ocorrências que compartilham o mesmo caminho e mantém legendas individuais", () => {
    const images = photoOccurrences([
      {
        arquivo: "fotos/unidade/original.jpg",
        miniatura: "fotos/unidade/thumb/original.jpg",
        legenda: "Acesso superior",
        data: "2026-07-30",
        autor: "Técnico histórico",
        grupo: "Acessos",
      },
      {
        arquivo: "fotos/unidade/original.jpg",
        legenda: "Mesmo arquivo, contexto de resgate",
        origem: "Evidência do plano",
      },
    ]);
    expect(images).toHaveLength(2);
    expect(new Set(images.map((image) => image.key)).size).toBe(2);
    expect(images[0]).toMatchObject({
      caption: "Acesso superior",
      sourcePath: "fotos/unidade/original.jpg",
      thumbnailPath: "fotos/unidade/thumb/original.jpg",
      author: "Técnico histórico",
      category: "Acessos",
    });
    expect(images[1]?.extra).toEqual({ origem: "Evidência do plano" });
  });
  it("somente relações explícitas com UUID autorizam buscar bytes; nome, caminho e ID de origem não provam identidade", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const images = photoOccurrences([
      { arquivo: "EC_01.jpg", id, candidato_arquivo_id: id },
      { arquivo: `fotos/${id}.jpg`, arquivo_id: "drive-original" },
      { arquivo: "EC_01.jpg", arquivo_id: id },
    ]);
    expect(images.map((image) => image.fileId)).toEqual([null, null, id]);
  });
  it("conserva propriedades não reconhecidas e narrativas textuais", () => {
    expect(technicalEvents(["Narrativa sem metadados"])[0]).toMatchObject({
      text: "Narrativa sem metadados",
      date: "",
      author: "",
    });
    expect(
      photoOccurrences({ evidência: { arquivo: "origem.jpg", atributo_desconhecido: [1, 2] } })[0],
    ).toMatchObject({ key: "evidência", extra: { atributo_desconhecido: [1, 2] } });
  });
});
