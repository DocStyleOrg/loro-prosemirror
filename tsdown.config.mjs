import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  // DocStyle fork: es2022 keeps class fields native. At es2020 the build inlines
  // an oxc runtime helper, which failed to bundle when pnpm prepared this
  // package as a git dependency on Linux CI.
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  clean: true,
});
