import { NextResponse } from "next/server";
import { clearSessionCookie, clearStoppedNoticeCookie } from "@/lib/auth/session";

export async function POST() {
  await clearSessionCookie();
  await clearStoppedNoticeCookie();
  return NextResponse.json({ success: true });
}
