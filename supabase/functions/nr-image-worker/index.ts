import { createImageWorker } from "./core.ts";
import { imageInfo } from "./image-info.ts";

const handler = createImageWorker({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  inspectImage: imageInfo,
});

Deno.serve(async (request) => {
  const response = await handler(request);
  // Aggregates only: never log tokens, signed URLs, paths, captions or customer identities.
  console.info(await response.clone().text());
  return response;
});
