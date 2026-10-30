import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrganizations from "./tools/list-organizations";
import searchProducts from "./tools/search-products";
import listProposals from "./tools/list-proposals";
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";
export default defineMcp({
  name: "nexus-unified-platform", title: "Nexus Unified Platform", version: "1.0.0",
  instructions: "Consultas protegidas ao Nexus. Identifique uma organização autorizada antes de consultar produtos ou propostas. As permissões atuais do usuário e as políticas de dados sempre se aplicam. Não altera registros nem emite ordens.",
  auth: auth.oauth.issuer({ issuer: `https://${projectRef}.supabase.co/auth/v1`, acceptedAudiences: "authenticated" }),
  tools: [listOrganizations, searchProducts, listProposals],
});