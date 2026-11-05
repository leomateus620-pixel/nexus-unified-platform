import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { petResult } from "../errors";
import { demoScope, demoContext, demoDetail, demoList, demoCommand } from "./domain";
import { demoRecords } from "./domain";
const db = (v: unknown) => v as SupabaseClient;
const idScope = demoScope.extend({ id: z.string().uuid() });
export const petDemoRegistros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    idScope.extend({
      recurso: z.enum(["eventos", "anexos"]),
      pagina: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    await scopedDetail(client, data);
    return demoRecords.parse(
      petResult(
        await client
          .rpc("pet_demo_registros", {
            p_org: data.organization_id,
            p_id: data.id,
            p_norma: data.norma,
            p_recurso: data.recurso,
            p_pagina: data.pagina,
          })
          .abortSignal(getRequest().signal),
      ),
    );
  });
async function scopedDetail(client: SupabaseClient, data: z.infer<typeof idScope>) {
  const result = demoDetail.parse(
    petResult(
      await client
        .rpc("pet_demo_obter", { p_org: data.organization_id, p_id: data.id, p_norma: data.norma })
        .abortSignal(getRequest().signal),
    ),
  );
  if (
    result.sessao.cliente_id !== data.cliente_id ||
    result.sessao.unidade_id !== data.unidade_id ||
    (data.local_id && result.sessao.local_id !== data.local_id)
  )
    throw Error("A demonstração não corresponde ao contexto informado.");
  return result;
}
export const petDemoContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(demoScope)
  .handler(async ({ context, data }) =>
    demoContext.parse(
      petResult(
        await db(context.supabase)
          .rpc("pet_demo_contexto", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
            p_local: data.local_id ?? null,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const petDemoListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    demoScope.extend({
      busca: z.string().max(120).default(""),
      grupo: z.enum(["andamento", "concluidas"]).default("andamento"),
      pagina: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ context, data }) =>
    demoList.parse(
      petResult(
        await db(context.supabase)
          .rpc("pet_demo_listar", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
            p_local: data.local_id ?? null,
            p_busca: data.busca,
            p_grupo: data.grupo,
            p_pagina: data.pagina,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const petDemoObter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idScope)
  .handler(({ context, data }) => scopedDetail(db(context.supabase), data));
export const petDemoExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(demoScope.extend({ comando: demoCommand }))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    if (data.comando.id) await scopedDetail(client, { ...data, id: data.comando.id });
    if (data.comando.norma !== data.norma) throw Error("Contexto normativo divergente.");
    if (
      data.comando.comando === "criar" &&
      (data.comando.dados["cliente_id"] !== data.cliente_id ||
        data.comando.dados["unidade_id"] !== data.unidade_id ||
        data.comando.dados["local_id"] !== data.local_id)
    )
      throw Error("Contexto de criação divergente.");
    return z.object({ id: z.string().uuid(), version: z.number(), numero: z.string() }).parse(
      petResult(
        await client.rpc("pet_demo_executar", {
          p_org: data.organization_id,
          p_comando: data.comando,
        }),
      ),
    );
  });
export const petDemoArquivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    idScope.extend({
      comando: z.enum(["preparar", "confirmar", "abrir"]),
      arquivo_id: z.string().uuid(),
      nome: z.string().min(1).max(240).optional(),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]).optional(),
      tamanho: z.number().int().min(1).max(20971520).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    await scopedDetail(client, data);
    const result = z.object({ caminho: z.string(), estado: z.string() }).parse(
      petResult(
        await client.rpc("pet_demo_arquivo", {
          p_org: data.organization_id,
          p_id: data.id,
          p_comando: data.comando,
          p_dados: {
            id: data.arquivo_id,
            nome: data.nome,
            mime: data.mime,
            tamanho: data.tamanho,
          },
        }),
      ),
    );
    if (data.comando === "abrir")
      return {
        url: z
          .object({ signedUrl: z.string() })
          .parse(
            petResult(
              await client.storage.from("nexus-pet-demo").createSignedUrl(result.caminho, 60),
            ),
          ).signedUrl,
        token: "",
        caminho: "",
        estado: result.estado,
      };
    if (data.comando === "preparar" && result.estado === "pendente")
      return {
        url: "",
        ...z
          .object({ token: z.string() })
          .parse(
            petResult(
              await client.storage
                .from("nexus-pet-demo")
                .createSignedUploadUrl(result.caminho, { upsert: false }),
            ),
          ),
        caminho: result.caminho,
        estado: result.estado,
      };
    return { url: "", token: "", caminho: result.caminho, estado: result.estado };
  });
