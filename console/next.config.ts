import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3's native binding resolution confuses standalone's file
  // tracer (it's silently dropped from .next/standalone/node_modules
  // otherwise) — force it to be traced/copied as an external package.
  // nodemailer (Sprint 7b) is deliberately NOT listed here — it's a
  // dual ESM/CJS package with a conditional `exports` map, and marking it
  // external makes the standalone tracer copy only the ESM half it
  // statically resolved (dist/esm/), silently dropping dist/cjs/ that the
  // actual runtime require() needs — confirmed by a real missing-module
  // crash in the built image. Bundling it normally (the default) instead
  // works because webpack inlines only the code paths it traces, so the
  // incomplete-sibling-file problem doesn't apply.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
