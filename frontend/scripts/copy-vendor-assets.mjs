import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = resolve(rootDir, "vendor");
const targetDir = resolve(rootDir, "dist", "vendor");

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log("Vendor assets copied to dist/vendor.");
