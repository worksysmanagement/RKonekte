import { NextResponse } from "next/server";
import {
  clearStoppedNoticeCookie,
  getStoppedNoticeFromCookies,
} from "@/lib/auth/session";
import { buildStoppedClientContext } from "@/lib/services/stopped-context";

export async function GET() {
  const notice = await getStoppedNoticeFromCookies();
  if (!notice) {
    return NextResponse.json({ hasNotice: false, stoppedContext: null });
  }

  try {
    const context = await buildStoppedClientContext(notice);
    if ((context as any).accountInactive) {
      await clearStoppedNoticeCookie();
      return NextResponse.json({ hasNotice: false, stoppedContext: null });
    }
    if (context.resumed) {
      await clearStoppedNoticeCookie();
      return NextResponse.json({
        hasNotice: true,
        resumed: true,
        stoppedContext: context,
      });
    }
    return NextResponse.json({
      hasNotice: true,
      resumed: false,
      stoppedContext: context,
    });
  } catch (err) {
    return NextResponse.json({
      hasNotice: true,
      resumed: false,
      stoppedContext: {
        resumed: false,
        serviceStopped: true,
        isAdmin: notice.isAdmin,
        organizationName: notice.organizationName,
        message: "Veuillez contacter votre administrateur pour cet arrêt de service.",
      },
    });
  }
}

export async function DELETE() {
  await clearStoppedNoticeCookie();
  return NextResponse.json({ success: true });
}
