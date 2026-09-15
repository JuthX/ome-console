import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Node environment, not jsdom — every test target here is server-side
// logic (auth, URL safety, formatting, env-file parsing), never a React
// component, so there's no need for a DOM shim.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
