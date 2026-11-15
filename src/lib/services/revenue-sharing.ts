import { getDb } from "@/lib/db/client";
import {
  revenueSharingConfigs,
  revenueSharingProposals,
  subscriptionRenewals,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { sendEmail, generateRevenueSharingProposalEmail, generateRevenueSharingApprovedEmail } from "@/lib/notifications/email";

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

/**
 * Récupère la configuration active du partage des revenus.
 * Si elle n'existe pas encore, initialise à 60% TECHNOZI / 40% Développeur.
 */
export async function getActiveRevenueSharingConfig(
  dbInstance?: any
): Promise<RevenueSharingConfigItem> {
  const db = dbInstance || getDb();
  const now = Date.now();

  const [row] = await db
    .select()
    .from(revenueSharingConfigs)
    .where(eq(revenueSharingConfigs.id, "default"))
    .limit(1);

  if (!row) {
    // Initialisation par défaut : 60% TECHNOZI / 40% Développeur
    const initial: RevenueSharingConfigItem = {
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
  const db = dbInstance || getDb();
  await getActiveRevenueSharingConfig(db); // Assure existence
  const now = Date.now();

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
  const db = dbInstance || getDb();
  const currentConfig = await getActiveRevenueSharingConfig(db);

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
    // Si le proposant est le développeur, le destinataire est le directeur
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

  // Annuler les propositions en attente précédentes
  const now = Date.now();
  await db
    .update(revenueSharingProposals)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(eq(revenueSharingProposals.status, "PENDING"));

  const proposalId = `revprop-${crypto.randomUUID()}`;
  const validationToken = crypto.randomUUID();

  const proposalRow = {
    id: proposalId,
    previousTechnoziPct: currentConfig.technoziPct,
    previousDeveloperPct: currentConfig.developerPct,
    proposedTechnoziPct: tPct,
    proposedDeveloperPct: dPct,
    status: "PENDING" as const,
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

  await db.insert(revenueSharingProposals).values(proposalRow);

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

  // Journalisation d'audit
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

  return {
    ...proposalRow,
  };
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
  const db = dbInstance || getDb();
  const now = Date.now();

  const [proposal] = await db
    .select()
    .from(revenueSharingProposals)
    .where(eq(revenueSharingProposals.id, params.proposalId))
    .limit(1);

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

  if (
    validator.id === proposal.proposedByUserId ||
    validatorEmail === proposerEmail
  ) {
    throw new Error(
      "Action non autorisée : vous ne pouvez pas valider votre propre proposition. La validation doit impérativement être effectuée par l'autre partie (Directeur ou Développeur)."
    );
  }

  if (params.action === "REJECT") {
    const reason = params.rejectionReason?.trim() || "Proposition refusée par l'autre partie.";
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

    // Audit log
    try {
      await db.insert(auditLogs).values({
        id: `log-${crypto.randomUUID()}`,
        organizationId: null,
        leaveRequestId: null,
        userId: validator.id,
        action: "REVENUE_SHARING_REJECTED" as any,
        oldStatus: `${proposal.proposedTechnoziPct}/${proposal.proposedDeveloperPct}`,
        newStatus: "REJECTED",
        metadata: JSON.stringify({
          proposalId: proposal.id,
          reason,
        }),
        createdAt: now,
      });
    } catch (_) {}

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

  // Met à jour la configuration active
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

  // Audit log
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

    // Envoi au proposant
    await sendEmail({
      to: proposal.proposedByEmail,
      subject: confirmationEmail.subject,
      html: confirmationEmail.html,
      text: confirmationEmail.text,
    });

    // Envoi au validateur si adresse distincte
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
  const db = dbInstance || getDb();
  const config = await getActiveRevenueSharingConfig(db);
  const split = calculateRevenueSplit(amount, config);
  const now = Date.now();

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
  const db = dbInstance || getDb();

  const approvedRenewals = await db
    .select({
      id: subscriptionRenewals.id,
      amountExpected: subscriptionRenewals.amountExpected,
      currency: subscriptionRenewals.currency,
      revenueTechnoziAmount: subscriptionRenewals.revenueTechnoziAmount,
      revenueDeveloperAmount: subscriptionRenewals.revenueDeveloperAmount,
      revenueTechnoziPct: subscriptionRenewals.revenueTechnoziPct,
      revenueDeveloperPct: subscriptionRenewals.revenueDeveloperPct,
    })
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.status, "APPROVED"));

  let totalRevenue = 0;
  let totalTechnozi = 0;
  let totalDeveloper = 0;

  for (const r of approvedRenewals) {
    const amt = Number(r.amountExpected) || 0;
    totalRevenue += amt;

    // Si le snapshot existe déjà
    if (r.revenueTechnoziAmount !== null && r.revenueTechnoziAmount !== undefined) {
      totalTechnozi += Number(r.revenueTechnoziAmount) || 0;
      totalDeveloper += Number(r.revenueDeveloperAmount) || 0;
    } else {
      // Pour les transactions historiques antérieures à l'introduction du module,
      // appliquer la répartition par défaut 60/40 de manière protégée
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
  const db = dbInstance || getDb();
  const rows = await db
    .select()
    .from(revenueSharingProposals)
    .orderBy(desc(revenueSharingProposals.createdAt));

  return rows.map((r: any) => ({
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
  }));
}
