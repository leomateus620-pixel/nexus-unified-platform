import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cruzAlta } from "./context";

const selection = z.object({
  organization_id: z.literal(cruzAlta.org),
  chave: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,119}$/),
});
const id = z.string().regex(/^[A-Za-z0-9_-]{10,250}$/);
const photo = selection.extend({
  folderId: id,
  id,
  version: z.string().regex(/^\d{1,24}$/),
  path: z.array(id).max(4),
  preview: z.boolean(),
});

export const caRdoPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(selection)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Referrer-Policy", "no-referrer");
    const { listRdoPhotos } = await import("./rdo-photos.server");
    return listRdoPhotos(context.supabase as SupabaseClient, data, getRequest().signal);
  });

export const caRdoPhoto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(photo)
  .handler(async ({ data, context }) => {
    const { readRdoPhoto } = await import("./rdo-photos.server");
    return readRdoPhoto(context.supabase as SupabaseClient, data, getRequest().signal);
  });
