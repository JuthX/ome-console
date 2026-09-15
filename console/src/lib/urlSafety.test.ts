import { describe, expect, it } from "vitest";
import { checkTargetUrlSafety } from "./urlSafety";

describe("checkTargetUrlSafety", () => {
  it("rejects an unparseable URL", () => {
    const result = checkTargetUrlSafety("not a url");
    expect(result.ok).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(checkTargetUrlSafety("ftp://example.com").ok).toBe(false);
    expect(checkTargetUrlSafety("file:///etc/passwd").ok).toBe(false);
    expect(checkTargetUrlSafety("gopher://example.com").ok).toBe(false);
  });

  it("rejects loopback hostnames and IPv4 addresses", () => {
    expect(checkTargetUrlSafety("http://localhost:8081").ok).toBe(false);
    expect(checkTargetUrlSafety("http://127.0.0.1:8081").ok).toBe(false);
    expect(checkTargetUrlSafety("http://127.55.0.1:8081").ok).toBe(false);
  });

  it("rejects the IPv6 loopback address", () => {
    expect(checkTargetUrlSafety("http://[::1]:8081").ok).toBe(false);
  });

  it("rejects link-local addresses, including the cloud metadata endpoint", () => {
    expect(checkTargetUrlSafety("http://169.254.169.254/").ok).toBe(false);
    expect(checkTargetUrlSafety("http://169.254.1.1/").ok).toBe(false);
  });

  it("rejects IPv6 link-local addresses", () => {
    expect(checkTargetUrlSafety("http://[fe80::1]/").ok).toBe(false);
  });

  it("allows RFC1918 private-range targets (deliberately, not blocked)", () => {
    expect(checkTargetUrlSafety("http://192.168.1.50:8081").ok).toBe(true);
    expect(checkTargetUrlSafety("http://10.0.0.5:8081").ok).toBe(true);
    expect(checkTargetUrlSafety("http://172.16.0.5:8081").ok).toBe(true);
  });

  it("allows a real public hostname/URL", () => {
    expect(checkTargetUrlSafety("https://example.com:8081/v1").ok).toBe(true);
  });

  it("allows an internal Docker-network hostname", () => {
    expect(checkTargetUrlSafety("http://ome:8081").ok).toBe(true);
  });
});
