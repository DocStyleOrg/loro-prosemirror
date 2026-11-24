import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  // DocStyle fork: pnpm builds this package when it installs it from git, in a
  // temporary folder inside its store. On CI the store can sit under a
  // node_modules folder (pnpm/action-setup puts it in node_modules/.bin), and
  // tsdown then takes this package's own sources for a bundled dependency. Its
  // inlineOnly warning, an error under CI=true, would fail the install, and at
  // es2020 the oxc runtime helper it inlines for class fields failed to
  // resolve. es2022 keeps class fields native, so no helper is needed.
  target: "es2022",
  inlineOnly: false,
  platform: "browser",
  sourcemap: true,
  clean: true,
});
