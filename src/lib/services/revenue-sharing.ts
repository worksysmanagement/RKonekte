import { getDb } from "@/lib/db/client";
import {
  revenueSharingConfigs,
  revenueSharingProposals,
  subscriptionRenewals,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  sendEmail,
  generateRevenueSharingProposalEmail,
  generateRevenueSharingApprovedEmail,
} from "@/lib/notifications/email";

export interface RevenueSharingConfigItem {
  id: string;
  technoziPct: number;
  developerPct: number;
  directorEmail: string | null;
  directorName: string | null;
  developerEmail: string | null;
  developerName: string | null;
  effectiveFrom: number;
  updatedAt: number;
  updatedByUserId: string | null;
  updatedByName: string | null;
}

export interface RevenueSharingProposalItem {
  id: string;
  previousTechnoziPct: number;
  previousDeveloperPct: number;
  proposedTechnoziPct: number;
  proposedDeveloperPct: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  proposedByUserId: string;
  proposedByName: string;
  proposedByEmail: string;
  targetEmail: string;
  targetName: string | null;
  validationToken: string;
  note: string | null;
  validatedByUserId: string | null;
  validatedByName: string | null;
  validatedByEmail: string | null;
  validatedAt: number | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RevenueSplitResult {
  technoziPct: number;
  developerPct: number;
  technoziAmount: number;
  developerAmount: number;
}

export interface RevenueSharingMetrics {
  totalApprovedRevenue: number;
  totalTechnoziAmount: number;
  totalDeveloperAmount: number;
  approvedTransactionsCount: number;
  currency: string;
}

function hasSupabaseCredentials(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

function shouldUseSupabase(dbInstance?: any): boolean {
  return !dbInstance && hasSupabaseCredentials();
}

function buildDefaultConfig(now: number): RevenueSharingConfigItem {
  return {
    id: "default",
    technoziPct: 60,
    developerPct: 40,
    directorEmail: null,
    directorName: "Directeur Général TECHNOZI",
    developerEmail: "pitonrodjy@gmail.com",
    developerName: "Rodjy Piton (Développeur)",
    effectiveFrom: now,
    updatedAt: now,
    updatedByUserId: null,
    updatedByName: "Système RKonekte",
  };
}

function mapSupabaseConfig(row: any, now: number): RevenueSharingConfigItem {
  return {
    id: row.id || "default",
    technoziPct: Number(row.technozi_pct ?? 60),
    developerPct: Number(row.developer_pct ?? 40),
    directorEmail: row.director_email || null,
    directorName: row.director_name || null,
    developerEmail: row.developer_email || null,
    developerName: row.developer_name || null,
    effectiveFrom: Number(row.effective_from || now),
    updatedAt: Number(row.updated_at || now),
    updatedByUserId: row.updated_by_user_id || null,
    updatedByName: row.updated_by_name || null,
  };
}

function mapSupabaseProposal(r: any): RevenueSharingProposalItem {
  return {
    id: r.id,
    previousTechnoziPct: Number(r.previous_technozi_pct),
    previousDeveloperPct: Number(r.previous_developer_pct),
    proposedTechnoziPct: Number(r.proposed_technozi_pct),
    proposedDeveloperPct: Number(r.proposed_developer_pct),
    status: r.status,
    proposedByUserId: r.proposed_by_user_id,
    proposedByName: r.proposed_by_name,
    proposedByEmail: r.proposed_by_email,
    targetEmail: r.target_email,
    targetName: r.target_name || null,
    validationToken: r.validation_token,
    note: r.note || null,
    validatedByUserId: r.validated_by_user_id || null,
    validatedByName: r.validated_by_name || null,
    validatedByEmail: r.validated_by_email || null,
    validatedAt: r.validated_at != null ? Number(r.validated_at) : null,
    rejectionReason: r.rejection_reason || null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function mapSqliteProposal(r: any): RevenueSharingProposalItem {
  return {
    id: r.id,
    previousTechnoziPct: Number(r.previousTechnoziPct),
    previousDeveloperPct: Number(r.previousDeveloperPct),
    proposedTechnoziPct: Number(r.proposedTechnoziPct),
    proposedDeveloperPct: Number(r.proposedDeveloperPct),
    status: r.status,
    proposedByUserId: r.proposedByUserId,
    proposedByName: r.proposedByName,
    proposedByEmail: r.proposedByEmail,
    targetEmail: r.targetEmail,
    targetName: r.targetName || null,
    validationToken: r.validationToken,
    note: r.note || null,
    validatedByUserId: r.validatedByUserId || null,
    validatedByName: r.validatedByName || null,
    validatedByEmail: r.validatedByEmail || null,
    validatedAt: r.validatedAt ? Number(r.validatedAt) : null,
    rejectionReason: r.rejectionReason || null,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

/**
 * Récupère la configuration active du partage des revenus.
 * Si elle n'existe pas encore, initialise à 60% TECHNOZI / 40% Développeur.
 */
export async function getActiveRevenueSharingConfig(
  dbInstance?: any
): Promise<RevenueSharingConfigItem> {
  const now = Date.now();

  if (shouldUseSupabase(dbInstance)) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: row, error } = await supabase
        .from("revenue_sharing_configs")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (error) throw error;

      if (!row) {
        const initial = buildDefaultConfig(now);
        await supabase.from("revenue_sharing_configs").upsert({
          id: initial.id,
          technozi_pct: initial.technoziPct,
          developer_pct: initial.developerPct,
          director_email: initial.directorEmail,
          director_name: initial.directorName,
          developer_email: initial.developerEmail,
          developer_name: initial.developerName,
          effective_from: initial.effectiveFrom,
          updated_at: initial.updatedAt,
          updated_by_user_id: initial.updatedByUserId,
          updated_by_name: initial.updatedByName,
        });
        return initial;
      }

      return mapSupabaseConfig(row, now);
    } catch (err) {
      // Fallback to local SQLite if Supabase is unreachable in local/offline environments
      if (process.env.VERCEL) {
        console.error("Supabase getActiveRevenueSharingConfig error:", err);
        return buildDefaultConfig(now);
      }
    }
  }

  const db = dbInstance || getDb();
  const [row] = await db
    .select()
    .from(revenueSharingConfigs)
    .where(eq(revenueSharingConfigs.id, "default"))
    .limit(1);

  if (!row) {
    const initial = buildDefaultConfig(now);
    try {
      await db.insert(revenueSharingConfigs).values({
        id: initial.id,
        technoziPct: initial.technoziPct,
        developerPct: initial.developerPct,
        directorEmail: initial.directorEmail,
        directorName: initial.directorName,
        developerEmail: initial.developerEmail,
        developerName: initial.developerName,
        effectiveFrom: initial.effectiveFrom,
        updatedAt: initial.updatedAt,
        updatedByUserId: initial.updatedByUserId,
        updatedByName: initial.updatedByName,
      });
    } catch (_) {}

    return initial;
  }

  return {
    id: row.id,
    technoziPct: Number(row.technoziPct ?? 60),
    developerPct: Number(row.developerPct ?? 40),
    directorEmail: row.directorEmail || null,
    directorName: row.directorName || null,
    developerEmail: row.developerEmail || null,
    developerName: row.developerName || null,
    effectiveFrom: Number(row.effectiveFrom || now),
    updatedAt: Number(row.updatedAt || now),
    updatedByUserId: row.updatedByUserId || null,
    updatedByName: row.updatedByName || null,
  };
}

/**
 * Met à jour les informations des parties (adresses e-mail du DG et du Développeur).
 */
export async function updateRevenueSharingParties(
  params: {
    directorEmail?: string | null;
    directorName?: string | null;
    developerEmail?: string | null;
    developerName?: string | null;
  },
  user: { id: string; name: string },
  dbInstance?: any
): Promise<RevenueSharingConfigItem> {
  const now = Date.now();

  if (shouldUseSupabase(dbInstance)) {
    const supabase = getSupabaseAdminClient();
    await getActiveRevenueSharingConfig(); // Assure existence

    const updates: Record<string, any> = {
      updated_at: now,
      updated_by_user_id: user.id,
      updated_by_name: user.name,
    };

    if (params.directorEmail !== undefined) {
      updates.director_email = params.directorEmail
        ? params.directorEmail.trim().toLowerCase()
        : null;
    }
    if (params.directorName !== undefined) {
      updates.director_name = params.directorName ? params.directorName.trim() : null;
    }
    if (params.developerEmail !== undefined) {
      updates.developer_email = params.developerEmail
        ? params.developerEmail.trim().toLowerCase()
        : null;
    }
    if (params.developerName !== undefined) {
      updates.developer_name = params.developerName ? params.developerName.trim() : null;
    }

    const { error } = await supabase
      .from("revenue_sharing_configs")
      .update(updates)
      .eq("id", "default");

    if (error) {
      throw new Error(`Erreur de mise à jour des coordonnées: ${error.message}`);
    }

    return getActiveRevenueSharingConfig();
  }

  const db = dbInstance || getDb();
  await getActiveRevenueSharingConfig(db); // Assure existence

  const updates: any = {
    updatedAt: now,
    updatedByUserId: user.id,
    updatedByName: user.name,
  };

  if (params.directorEmail !== undefined) {
    updates.directorEmail = params.directorEmail ? params.directorEmail.trim().toLowerCase() : null;
  }
  if (params.directorName !== undefined) {
    updates.directorName = params.directorName ? params.directorName.trim() : null;
  }
  if (params.developerEmail !== undefined) {
    updates.developerEmail = params.developerEmail ? params.developerEmail.trim().toLowerCase() : null;
  }
  if (params.developerName !== undefined) {
    updates.developerName = params.developerName ? params.developerName.trim() : null;
  }

  await db
    .update(revenueSharingConfigs)
    .set(updates)
    .where(eq(revenueSharingConfigs.id, "default"));

  return getActiveRevenueSharingConfig(db);
}

/**
 * Calcule la répartition exacte sans perte d'arrondi.
 */
export function calculateRevenueSplit(
  amount: number,
  config?: { technoziPct: number; developerPct: number }
): RevenueSplitResult {
  const cleanAmount = Math.max(0, Number(amount) || 0);
  const tPct = config ? Number(config.technoziPct) : 60;
  const dPct = config ? Number(config.developerPct) : 40;

  // Calcul avec arrondi à 2 décimales au centime
  const technoziAmount = Math.round(cleanAmount * (tPct / 100) * 100) / 100;
  const developerAmount = Math.round((cleanAmount - technoziAmount) * 100) / 100;

  return {
    technoziPct: tPct,
    developerPct: dPct,
    technoziAmount,
    developerAmount,
  };
}

/**
 * Crée une proposition de révision du partage des revenus.
 * Règle d'or : somme obligatoire = 100%.
 * Envoie un email de notification avec le lien direct à l'autre partie.
 */
export async function createRevenueSharingProposal(
  params: {
    proposedTechnoziPct: number;
    proposedDeveloperPct: number;
    targetEmail?: string;
    note?: string;
    originUrl?: string;
  },
  proposer: { id: string; name: string; email: string },
  dbInstance?: any
): Promise<RevenueSharingProposalItem> {
  const useSupa = shouldUseSupabase(dbInstance);
  const currentConfig = await getActiveRevenueSharingConfig(dbInstance);

  const tPct = Math.round(Number(params.proposedTechnoziPct) * 100) / 100;
  const dPct = Math.round(Number(params.proposedDeveloperPct) * 100) / 100;

  if (isNaN(tPct) || isNaN(dPct)) {
    throw new Error("Veuillez saisir des pourcentages valides.");
  }

  if (tPct < 0 || dPct < 0) {
    throw new Error("Les pourcentages ne peuvent pas être négatifs.");
  }

  const sum = Math.round((tPct + dPct) * 100) / 100;
  if (sum !== 100) {
    throw new Error(
      `La somme des pourcentages doit être exactement égale à 100 %. Actuellement : ${tPct} % + ${dPct} % = ${sum} %.`
    );
  }

  if (tPct === currentConfig.technoziPct && dPct === currentConfig.developerPct) {
    throw new Error(
      `La répartition proposée (${tPct}% / ${dPct}%) est identique à la répartition actuellement active.`
    );
  }

  // Détermination du destinataire (l'autre partie)
  let targetEmail = params.targetEmail?.trim().toLowerCase();
  const proposerEmailLower = proposer.email.toLowerCase().trim();

  if (!targetEmail) {
    if (
      currentConfig.developerEmail &&
      proposerEmailLower === currentConfig.developerEmail.toLowerCase().trim()
    ) {
      targetEmail = currentConfig.directorEmail?.toLowerCase().trim() || "";
    } else if (
      currentConfig.directorEmail &&
      proposerEmailLower === currentConfig.directorEmail.toLowerCase().trim()
    ) {
      targetEmail = currentConfig.developerEmail?.toLowerCase().trim() || "";
    }
  }

  // Si toujours pas défini, chercher dans les autres SuperAdmins actifs
  if (!targetEmail) {
    if (useSupa) {
      const supabase = getSupabaseAdminClient();
      const { data: allAdmins } = await supabase
        .from("users")
        .select("email")
        .eq("role", "SUPER_ADMIN")
        .eq("status", "ACTIVE");

      const other = (allAdmins || []).find(
        (a: any) => a.email && a.email.toLowerCase().trim() !== proposerEmailLower
      );
      if (other) {
        targetEmail = other.email.toLowerCase().trim();
      }
    } else {
      const db = dbInstance || getDb();
      const allAdmins = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));

      const other = allAdmins.find(
        (a: any) => a.email && a.email.toLowerCase().trim() !== proposerEmailLower
      );
      if (other) {
        targetEmail = other.email.toLowerCase().trim();
      }
    }
  }

  if (!targetEmail) {
    throw new Error(
      "Veuillez renseigner l'adresse e-mail de l'autre partie (Directeur ou Développeur) pour lui transmettre la proposition de validation."
    );
  }

  if (targetEmail.toLowerCase() === proposerEmailLower) {
    throw new Error(
      "L'adresse e-mail de validation doit être celle de l'autre partie, pas la vôtre."
    );
  }

  const now = Date.now();
  const proposalId = `revprop-${crypto.randomUUID()}`;
  const validationToken = crypto.randomUUID();

  const proposalRow: RevenueSharingProposalItem = {
    id: proposalId,
    previousTechnoziPct: currentConfig.technoziPct,
    previousDeveloperPct: currentConfig.developerPct,
    proposedTechnoziPct: tPct,
    proposedDeveloperPct: dPct,
    status: "PENDING",
    proposedByUserId: proposer.id,
    proposedByName: proposer.name,
    proposedByEmail: proposerEmailLower,
    targetEmail,
    targetName: null,
    validationToken,
    note: params.note?.trim() || null,
    validatedByUserId: null,
    validatedByName: null,
    validatedByEmail: null,
    validatedAt: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
  };

  if (useSupa) {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("revenue_sharing_proposals")
      .update({ status: "CANCELLED", updated_at: now })
      .eq("status", "PENDING");

    const { error: insertErr } = await supabase.from("revenue_sharing_proposals").insert({
      id: proposalRow.id,
      previous_technozi_pct: proposalRow.previousTechnoziPct,
      previous_developer_pct: proposalRow.previousDeveloperPct,
      proposed_technozi_pct: proposalRow.proposedTechnoziPct,
      proposed_developer_pct: proposalRow.proposedDeveloperPct,
      status: proposalRow.status,
      proposed_by_user_id: proposalRow.proposedByUserId,
      proposed_by_name: proposalRow.proposedByName,
      proposed_by_email: proposalRow.proposedByEmail,
      target_email: proposalRow.targetEmail,
      target_name: proposalRow.targetName,
      validation_token: proposalRow.validationToken,
      note: proposalRow.note,
      validated_by_user_id: null,
      validated_by_name: null,
      validated_by_email: null,
      validated_at: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });

    if (insertErr) {
      throw new Error(`Impossible d'enregistrer la proposition: ${insertErr.message}`);
    }

    try {
      await supabase.from("audit_logs").insert({
        id: `log-${crypto.randomUUID()}`,
        organization_id: null,
        leave_request_id: null,
        user_id: proposer.id,
        action: "REVENUE_SHARING_PROPOSED",
        old_status: `${currentConfig.technoziPct}/${currentConfig.developerPct}`,
        new_status: `${tPct}/${dPct}`,
        metadata: JSON.stringify({
          proposalId,
          targetEmail,
          note: params.note?.trim(),
        }),
        created_at: now,
      });
    } catch (_) {}
  } else {
    const db = dbInstance || getDb();
    await db
      .update(revenueSharingProposals)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(eq(revenueSharingProposals.status, "PENDING"));

    await db.insert(revenueSharingProposals).values(proposalRow);

    try {
      await db.insert(auditLogs).values({
        id: `log-${crypto.randomUUID()}`,
        organizationId: null,
        leaveRequestId: null,
        userId: proposer.id,
        action: "REVENUE_SHARING_PROPOSED" as any,
        oldStatus: `${currentConfig.technoziPct}/${currentConfig.developerPct}`,
        newStatus: `${tPct}/${dPct}`,
        metadata: JSON.stringify({
          proposalId,
          targetEmail,
          note: params.note?.trim(),
        }),
        createdAt: now,
      });
    } catch (_) {}
  }

  // Construction de l'URL de validation
  const baseUrl =
    params.originUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.rkonekte.com";
  const validationUrl = `${baseUrl}/super-admin/revenue-sharing?proposalId=${proposalId}&token=${validationToken}`;

  // Envoi de l'e-mail officiel à l'autre partie
  try {
    const emailPayload = generateRevenueSharingProposalEmail({
      recipientName: "Partenaire de Direction",
      proposerName: proposer.name,
      proposerEmail: proposer.email,
      currentTechnoziPct: currentConfig.technoziPct,
      currentDeveloperPct: currentConfig.developerPct,
      proposedTechnoziPct: tPct,
      proposedDeveloperPct: dPct,
      validationUrl,
      note: params.note?.trim(),
    });

    await sendEmail({
      to: targetEmail,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
    });
  } catch (err) {
    console.error("Échec de l'envoi de l'e-mail de proposition de répartition:", err);
  }

  return proposalRow;
}

/**
 * Valide ou rejette une proposition en attente.
 * GARDE-FOU STRICT : L'initiateur ne peut en aucun cas valider sa propre proposition.
 */
export async function validateRevenueSharingProposal(
  params: {
    proposalId: string;
    action: "APPROVE" | "REJECT";
    token?: string;
    rejectionReason?: string;
    originUrl?: string;
  },
  validator: { id: string; name: string; email: string },
  dbInstance?: any
): Promise<RevenueSharingProposalItem> {
  const useSupa = shouldUseSupabase(dbInstance);
  const now = Date.now();

  let proposal: RevenueSharingProposalItem | null = null;

  if (useSupa) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("revenue_sharing_proposals")
      .select("*")
      .eq("id", params.proposalId)
      .maybeSingle();

    if (error) throw new Error(`Erreur de chargement de la proposition: ${error.message}`);
    proposal = data ? mapSupabaseProposal(data) : null;
  } else {
    const db = dbInstance || getDb();
    const [row] = await db
      .select()
      .from(revenueSharingProposals)
      .where(eq(revenueSharingProposals.id, params.proposalId))
      .limit(1);
    proposal = row ? mapSqliteProposal(row) : null;
  }

