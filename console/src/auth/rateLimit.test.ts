import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { checkLoginLock, recordLoginFailure, recordLoginSuccess } from "./rateLimit";

// The module keeps state on globalThis (see rateLimit.ts's own comment on
// why — Next.js bundles route handlers as separate module graphs) so tests
// must reset it themselves rather than relying on a fresh module instance.
beforeEach(() => {
  globalThis.__consoleLoginAttempts = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkLoginLock", () => {
  it("returns null for a username with no recorded attempts", () => {
    expect(checkLoginLock("nobody")).toBeNull();
  });

  it("stays null below the failure threshold", () => {
    for (let i = 0; i < 4; i++) recordLoginFailure("alice");
    expect(checkLoginLock("alice")).toBeNull();
  });

  it("locks out at the 5th consecutive failure", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("bob");
    const remaining = checkLoginLock("bob");
    expect(remaining).not.toBeNull();
    expect(remaining).toBe(30); // BASE_LOCK_MS = 30_000ms
  });

  it("escalates the lockout duration on further failures past the threshold", () => {
    for (let i = 0; i < 6; i++) recordLoginFailure("carol"); // 1 past threshold: 30s * 2^1
    expect(checkLoginLock("carol")).toBe(60);
  });

  it("clears once the lock's time window has passed", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("dave");
    expect(checkLoginLock("dave")).toBe(30);
    vi.setSystemTime(31_000); // 1s past the 30s lock
    expect(checkLoginLock("dave")).toBeNull();
  });

  it("tracks usernames independently", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("erin");
    expect(checkLoginLock("erin")).not.toBeNull();
    expect(checkLoginLock("frank")).toBeNull();
  });
});

describe("recordLoginSuccess", () => {
  it("clears failure count and any active lock", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("gina");
    expect(checkLoginLock("gina")).not.toBeNull();
    recordLoginSuccess("gina");
    expect(checkLoginLock("gina")).toBeNull();
  });

  it("is a no-op for a username with no prior attempts", () => {
    expect(() => recordLoginSuccess("nobody")).not.toThrow();
  });
});
