import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { getCurrentUsername } from "@/auth/currentUser";
import type { PushPreset } from "@/db/types";

export async function GET() {
  const presets = db.prepare(`SELECT * FROM push_presets ORDER BY created_at DESC`).all() as PushPreset[];
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, protocol, url_template, stream_key } = body ?? {};
  if (!name || !protocol || !url_template) {
    return NextResponse.json({ error: "name, protocol and url_template are required" }, { status: 400 });
  }

  const result = db
    .prepare(`INSERT INTO push_presets (name, protocol, url_template, stream_key) VALUES (?, ?, ?, ?)`)
    .run(name, protocol, url_template, stream_key ?? null);
  const preset = db.prepare(`SELECT * FROM push_presets WHERE id = ?`).get(result.lastInsertRowid) as PushPreset;
  return NextResponse.json({ preset }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`DELETE FROM push_presets WHERE id = ?`).run(id);
  writeAudit(await getCurrentUsername(), "push-preset.delete", id, null);
  return NextResponse.json({ ok: true });
}
