import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const jsDir = join(rootDir, "js");
const srcDir = join(rootDir, "src");
const indexPath = join(rootDir, "index.html");

function listJsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

function runNodeCheck(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(`Falha de sintaxe em ${relative(rootDir, filePath)}\n${output}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const jsFiles = [...listJsFiles(jsDir), ...listJsFiles(srcDir)].sort();
assert(jsFiles.length > 0, "Nenhum arquivo JS encontrado em frontend/js.");

for (const filePath of jsFiles) {
  runNodeCheck(filePath);
}

const indexHtml = readFileSync(indexPath, "utf8");
assert(
  indexHtml.includes('type="module" src="/src/main.js"'),
  "index.html deve iniciar a aplicacao pelo entrypoint Vite /src/main.js"
);

const requiredAssets = [
  "./vendor/chart.umd.min.js",
  "./vendor/luxon.min.js",
  "./vendor/popper.min.js",
  "./vendor/tippy-bundle.umd.min.js",
  "./vendor/lucide.min.js",
  "./vendor/tippy.css",
];

for (const assetPath of requiredAssets) {
  const fullPath = join(rootDir, assetPath.replace("./", ""));
  assert(existsSync(fullPath), `Asset nao encontrado: ${assetPath}`);
}

console.log(`Checks concluídos: ${jsFiles.length} arquivos JS validados.`);
