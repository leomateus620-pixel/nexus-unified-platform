// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import path from "node:path";

// MCP 3.4 compares native paths; Vite supplies a slash-normalized root on Windows.
// Keep the SDK routes/auth checks and normalize only the copy consumed by its hook.
const mcp = mcpPlugin();
const resolved = mcp.configResolved;
if (process.platform === "win32" && typeof resolved === "function") {
  mcp.configResolved = function (config) {
    return resolved.call(this, { ...config, root: path.resolve(config.root) });
  };
}

export default defineConfig({
  vite: { plugins: [mcp] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
