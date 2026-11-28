import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseKeys = Boolean(supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY);

  let supabaseStatus = {
    configured: hasSupabaseKeys,
    connected: false,
    error: null as string | null,
  };

  try {
    const supabase = getSupabaseAdminClient();
    const { error: pingErr } = await supabase
      .from("organizations")
      .select("id")
      .limit(1);

    if (pingErr) {
      supabaseStatus.error = "Erreur de communication avec la base de données.";
      throw new Error(pingErr.message);
    }

    supabaseStatus.connected = true;

    return NextResponse.json({
      status: "SUCCESS",
      connected: true,
      database: "SUPABASE CLOUD",
      message: "Connexion directe à la base de données Supabase opérationnelle !",
      supabase: supabaseStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "ERROR",
        connected: false,
        database: "SUPABASE CLOUD",
        supabase: supabaseStatus,
        error: "Erreur de connexion à la base de données",
      },
      { status: 500 }
    );
  }
}