  if (!proposal) {
    throw new Error("Proposition introuvable.");
  }

  if (proposal.status !== "PENDING") {
    throw new Error(
      `Cette proposition ne peut plus être modifiée car son statut actuel est : ${proposal.status}.`
    );
  }

  // Règle stricte des 4 yeux : la validation doit obligatoirement émaner de l'autre personne
  const validatorEmail = validator.email.toLowerCase().trim();
  const proposerEmail = proposal.proposedByEmail.toLowerCase().trim();

  if (validator.id === proposal.proposedByUserId || validatorEmail === proposerEmail) {
    throw new Error(
      "Action non autorisée : vous ne pouvez pas valider votre propre proposition. La validation doit impérativement être effectuée par l'autre partie (Directeur ou Développeur)."
    );
  }

  if (params.action === "REJECT") {
    const reason = params.rejectionReason?.trim() || "Proposition refusée par l'autre partie.";

    if (useSupa) {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase
        .from("revenue_sharing_proposals")
        .update({
          status: "REJECTED",
          validated_by_user_id: validator.id,
          validated_by_name: validator.name,
          validated_by_email: validatorEmail,
          validated_at: now,
          rejection_reason: reason,
          updated_at: now,
        })
        .eq("id", params.proposalId);

      if (error) throw new Error(`Erreur lors du rejet: ${error.message}`);

      try {
        await supabase.from("audit_logs").insert({
          id: `log-${crypto.randomUUID()}`,
          organization_id: null,
          leave_request_id: null,
          user_id: validator.id,
          action: "REVENUE_SHARING_REJECTED",
          old_status: `${proposal.proposedTechnoziPct}/${proposal.proposedDeveloperPct}`,
          new_status: "REJECTED",
          metadata: JSON.stringify({ proposalId: proposal.id, reason }),
          created_at: now,
        });
      } catch (_) {}
    } else {
      const db = dbInstance || getDb();
      await db
        .update(revenueSharingProposals)
        .set({
          status: "REJECTED",
          validatedByUserId: validator.id,
          validatedByName: validator.name,
          validatedByEmail: validatorEmail,
          validatedAt: now,
          rejectionReason: reason,
          updatedAt: now,
        })
        .where(eq(revenueSharingProposals.id, params.proposalId));

      try {
        await db.insert(auditLogs).values({
          id: `log-${crypto.randomUUID()}`,
          organizationId: null,
          leaveRequestId: null,
          userId: validator.id,
          action: "REVENUE_SHARING_REJECTED" as any,
          oldStatus: `${proposal.proposedTechnoziPct}/${proposal.proposedDeveloperPct}`,
          newStatus: "REJECTED",
          metadata: JSON.stringify({ proposalId: proposal.id, reason }),
          createdAt: now,
        });
      } catch (_) {}
    }

    return {
      ...proposal,
      status: "REJECTED",
      validatedByUserId: validator.id,
      validatedByName: validator.name,
      validatedByEmail: validatorEmail,
      validatedAt: now,
      rejectionReason: reason,
      updatedAt: now,
    };
  }

