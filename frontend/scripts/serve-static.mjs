import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const portRaw = String(process.env.PORT || "").trim();
const port = /^\d+$/.test(portRaw) ? Number(portRaw) : 8080;
const hostRaw = String(process.env.HOST || "").trim();
const host = hostRaw || "127.0.0.1";

const mimeByExtension = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function safeJoin(base, relativePath) {
  const decoded = decodeURIComponent(relativePath);
  const cleaned = normalize(decoded)
    .replace(/^([\\/])+/, "")
    .replace(/^([.][\\/])+/, "");
  const absolute = resolve(base, cleaned);
  if (!absolute.startsWith(base)) {
    return null;
  }
  return absolute;
}

function resolveRequestPath(urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : urlPathname;
  const absolute = safeJoin(rootDir, pathname);
  if (!absolute || !existsSync(absolute)) {
    return null;
  }

  const stats = statSync(absolute);
  if (stats.isDirectory()) {
    const indexPath = join(absolute, "index.html");
    if (!existsSync(indexPath)) {
      return null;
    }
    return indexPath;
  }

  return absolute;
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const filePath = resolveRequestPath(url.pathname);

    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const extension = extname(filePath).toLowerCase();
    const mimeType = mimeByExtension[extension] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType, "Cache-Control": "no-store" });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(
      `Falha ao iniciar servidor estatico: porta ${port} ocupada em ${host}. ` +
        "Feche o processo anterior ou execute com PORT=<outra_porta>."
    );
    process.exit(1);
  }
  console.error(`Falha ao iniciar servidor estatico: ${error.message}`);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`Servidor estatico iniciado em http://${host}:${port}`);
});
