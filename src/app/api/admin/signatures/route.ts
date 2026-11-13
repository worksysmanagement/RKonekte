import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const supabase = getSupabaseAdminClient();

    // 1. Fetch active users of the organization (not employees)
    let orgUsers: any[] = [];
    try {
      const { data: users, error: usersErr } = await supabase
        .from("users")
        .select("id, name, email, role, status")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true });

      if (!usersErr && users) {
        orgUsers = users;
      }
    } catch (_) {}

    if (orgUsers.length === 0) {
      try {
        const { listOrgUsers } = await import("@/lib/services/users");
        const localUsers = await listOrgUsers(organizationId);
        orgUsers = localUsers || [];
      } catch (_) {}
    }

    // 2. Fetch only explicit signature delegations from table
    let delegations: any[] = [];
    try {
      const { data: delegs, error: delegErr } = await supabase
        .from("signature_delegations")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (!delegErr && delegs) {
        delegations = delegs;
      }
    } catch (_) {}

    const userMap = new Map<string, any>();
    for (const u of orgUsers) {
      userMap.set(u.id, u);
    }

    // 3. Build signers list ONLY from explicit delegations (no virtual auto-generation)
    // If no delegation exists, returns [] so the page starts at 0.
    const signers = delegations
      .map((d: any) => {
        const u = userMap.get(d.user_id);
        if (!u && !d.user_name) return null;
        return {
          id: d.id,
          userId: d.user_id,
          userName: u?.name || d.user_name || "Utilisateur",
          userEmail: u?.email || d.user_email || "",
          role: u?.role || d.role || "COLLABORATEUR",
          canSignLeaves: Boolean(d.can_sign_leaves),
          canSignSalaryRaises: Boolean(d.can_sign_salary_raises),
          canSignAuthorizations: Boolean(d.can_sign_authorizations),
          status: d.status || "ACTIVE",
          signatureUrl: d.signature_url || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      signers,
      availableUsers: orgUsers.filter((u) => u.status !== "DISABLED"),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const body = await req.json();
    const supabase = getSupabaseAdminClient();
    const now = Date.now();

    const {
      userId,
      userEmail,
      canSignLeaves,
      canSignSalaryRaises,
      canSignAuthorizations,
      status,
    } = body;

    // Resolve user ID
    let targetUserId = userId;
    if (!targetUserId && userEmail) {
      const { data: u } = await supabase
        .from("users")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("email", userEmail.trim().toLowerCase())
        .maybeSingle();
      if (u) {
        targetUserId = u.id;
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Veuillez sélectionner un utilisateur pour cette délégation de signature." },
        { status: 400 }
      );
    }

    // Check if delegation already exists
    let existing: any = null;
    try {
      const { data } = await supabase
        .from("signature_delegations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", targetUserId)
        .maybeSingle();
      existing = data;
    } catch (_) {}

    const delegationId = existing?.id || `sig-${crypto.randomUUID()}`;

    const payload = {
      id: delegationId,
      organization_id: organizationId,
      user_id: targetUserId,
      can_sign_leaves: Boolean(canSignLeaves),
      can_sign_salary_raises: Boolean(canSignSalaryRaises),
      can_sign_authorizations: Boolean(canSignAuthorizations),
      spending_limit_htg: 0,
      status: status || "ACTIVE",
      updated_at: now,
    };

    try {
      if (existing) {
        await supabase
          .from("signature_delegations")
          .update(payload)
          .eq("id", delegationId);
      } else {
        await supabase
          .from("signature_delegations")
          .insert({
            ...payload,
            created_at: now,
          });
      }
    } catch (e) {
      console.warn("Could not insert/update signature_delegations in Supabase:", e);
    }

    return NextResponse.json({
      success: true,
      delegation: {
        userId: targetUserId,
        ...payload,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const { searchParams } = new URL(req.url);
    const delegationId = searchParams.get("id");
    const userId = searchParams.get("userId");
    const resetAll = searchParams.get("reset") === "true";

    const supabase = getSupabaseAdminClient();

    if (resetAll) {
      try {
        await supabase
          .from("signature_delegations")
          .delete()
          .eq("organization_id", organizationId);
      } catch (_) {}
      return NextResponse.json({ success: true, message: "Page remise à zéro" });
    }

    if (!delegationId && !userId) {
      return NextResponse.json(
        { error: "Identifiant de délégation ou utilisateur requis" },
        { status: 400 }
      );
    }

    try {
      if (delegationId) {
        await supabase
          .from("signature_delegations")
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", delegationId);
      } else if (userId) {
        await supabase
          .from("signature_delegations")
          .delete()
          .eq("organization_id", organizationId)
          .eq("user_id", userId);
      }
    } catch (e) {
      console.warn("Could not delete from signature_delegations in Supabase:", e);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
