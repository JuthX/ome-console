import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// envFile.ts reads ENV_FILE_PATH into a module-level const once at import
// time (by design — see its own comment), so each test needs a fresh
// module instance bound to its own scratch file: set the env var, then
// vi.resetModules() + a fresh dynamic import, rather than a static import.
let tmpDir: string;
let envPath: string;
let envFile: typeof import("./envFile");

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "envfile-test-"));
  envPath = join(tmpDir, ".env");
  process.env.ENV_FILE_PATH = envPath;
  vi.resetModules();
  envFile = await import("./envFile");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ENV_FILE_PATH;
});

describe("readEnvFile", () => {
  it("returns an empty object when the file doesn't exist yet", () => {
    expect(envFile.readEnvFile()).toEqual({});
  });

  it("parses KEY=value pairs, ignoring comments and blank lines", () => {
    writeFileSync(envPath, "# a comment\n\nFOO=bar\nBAZ=\n### section ###\nQUX=hello world\n");
    expect(envFile.readEnvFile()).toEqual({ FOO: "bar", BAZ: "", QUX: "hello world" });
  });
});

describe("writeEnvValues", () => {
  it("updates an existing key in place, preserving comments and other vars", () => {
    writeFileSync(envPath, "# header comment\nFOO=old\nBAR=keep\n");
    envFile.writeEnvValues({ FOO: "new" });
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("# header comment");
    expect(content).toContain("FOO=new");
    expect(content).not.toContain("FOO=old");
    expect(content).toContain("BAR=keep");
  });

  it("appends a new key under a wizard-owned header when it isn't present", () => {
    writeFileSync(envPath, "EXISTING=1\n");
    envFile.writeEnvValues({ NEW_KEY: "value" });
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("### Added by the setup wizard ###");
    expect(content).toContain("NEW_KEY=value");
    expect(content).toContain("EXISTING=1");
  });

  it("only ever adds the wizard header once across multiple writes", () => {
    writeFileSync(envPath, "EXISTING=1\n");
    envFile.writeEnvValues({ FIRST: "a" });
    envFile.writeEnvValues({ SECOND: "b" });
    const content = readFileSync(envPath, "utf8");
    const headerCount = content.split("### Added by the setup wizard ###").length - 1;
    expect(headerCount).toBe(1);
    expect(content).toContain("FIRST=a");
    expect(content).toContain("SECOND=b");
  });

  it("creates the file from scratch when it doesn't exist yet", () => {
    envFile.writeEnvValues({ A: "1", B: "2" });
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("A=1");
    expect(content).toContain("B=2");
  });

  it("sets restrictive file permissions", () => {
    envFile.writeEnvValues({ SECRET: "shh" });
    const mode = statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
