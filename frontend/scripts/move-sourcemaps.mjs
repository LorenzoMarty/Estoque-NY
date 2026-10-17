// Moves the source maps out of dist/ so they are never served with the site.
// Upload them to Sentry from frontend/sourcemaps/ (see docs/observability.md).
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/assets", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const target = new URL("../sourcemaps", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
let moved = 0;
for (const name of readdirSync(dist)) {
  if (name.endsWith(".map")) {
    renameSync(join(dist, name), join(target, name));
    moved += 1;
  }
}
console.log(`moved ${moved} source maps to frontend/sourcemaps/`);
