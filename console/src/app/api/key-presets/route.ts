import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { getCurrentUsername } from "@/auth/currentUser";
import type { KeyPreset } from "@/db/types";

export async function GET() {
  const presets = db.prepare(`SELECT * FROM key_presets ORDER BY created_at DESC`).all() as KeyPreset[];
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, protocol, expires_in_hours } = body ?? {};
  if (!name || !protocol) {
    return NextResponse.json({ error: "name and protocol are required" }, { status: 400 });
  }

  const result = db
    .prepare(`INSERT INTO key_presets (name, protocol, expires_in_hours) VALUES (?, ?, ?)`)
    .run(name, protocol, expires_in_hours ?? null);
  const preset = db.prepare(`SELECT * FROM key_presets WHERE id = ?`).get(result.lastInsertRowid) as KeyPreset;
  return NextResponse.json({ preset }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`DELETE FROM key_presets WHERE id = ?`).run(id);
  writeAudit(await getCurrentUsername(), "key-preset.delete", id, null);
  return NextResponse.json({ ok: true });
}
