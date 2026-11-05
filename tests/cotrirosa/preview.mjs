// Bundled laboratory preview, explicitly restricted to loopback. Never a production proxy.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://127.0.0.1:4197").pathname;
    if (pathname === "/__cotrirosa") {
      const chunks = [];
      for await (const c of req) {
        chunks.push(c);
        if (chunks.reduce((n, b) => n + b.length, 0) > 1000000) throw Error("Payload exceeded");
      }
      const r = await fetch("http://127.0.0.1:4196/__cotrirosa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:4196" },
        body: Buffer.concat(chunks),
      });
      res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const file = path.resolve(
      root,
      "." + (path.extname(pathname) ? decodeURIComponent(pathname) : "/index.html"),
    );
    if (!file.startsWith(root + path.sep)) throw Error("Invalid path");
    const bytes = await readFile(file),
      gzip = /gzip/.test(req.headers["accept-encoding"] ?? "");
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public,max-age=3600",
      ...(gzip ? { "Content-Encoding": "gzip" } : {}),
    });
    res.end(gzip ? gzipSync(bytes) : bytes);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(String(e.message));
  }
}).listen(4197, "127.0.0.1", () => console.log("Laboratório compilado http://127.0.0.1:4197"));
