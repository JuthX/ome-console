import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { findUserById, updatePasswordHash } from "@/db/users";
import { writeAudit } from "@/db/audit";
import { getCurrentUser } from "@/auth/currentUser";

// Deliberately not under /api/users — that prefix is Engineer-only in
// proxy.ts, but every role needs to be able to change their own password.
// Left unclassified there on purpose, so it falls through to the default
// viewer-minimum (any authenticated user).
export async function PATCH(req: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { currentPassword, newPassword } = body ?? {};
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }

  const user = findUserById(actor.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const currentOk = await bcrypt.compare(currentPassword, user.password_hash);
  if (!currentOk) {
    return NextResponse.json({ error: "current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  updatePasswordHash(user.id, passwordHash);
  writeAudit(actor.username, "user.password_change", actor.username, null);
  return NextResponse.json({ ok: true });
}
