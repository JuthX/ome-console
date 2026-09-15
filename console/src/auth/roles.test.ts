import { describe, expect, it } from "vitest";
import { hasRole, isRole } from "./roles";

describe("hasRole", () => {
  it("a role always satisfies its own minimum", () => {
    expect(hasRole("viewer", "viewer")).toBe(true);
    expect(hasRole("operator", "operator")).toBe(true);
    expect(hasRole("engineer", "engineer")).toBe(true);
  });

  it("engineer satisfies every lower minimum (additive)", () => {
    expect(hasRole("engineer", "operator")).toBe(true);
    expect(hasRole("engineer", "viewer")).toBe(true);
  });

  it("operator satisfies viewer but not engineer", () => {
    expect(hasRole("operator", "viewer")).toBe(true);
    expect(hasRole("operator", "engineer")).toBe(false);
  });

  it("viewer does not satisfy operator or engineer", () => {
    expect(hasRole("viewer", "operator")).toBe(false);
    expect(hasRole("viewer", "engineer")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts the three real roles", () => {
    expect(isRole("viewer")).toBe(true);
    expect(isRole("operator")).toBe(true);
    expect(isRole("engineer")).toBe(true);
  });

  it("rejects invalid strings, wrong case, and non-strings", () => {
    expect(isRole("admin")).toBe(false);
    expect(isRole("Viewer")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
    expect(isRole({})).toBe(false);
  });
});
