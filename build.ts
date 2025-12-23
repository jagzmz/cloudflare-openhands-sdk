import { $ } from "bun";
import { existsSync, rmSync } from "fs";

const DIST_DIR = "dist";
const SRC_DIR = "src";

// Clean dist directory
if (existsSync(DIST_DIR)) {
  console.log("Cleaning dist directory...");
  rmSync(DIST_DIR, { recursive: true, force: true });
}

console.log("Building openhands-sdk...");

// Build all entrypoints with Bun
const entrypoints = [
  "src/index.ts",
  "src/openhands/index.ts",
  "src/routes/handler.ts",
  "src/utils/agent-server.ts",
];

console.log("Transpiling TypeScript to JavaScript...");
const buildResult = await Bun.build({
  entrypoints,
  outdir: DIST_DIR,
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "external",
  external: ["@cloudflare/sandbox"], // Don't bundle peer dependencies
});

if (!buildResult.success) {
  console.error("Build failed!");
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("✓ JavaScript files built");

// Generate type definitions using tsc
console.log("Generating type definitions...");

try {
  // Use existing tsconfig.json with command-line overrides for build
  const tscResult =
    await $`bunx --bun tsc --project tsconfig.json --declaration --declarationMap --emitDeclarationOnly --outDir ${DIST_DIR} --rootDir ${SRC_DIR} --noEmit false`.quiet();
  if (tscResult.exitCode !== 0) {
    console.warn("TypeScript type generation completed with warnings");
  } else {
    console.log("✓ Type definitions generated");
  }
} catch (error) {
  console.warn("TypeScript compilation warning:", error);
}

console.log("\n✓ Build complete!");
console.log(`Output directory: ${DIST_DIR}/`);
console.log("\nBuilt files:");
for (const output of buildResult.outputs) {
  console.log(`  - ${output.path}`);
}
