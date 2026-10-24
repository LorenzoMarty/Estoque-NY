// Fails when the JS needed for first paint (entry + modulepreload chunks in dist/index.html)
// exceeds the gzip budget. Run after `vite build`. Lower BUDGET_KB as the bundle shrinks.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 450; // gzip; measured 415 KB after route splitting (was 665 KB in one chunk)

const html = readFileSync("dist/index.html", "utf8");
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (files.length === 0) {
  console.error("No JS assets found in dist/index.html; run `vite build` first.");
  process.exit(1);
}

const kb = files.reduce((sum, file) => sum + gzipSync(readFileSync(`dist/${file}`)).length, 0) / 1024;
console.log(`Initial JS: ${kb.toFixed(1)} KB gzip across ${files.length} files (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error("Over budget: lazy-load the heavy dependency or raise BUDGET_KB deliberately.");
  process.exit(1);
}
