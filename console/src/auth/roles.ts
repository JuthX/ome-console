// Sprint 8a: PRD §10. Each role implies every capability of the ones below
// it ("Operator: + push, record, ..." — the "+" is additive over Viewer).
export type Role = "viewer" | "operator" | "engineer";

const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, engineer: 2 };

export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isRole(value: unknown): value is Role {
  return value === "viewer" || value === "operator" || value === "engineer";
}
