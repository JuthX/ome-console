import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { createUser, deleteUser, findUserById, listUsers, updatePasswordHash } from "@/db/users";
import { isRole } from "@/auth/roles";
import { writeAudit } from "@/db/audit";
import { getCurrentUser } from "@/auth/currentUser";

// Engineer-only (enforced in proxy.ts) — user management itself is a
// server-registry-adjacent capability per PRD §10.

export async function GET() {
  return NextResponse.json({ users: listUsers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, role } = body ?? {};
  if (!username || !password || !role) {
    return NextResponse.json({ error: "username, password and role are required" }, { status: 400 });
  }
  if (!isRole(role)) {
    return NextResponse.json({ error: "role must be viewer, operator or engineer" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = createUser(username, passwordHash, role);
  } catch {
    return NextResponse.json({ error: "that username is already taken" }, { status: 409 });
  }

  const actor = await getCurrentUser();
  writeAudit(actor?.username ?? "unknown", "user.create", username, { role });
  return NextResponse.json(
    { user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at } },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, password } = body ?? {};
  if (!id || !password) {
    return NextResponse.json({ error: "id and password are required" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  const target = findUserById(Number(id));
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const passwordHash = await bcrypt.hash(password, 12);
  updatePasswordHash(target.id, passwordHash);

  const actor = await getCurrentUser();
  writeAudit(actor?.username ?? "unknown", "user.password_reset", target.username, null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const actor = await getCurrentUser();
  // Can't delete your own account through the UI — you'd immediately lock
  // yourself out. (Resetting your own password here is fine, unlike this —
  // see PATCH above, and the self-service /api/account/password route for
  // the "I know my current password and just want to change it" case.)
  if (actor && String(actor.userId) === id) {
    return NextResponse.json({ error: "you can't delete your own account" }, { status: 400 });
  }

  deleteUser(Number(id));
  writeAudit(actor?.username ?? "unknown", "user.delete", id, null);
  return NextResponse.json({ ok: true });
}