  // ACTION : APPROVE -> Activation immédiate de la nouvelle clé
  if (useSupa) {
    const supabase = getSupabaseAdminClient();
    const { error: propErr } = await supabase
      .from("revenue_sharing_proposals")
      .update({
        status: "APPROVED",
        validated_by_user_id: validator.id,
        validated_by_name: validator.name,
        validated_by_email: validatorEmail,
        validated_at: now,
        rejection_reason: null,
        updated_at: now,
      })
      .eq("id", params.proposalId);

    if (propErr) throw new Error(`Erreur lors de l'approbation: ${propErr.message}`);

    await getActiveRevenueSharingConfig(); // Ensure row exists
    const { error: cfgErr } = await supabase
      .from("revenue_sharing_configs")
      .update({
        technozi_pct: proposal.proposedTechnoziPct,
        developer_pct: proposal.proposedDeveloperPct,
        effective_from: now,
        updated_at: now,
        updated_by_user_id: validator.id,
        updated_by_name: validator.name,
      })
      .eq("id", "default");

    if (cfgErr) throw new Error(`Erreur lors de l'activation de la clé: ${cfgErr.message}`);

    try {
      await supabase.from("audit_logs").insert({
        id: `log-${crypto.randomUUID()}`,
        organization_id: null,
        leave_request_id: null,
        user_id: validator.id,
        action: "REVENUE_SHARING_APPROVED",
        old_status: `${proposal.previousTechnoziPct}/${proposal.previousDeveloperPct}`,
        new_status: `${proposal.proposedTechnoziPct}/${proposal.proposedDeveloperPct}`,
        metadata: JSON.stringify({
          proposalId: proposal.id,
          proposer: proposal.proposedByName,
          validator: validator.name,
          effectiveFrom: now,
        }),
        created_at: now,
      });
    } catch (_) {}
  } else {
    const db = dbInstance || getDb();
    await db
      .update(revenueSharingProposals)
      .set({
        status: "APPROVED",
        validatedByUserId: validator.id,
        validatedByName: validator.name,
        validatedByEmail: validatorEmail,
        validatedAt: now,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(revenueSharingProposals.id, params.proposalId));

    await db
      .update(revenueSharingConfigs)
      .set({
        technoziPct: proposal.proposedTechnoziPct,
        developerPct: proposal.proposedDeveloperPct,
        effectiveFrom: now,
        updatedAt: now,
        updatedByUserId: validator.id,
        updatedByName: validator.name,
      })
      .where(eq(revenueSharingConfigs.id, "default"));

    try {
      await db.insert(auditLogs).values({
        id: `log-${crypto.randomUUID()}`,
        organizationId: null,
        leaveRequestId: null,
        userId: validator.id,
        action: "REVENUE_SHARING_APPROVED" as any,
        oldStatus: `${proposal.previousTechnoziPct}/${proposal.previousDeveloperPct}`,
        newStatus: `${proposal.proposedTechnoziPct}/${proposal.proposedDeveloperPct}`,
        metadata: JSON.stringify({
          proposalId: proposal.id,
          proposer: proposal.proposedByName,
          validator: validator.name,
          effectiveFrom: now,
        }),
        createdAt: now,
      });
    } catch (_) {}
  }

  // Envoi de confirmation par e-mail aux deux parties
  const baseUrl =
    params.originUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.rkonekte.com";
  const dashboardUrl = `${baseUrl}/super-admin/revenue-sharing`;

  try {
    const confirmationEmail = generateRevenueSharingApprovedEmail({
      validatorName: validator.name,
      validatorEmail: validator.email,
      newTechnoziPct: proposal.proposedTechnoziPct,
      newDeveloperPct: proposal.proposedDeveloperPct,
      dashboardUrl,
    });

    await sendEmail({
      to: proposal.proposedByEmail,
      subject: confirmationEmail.subject,
      html: confirmationEmail.html,
      text: confirmationEmail.text,
    });

    if (validatorEmail && validatorEmail !== proposal.proposedByEmail) {
      await sendEmail({
        to: validatorEmail,
        subject: confirmationEmail.subject,
        html: confirmationEmail.html,
        text: confirmationEmail.text,
      });
    }
  } catch (err) {
    console.error("Échec envoi confirmation validation partage:", err);
  }

  return {
    ...proposal,
    status: "APPROVED",
    validatedByUserId: validator.id,
    validatedByName: validator.name,
    validatedByEmail: validatorEmail,
    validatedAt: now,
    rejectionReason: null,
    updatedAt: now,
  };
}

/**
 * Annule une proposition en attente émise par l'utilisateur connecté.
 */
export async function cancelRevenueSharingProposal(
  proposalId: string,
  callerId: string,
  dbInstance?: any
): Promise<void> {
  if (shouldUseSupabase(dbInstance)) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("revenue_sharing_proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();

    if (error) throw new Error(`Erreur de chargement: ${error.message}`);
    if (!data) throw new Error("Proposition introuvable.");
    if (data.status !== "PENDING") {
      throw new Error("Seule une proposition en attente peut être annulée.");
    }
    if (data.proposed_by_user_id !== callerId) {
      throw new Error("Seul l'auteur de la proposition peut l'annuler.");
    }

    const { error: updErr } = await supabase
      .from("revenue_sharing_proposals")
      .update({ status: "CANCELLED", updated_at: Date.now() })
      .eq("id", proposalId);

    if (updErr) throw new Error(`Erreur lors de l'annulation: ${updErr.message}`);
    return;
  }

  const db = dbInstance || getDb();
  const [proposal] = await db
    .select()
    .from(revenueSharingProposals)
    .where(eq(revenueSharingProposals.id, proposalId))
    .limit(1);

  if (!proposal) throw new Error("Proposition introuvable.");
  if (proposal.status !== "PENDING") {
    throw new Error("Seule une proposition en attente peut être annulée.");
  }
  if (proposal.proposedByUserId !== callerId) {
    throw new Error("Seul l'auteur de la proposition peut l'annuler.");
  }

  await db
    .update(revenueSharingProposals)
    .set({ status: "CANCELLED", updatedAt: Date.now() })
    .where(eq(revenueSharingProposals.id, proposalId));
}

/**
 * Applique et scelle un snapshot immuable sur un paiement de renouvellement.
 * RÈGLE D'OR : Les transactions déjà scellées ne sont jamais recalculées.
 */
export async function snapshotRevenueForRenewal(
  renewalId: string,
  amount: number,
  dbInstance?: any
): Promise<RevenueSplitResult> {
  const config = await getActiveRevenueSharingConfig(dbInstance);
  const split = calculateRevenueSplit(amount, config);
  const now = Date.now();

  if (shouldUseSupabase(dbInstance)) {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("subscription_renewals")
      .update({
        revenue_technozi_pct: split.technoziPct,
        revenue_developer_pct: split.developerPct,
        revenue_technozi_amount: split.technoziAmount,
        revenue_developer_amount: split.developerAmount,
        revenue_calculated_at: now,
      })
      .eq("id", renewalId);
    return split;
  }

  const db = dbInstance || getDb();
  await db
    .update(subscriptionRenewals)
    .set({
      revenueTechnoziPct: split.technoziPct,
      revenueDeveloperPct: split.developerPct,
      revenueTechnoziAmount: split.technoziAmount,
      revenueDeveloperAmount: split.developerAmount,
      revenueCalculatedAt: now,
    })
    .where(eq(subscriptionRenewals.id, renewalId));

  return split;
}

/**
 * Récupère les métriques financières cumulées basées sur les snapshots des transactions.
 */
export async function getRevenueSharingMetrics(
  dbInstance?: any
): Promise<RevenueSharingMetrics> {
  let approvedRenewals: Array<{
    amountExpected: number;
    revenueTechnoziAmount: number | null;
    revenueDeveloperAmount: number | null;
  }> = [];

  if (shouldUseSupabase(dbInstance)) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("subscription_renewals")
        .select("id, amount_expected, currency, revenue_technozi_amount, revenue_developer_amount")
        .eq("status", "APPROVED");

      if (error) throw error;

      approvedRenewals = (data || []).map((r: any) => ({
        amountExpected: Number(r.amount_expected) || 0,
        revenueTechnoziAmount:
          r.revenue_technozi_amount != null ? Number(r.revenue_technozi_amount) : null,
        revenueDeveloperAmount:
          r.revenue_developer_amount != null ? Number(r.revenue_developer_amount) : null,
      }));
    } catch (err) {
      if (process.env.VERCEL) {
        console.error("Supabase getRevenueSharingMetrics error:", err);
        return {
          totalApprovedRevenue: 0,
          totalTechnoziAmount: 0,
          totalDeveloperAmount: 0,
          approvedTransactionsCount: 0,
          currency: "USD",
        };
      }
      const db = getDb();
      const rows = await db
        .select({
          amountExpected: subscriptionRenewals.amountExpected,
          revenueTechnoziAmount: subscriptionRenewals.revenueTechnoziAmount,
          revenueDeveloperAmount: subscriptionRenewals.revenueDeveloperAmount,
        })
        .from(subscriptionRenewals)
        .where(eq(subscriptionRenewals.status, "APPROVED"));
      approvedRenewals = rows.map((r: any) => ({
        amountExpected: Number(r.amountExpected) || 0,
        revenueTechnoziAmount:
          r.revenueTechnoziAmount != null ? Number(r.revenueTechnoziAmount) : null,
        revenueDeveloperAmount:
          r.revenueDeveloperAmount != null ? Number(r.revenueDeveloperAmount) : null,
      }));
    }
  } else {
    const db = dbInstance || getDb();
    const rows = await db
      .select({
        amountExpected: subscriptionRenewals.amountExpected,
        revenueTechnoziAmount: subscriptionRenewals.revenueTechnoziAmount,
        revenueDeveloperAmount: subscriptionRenewals.revenueDeveloperAmount,
      })
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.status, "APPROVED"));

    approvedRenewals = rows.map((r: any) => ({
      amountExpected: Number(r.amountExpected) || 0,
      revenueTechnoziAmount:
        r.revenueTechnoziAmount != null ? Number(r.revenueTechnoziAmount) : null,
      revenueDeveloperAmount:
        r.revenueDeveloperAmount != null ? Number(r.revenueDeveloperAmount) : null,
    }));
  }

  let totalRevenue = 0;
  let totalTechnozi = 0;
  let totalDeveloper = 0;

  for (const r of approvedRenewals) {
    const amt = Number(r.amountExpected) || 0;
    totalRevenue += amt;

    if (r.revenueTechnoziAmount !== null && r.revenueTechnoziAmount !== undefined) {
      totalTechnozi += Number(r.revenueTechnoziAmount) || 0;
      totalDeveloper += Number(r.revenueDeveloperAmount) || 0;
    } else {
      const legacySplit = calculateRevenueSplit(amt, { technoziPct: 60, developerPct: 40 });
      totalTechnozi += legacySplit.technoziAmount;
      totalDeveloper += legacySplit.developerAmount;
    }
  }

  return {
    totalApprovedRevenue: Math.round(totalRevenue * 100) / 100,
    totalTechnoziAmount: Math.round(totalTechnozi * 100) / 100,
    totalDeveloperAmount: Math.round(totalDeveloper * 100) / 100,
    approvedTransactionsCount: approvedRenewals.length,
    currency: "USD",
  };
}

/**
 * Liste l'historique complet des propositions de répartition.
 */
export async function listRevenueSharingProposals(
  dbInstance?: any
): Promise<RevenueSharingProposalItem[]> {
  if (shouldUseSupabase(dbInstance)) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("revenue_sharing_proposals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map(mapSupabaseProposal);
    } catch (err) {
      if (process.env.VERCEL) {
        console.error("Supabase listRevenueSharingProposals error:", err);
        return [];
      }
    }
  }

  const db = dbInstance || getDb();
  const rows = await db
    .select()
    .from(revenueSharingProposals)
    .orderBy(desc(revenueSharingProposals.createdAt));

  return rows.map(mapSqliteProposal);
}
