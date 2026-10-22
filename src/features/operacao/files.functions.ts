import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { anexoPai, anexoRow, fileInput, uploadInput } from "./schemas";
import { operationalDb, result } from "./operacao.functions";
import { validarBinario } from "./files";

export const listarAnexos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(anexoPai)
  .handler(async ({ context, data }) => {
    let q = operationalDb(context.supabase)
      .from("anexos")
      .select("*")
      .eq("organization_id", data.organization_id)
      .neq("estado", "cancelado");
    for (const key of ["pessoa_id", "acao_id", "qualificacao_id"] as const)
      if (data[key]) q = q.eq(key, data[key]);
    const raw = result(await q.order("created_at", { ascending: false }).limit(50)) ?? [];
    const rows = anexoRow.array().parse(raw);
    return rows.map((row) => ({
      ...row,
      pode_retomar:
        row.estado !== "vinculado" &&
        raw.some((item) => item.id === row.id && item.created_by === context.userId),
    }));
  });

export const prepararUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(uploadInput)
  .handler(async ({ context, data }) => {
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
      throw new Error(
        "Confirmação de arquivos não configurada: falta a credencial de serviço no servidor. O cadastro permanece disponível.",
      );
    const db = operationalDb(context.supabase);
    const { organization_id, ...pai } = data.pai;
    const prepared = anexoRow.parse(
      result(
        await db.rpc("preparar_anexo_operacional", {
          _org: organization_id,
          _chave: data.chave,
          _dados: {
            ...pai,
            nome: data.nome,
            mime: data.mime,
            tamanho: data.tamanho,
            sha256: data.sha256,
          },
        }),
      ),
    );
    // O resultado idempotente guarda o estado da criação; consulta o estado atual antes de retomar.
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("id", prepared.id)
          .single(),
      ),
    );
    if (a.estado === "vinculado") return { anexo: a, token: null };
    const signed = result(
      await db.storage
        .from("nexus-operacional")
        .createSignedUploadUrl(a.caminho, { upsert: false }),
    );
    if (!signed) throw new Error("Não foi possível preparar o envio. Tente novamente.");
    return { anexo: a, token: signed.token };
  });

export const retomarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
      throw new Error(
        "Confirmação de arquivos não configurada no servidor. O cadastro permanece disponível.",
      );
    const db = operationalDb(context.supabase);
    const raw = result(
      await db
        .from("anexos")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("id", data.id)
        .single(),
    );
    if (!raw || raw.created_by !== context.userId)
      throw new Error("Somente o autor pode retomar este envio.");
    const a = anexoRow.parse(raw);
    if (a.estado === "vinculado") return { anexo: a, token: null };
    if (!["pendente", "enviado"].includes(a.estado)) throw new Error("Envio indisponível.");
    if (!result(await db.rpc("operacao_ler_anexo", { _org: data.organization_id, _id: data.id })))
      throw new Error("Registro indisponível.");
    const signed = result(
      await db.storage
        .from("nexus-operacional")
        .createSignedUploadUrl(a.caminho, { upsert: false }),
    );
    if (!signed) throw new Error("Não foi possível retomar o envio. Tente novamente.");
    return { anexo: a, token: signed.token };
  });

export const confirmarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    // Primeiro autoriza pelo cliente do usuário/RLS, antes de usar service role.
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    );
    if (a.estado === "vinculado") return a;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = operationalDb(supabaseAdmin);
    const blob = result(await admin.storage.from("nexus-operacional").download(a.caminho));
    if (!blob) throw new Error("Arquivo ainda não disponível no armazenamento.");
    await validarBinario(new Uint8Array(await blob.arrayBuffer()), a);
    // Revalida papel e pai após download, inclusive revogação durante a sessão.
    if (!result(await db.rpc("operacao_ler_anexo", { _org: data.organization_id, _id: data.id })))
      throw new Error("Acesso revogado.");
    result(
      await admin.rpc("confirmar_anexo_operacional", {
        _org: data.organization_id,
        _id: data.id,
        _autor: context.userId,
        _sha256: a.sha256,
      }),
    );
    return anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    );
  });

export const baixarAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .eq("estado", "vinculado")
          .single(),
      ),
    );
    // URL não vai para cache persistido; expira em 60 s. Não concede acesso público ao bucket.
    const signed = result(
      await db.storage
        .from("nexus-operacional")
        .createSignedUrl(a.caminho, 60, { download: a.nome }),
    );
    if (!signed) throw new Error("Download indisponível. Tente novamente.");
    return { url: signed.signedUrl };
  });
