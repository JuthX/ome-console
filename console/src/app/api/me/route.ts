import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/currentUser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ username: user.username, role: user.role });
}
