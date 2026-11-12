"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History,
  PlusCircle,
  Power,
  Receipt,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";
import { ProofPreviewModal } from "@/components/subscription/PaymentVisuals";
import {
  calculateRenewalWindow,
  formatFrDate,
  formatMoney,
  PlatformSubscriptionSettingsData,
  SubscriptionPlanOption,
  SubscriptionRenewalItem,
  SubscriptionStateSummary,
} from "@/lib/utils/subscription";

interface SuperAdminOrganizationItem {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "DISABLED";
  createdAt: number;
  activatedAt?: number | null;
  lastRenewedAt?: number | null;
  subscriptionExpiresAt?: number | null;
  serviceStopped?: boolean;
  serviceStoppedAt?: number | null;
  adminEmail?: string | null;
  adminName?: string | null;
  pendingCount: number;
  requestCount: number;
  subscriptionState: SubscriptionStateSummary;
  pendingRenewal?: SubscriptionRenewalItem | null;
}

type OrgFilterTab = "ALL" | "PENDING_REF" | "EXPIRED_OR_STOPPED" | "ACTIVE";

export default function SuperAdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationItem[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
  const [settings, setSettings] = useState<PlatformSubscriptionSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<OrgFilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Verify / Renew modal state
  const [renewOrg, setRenewOrg] = useState<SuperAdminOrganizationItem | null>(null);
  const [renewTab, setRenewTab] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<string>("MonCash");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [useCustomExpiry, setUseCustomExpiry] = useState<boolean>(false);
  const [customExpiryDate, setCustomExpiryDate] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [processingRenewal, setProcessingRenewal] = useState<boolean>(false);

  // History modal state
  const [historyOrg, setHistoryOrg] = useState<SuperAdminOrganizationItem | null>(null);
  const [historyItems, setHistoryItems] = useState<SubscriptionRenewalItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Stop / Resume service confirmation modal state
  const [serviceModalOrg, setServiceModalOrg] = useState<SuperAdminOrganizationItem | null>(null);
  const [togglingService, setTogglingService] = useState<boolean>(false);

  // Proof preview lightbox state
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    name?: string | null;
    title?: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgsRes, settingsRes] = await Promise.all([
        fetch("/api/super-admin/organizations", { cache: "no-store" }),
        fetch("/api/super-admin/subscription-settings", { cache: "no-store" }),
      ]);
      const orgsJson = await orgsRes.json();
      if (orgsJson.organizations) {
        setOrganizations(orgsJson.organizations);
      }
      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json();
        if (settingsJson.plans) setPlans(settingsJson.plans);
        if (settingsJson.settings) setSettings(settingsJson.settings);
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrgs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return organizations.filter((org) => {
      if (filterTab === "PENDING_REF" && !org.pendingRenewal) return false;
      if (
        filterTab === "EXPIRED_OR_STOPPED" &&
        !org.subscriptionState?.serviceStopped &&
        !org.subscriptionState?.isExpired
      ) {
        return false;
      }
      if (
        filterTab === "ACTIVE" &&
        !(
          org.status === "ACTIVE" &&
          !org.subscriptionState?.serviceStopped &&
          !org.subscriptionState?.isExpired
        )
      ) {
        return false;
      }
      if (q) {
        const haystack = [
          org.name,
          org.slug,
          org.adminEmail || "",
          org.email || "",
          org.pendingRenewal?.paymentReference || "",
          org.pendingRenewal?.paymentMethod || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [organizations, filterTab, searchQuery]);

  const pendingRefCount = useMemo(
    () => organizations.filter((o) => Boolean(o.pendingRenewal)).length,
    [organizations]
  );

  const expiredOrStoppedCount = useMemo(
    () =>
      organizations.filter(
        (o) => o.subscriptionState?.serviceStopped || o.subscriptionState?.isExpired
      ).length,
    [organizations]
  );

  const activeUpToDateCount = useMemo(
    () =>
      organizations.filter(
        (o) =>
          o.status === "ACTIVE" &&
          !o.subscriptionState?.serviceStopped &&
          !o.subscriptionState?.isExpired
      ).length,
    [organizations]
  );

  const openRenewModal = (org: SuperAdminOrganizationItem) => {
    setRenewOrg(org);
    setRenewTab("APPROVE");
    setRejectionReason("");
    setUseCustomExpiry(false);
    setCustomExpiryDate("");
    if (org.pendingRenewal) {
      setDurationMonths(org.pendingRenewal.durationMonths || 1);
      setPaymentMethod(org.pendingRenewal.paymentMethod || "MonCash");
      setPaymentReference(org.pendingRenewal.paymentReference || "");
    } else {
      setDurationMonths(1);
      const firstAccount = settings?.paymentAccounts?.find((a) => a.enabled);
      setPaymentMethod(firstAccount?.label || "MonCash");
      setPaymentReference("");
    }
  };

  const openHistoryModal = async (org: SuperAdminOrganizationItem) => {
    setHistoryOrg(org);
    setLoadingHistory(true);
    setHistoryItems([]);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org.id}/subscription`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (Array.isArray(json.history)) {
        setHistoryItems(json.history);
      }
    } catch (err) {
      console.error("Failed to fetch renewal history:", err);
      showSystemToast("Impossible de charger l'historique.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const calculatedWindow = useMemo(() => {
    if (!renewOrg) return null;
    return calculateRenewalWindow(
      renewOrg.subscriptionExpiresAt ?? null,
      Date.now(),
      durationMonths
    );
  }, [renewOrg, durationMonths]);

  const selectedPlan = useMemo(() => {
    return plans.find((p) => p.durationMonths === durationMonths) || null;
  }, [plans, durationMonths]);

  const handleConfirmApproveRenewal = async () => {
    if (!renewOrg) return;
    setProcessingRenewal(true);
    try {
      let customExpiresAt: number | null = null;
      if (useCustomExpiry && customExpiryDate) {
        const parsed = new Date(`${customExpiryDate}T23:59:00`).getTime();
        if (!Number.isFinite(parsed) || parsed <= Date.now()) {
          showSystemToast("Veuillez choisir une date future valide.", "error");
          setProcessingRenewal(false);
          return;
        }
        customExpiresAt = parsed;
      }

      const res = await fetch(
        `/api/super-admin/organizations/${renewOrg.id}/subscription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE_RENEWAL",
            renewalId: renewOrg.pendingRenewal?.id || null,
            durationMonths,
            paymentMethod,
            paymentReference,
            customExpiresAt,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors du renouvellement.", "error");
        return;
      }

      showSystemToast(
        `Renouvellement de ${durationMonths} mois validé pour « ${renewOrg.name} ».`
      );
      setRenewOrg(null);
      await loadData();
    } catch (_) {
      showSystemToast("Erreur réseau.", "error");
    } finally {
      setProcessingRenewal(false);
    }
  };

  const handleConfirmRejectRenewal = async () => {
    if (!renewOrg?.pendingRenewal) return;
    setProcessingRenewal(true);
    try {
      const res = await fetch(
        `/api/super-admin/organizations/${renewOrg.id}/subscription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REJECT_RENEWAL",
            renewalId: renewOrg.pendingRenewal.id,
            rejectionReason:
              rejectionReason.trim() || "Référence introuvable ou paiement non reçu.",
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors du refus.", "error");
        return;
      }
      showSystemToast(
        `Référence refusée et notification envoyée à « ${renewOrg.name} ».`
      );
      setRenewOrg(null);
      await loadData();
    } catch (_) {
      showSystemToast("Erreur réseau.", "error");
    } finally {
      setProcessingRenewal(false);
    }
  };

  const handleConfirmServiceToggle = async () => {
    if (!serviceModalOrg) return;
    const isCurrentlyStopped = Boolean(serviceModalOrg.subscriptionState?.serviceStopped);
    setTogglingService(true);
    try {
      const res = await fetch(
        `/api/super-admin/organizations/${serviceModalOrg.id}/subscription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: isCurrentlyStopped ? "RESUME_SERVICE" : "STOP_SERVICE",
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors de l'action.", "error");
        return;
      }
      showSystemToast(
        isCurrentlyStopped
          ? `Service réactivé pour « ${serviceModalOrg.name} ».`
          : `Service arrêté pour « ${serviceModalOrg.name} ». Ses utilisateurs ont été déconnectés.`
      );
      setServiceModalOrg(null);
      await loadData();
    } catch (_) {
      showSystemToast("Erreur réseau.", "error");
    } finally {
      setTogglingService(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER (ONE CLEAN HORIZONTAL ROW ON DESKTOP) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Entreprises clientes &amp; Abonnements
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Suivi des abonnements, échéances et vérifications de paiement ({organizations.length} entreprise{organizations.length > 1 ? "s" : ""}).
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="h-9 px-3.5 bg-white hover:bg-slate-50 border border-[#DCE2EA] text-[#062653] text-xs font-semibold rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>
          <Link
            href="/super-admin/subscription-settings"
            className="h-9 px-3.5 bg-white hover:bg-slate-50 border border-[#DCE2EA] text-[#062653] text-xs font-semibold rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 text-[#FF7900]" />
            <span>Tarifs &amp; Comptes</span>
          </Link>
          <Link
            href="/super-admin/organizations/new"
            className="h-9 px-4 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#FF7900]" />
            <span>Créer une entreprise</span>
          </Link>
        </div>
      </div>

      {/* UNIFIED TOOLBAR: SEGMENTED FILTERS + SEARCH */}
      <div className="bg-white border border-[#DCE2EA] rounded-2xl p-3 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "ALL"
                ? "bg-[#062653] text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
            }`}
          >
            Toutes ({organizations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("PENDING_REF")}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
              filterTab === "PENDING_REF"
                ? "bg-[#FF7900] text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
            }`}
          >
            {pendingRefCount > 0 && filterTab !== "PENDING_REF" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF7900] shrink-0" />
            )}
            <span>Références à vérifier ({pendingRefCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("EXPIRED_OR_STOPPED")}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
              filterTab === "EXPIRED_OR_STOPPED"
                ? "bg-rose-600 text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
            }`}
          >
            {expiredOrStoppedCount > 0 && filterTab !== "EXPIRED_OR_STOPPED" && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
            )}
            <span>Expirées / Coupées ({expiredOrStoppedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ACTIVE")}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "ACTIVE"
                ? "bg-emerald-600 text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
            }`}
          >
            Actives à jour ({activeUpToDateCount})
          </button>
        </div>

        <div className="relative w-full xl:w-72 shrink-0">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher entreprise, e-mail, réf..."
            className="w-full h-9 pl-8 pr-3 bg-[#F4F6F9] border border-[#DCE2EA] rounded-xl text-xs text-[#263445] focus:bg-white focus:border-[#062653] outline-none transition-colors"
          />
        </div>
      </div>

      {/* ORGANIZATIONS TABLE — CLEAN PRO LAYOUT WITH 1-LINE HEADERS & ZERO PILL BACKGROUNDS */}
      <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Chargement...</div>
        ) : filteredOrgs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <p>Aucune entreprise ne correspond aux filtres sélectionnés.</p>
            {(filterTab !== "ALL" || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFilterTab("ALL");
                  setSearchQuery("");
                }}
                className="px-3 py-1.5 bg-[#062653] text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Afficher toutes les entreprises
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase tracking-wider font-bold text-[#64748B] border-b border-[#DCE2EA]">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Entreprise</th>
                  <th className="px-3 py-3 whitespace-nowrap">Création</th>
                  <th className="px-3 py-3 whitespace-nowrap">Renouvellement</th>
                  <th className="px-3 py-3 whitespace-nowrap">Expiration</th>
                  <th className="px-3 py-3 whitespace-nowrap">Statut &amp; Paiement</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EA]">
                {filteredOrgs.map((org) => {
                  const sub = org.subscriptionState;
                  const pendingRef = org.pendingRenewal;
                  const isStopped = Boolean(sub?.serviceStopped);
                  const isExpired = Boolean(sub?.isExpired);
                  const isPendingActivation = sub?.phase === "PENDING_ACTIVATION";

                  return (
                    <tr key={org.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* ENTREPRISE */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-sm text-[#062653] leading-snug">
                          {org.name}
                        </div>
                        <div className="text-xs text-[#64748B] truncate max-w-[230px]">
                          {org.adminEmail || org.email || "Sans email"}
                        </div>
                      </td>

                      {/* 1. CREATION */}
                      <td className="px-3 py-3.5 text-xs font-medium text-[#263445] whitespace-nowrap tabular-nums">
                        {formatFrDate(org.createdAt)}
                      </td>

                      {/* 2. DERNIER RENOUVELLEMENT */}
                      <td className="px-3 py-3.5 text-xs font-medium text-[#64748B] whitespace-nowrap tabular-nums">
                        {formatFrDate(org.lastRenewedAt)}
                      </td>

                      {/* 3. PROCHAINE EXPIRATION */}
                      <td className="px-3 py-3.5 text-xs font-bold text-[#062653] whitespace-nowrap tabular-nums">
                        {formatFrDate(org.subscriptionExpiresAt)}
                      </td>

                      {/* STATUT & PAIEMENT (SANS BACKGROUND, LISIBLE SUR UNE LIGNE) */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {isStopped ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                              <span>Service arrêté</span>
                            </span>
                          ) : isPendingActivation ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                              <span>En attente d&apos;activation</span>
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 whitespace-nowrap">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>{sub.countdownLabel} • Accès bloqué</span>
                            </span>
                          ) : sub?.shouldShowCountdownBanner ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900] whitespace-nowrap">
                              <Clock className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
                              <span>{sub.countdownLabel}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span>{sub?.countdownLabel || "Actif"}</span>
                            </span>
                          )}

                          {pendingRef && (
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#062653] whitespace-nowrap">
                              <Receipt className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
                              <span>
                                {pendingRef.paymentReference ? (
                                  <>
                                    Réf :{" "}
                                    <span className="font-mono font-bold">
                                      {pendingRef.paymentReference}
                                    </span>{" "}
                                    •{" "}
                                  </>
                                ) : pendingRef.proofDataUrl ? (
                                  <>Preuve jointe • </>
                                ) : null}
                                {pendingRef.durationMonths} mois ({pendingRef.paymentMethod})
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* ACTIONS (UNE SEULE LIGNE PROPRE ET ALIGNÉE) */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openRenewModal(org)}
                            title={
                              isExpired
                                ? "Renouveler l'abonnement pour réactiver l'accès"
                                : "Prolonger ou renouveler la durée d'abonnement"
                            }
                            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              pendingRef
                                ? "bg-[#FF7900] hover:bg-[#E66D00] text-white"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            <RotateCw className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {pendingRef
                                ? isExpired
                                  ? "Vérifier & Réactiver"
                                  : isPendingActivation
                                  ? "Vérifier & Activer"
                                  : "Vérifier & Renouveler"
                                : isExpired
                                ? "Réactiver"
                                : "Renouveler"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openHistoryModal(org)}
                            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-[#DCE2EA] text-[#062653] hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5 shrink-0" />
                            <span>Historique</span>
                          </button>

                          {!isPendingActivation && !isExpired && (
                            <button
                              type="button"
                              onClick={() => setServiceModalOrg(org)}
                              title={
                                isStopped
                                  ? "Rétablir immédiatement le service (abonnement encore valide)"
                                  : "Arrêter temporairement le service de cette entreprise"
                              }
                              className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isStopped
                                  ? "bg-[#062653] hover:bg-[#031B3A] text-white"
                                  : "text-rose-600 hover:bg-rose-50 border border-rose-200"
                              }`}
                            >
                              <Power className="w-3.5 h-3.5 shrink-0" />
                              <span>{isStopped ? "Réactiver" : "Arrêter"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: VÉRIFIER & RENOUVELER / REFUSER (LARGE SANS ASCENSEUR & SANS FOND COULEUR) */}
      <Modal
        isOpen={Boolean(renewOrg)}
        onClose={() => {
          if (!processingRenewal) setRenewOrg(null);
        }}
        title={
          renewOrg?.pendingRenewal
            ? "Vérifier le paiement & Renouveler"
            : "Renouveler l'abonnement"
        }
        maxWidth={renewOrg?.pendingRenewal ? "5xl" : "3xl"}
      >
        {renewOrg && (
          <div className="space-y-4">
            {/* BANDEAU ENTREPRISE SOBRE SANS FOND COLORÉ */}
            <div className="px-4 py-3 bg-white border border-[#DCE2EA] rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs text-[#64748B]">Entreprise cliente :</span>
                <span className="text-base font-bold text-[#062653]">{renewOrg.name}</span>
                {(renewOrg.adminEmail || renewOrg.email) && (
                  <span className="text-xs text-[#64748B]">
                    ({renewOrg.adminEmail || renewOrg.email})
                  </span>
                )}
              </div>
              <div className="text-right text-xs flex items-baseline gap-2">
                <span className="text-[#64748B]">Expiration actuelle :</span>
                <span className="font-bold text-[#062653] tabular-nums">
                  {formatFrDate(renewOrg.subscriptionExpiresAt)}
                </span>
              </div>
            </div>

            <div
              className={
                renewOrg.pendingRenewal
                  ? "grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
                  : ""
              }
            >
              {/* COLONNE GAUCHE : RÉFÉRENCE & PREUVE SOUMISES PAR LE CLIENT (FOND BLANC) */}
              {renewOrg.pendingRenewal && (
                <div className="lg:col-span-5 p-4 bg-white border border-[#DCE2EA] rounded-xl space-y-3.5 text-xs text-[#263445]">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#DCE2EA]">
                    <span className="font-bold text-[#062653] flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-[#FF7900] shrink-0" />
                      <span>Référence soumise par le client</span>
                    </span>
                    <span className="text-[11px] font-medium text-[#64748B] whitespace-nowrap">
                      Le {formatFrDate(renewOrg.pendingRenewal.createdAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-[#64748B] block">Durée demandée</span>
                      <strong className="text-sm text-[#062653]">
                        {renewOrg.pendingRenewal.durationMonths} mois
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#64748B] block">Montant attendu</span>
                      <strong className="text-sm text-[#062653]">
                        {formatMoney(
                          renewOrg.pendingRenewal.amountExpected,
                          renewOrg.pendingRenewal.currency
                        )}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#64748B] block">Mode de paiement</span>
                      <strong className="text-[#062653]">
                        {renewOrg.pendingRenewal.paymentMethod}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#64748B] block">
                        {renewOrg.pendingRenewal.paymentReference
                          ? "Référence"
                          : "Entreprise indiquée"}
                      </span>
                      <strong className="font-mono text-[#062653]">
                        {renewOrg.pendingRenewal.paymentReference ||
                          renewOrg.pendingRenewal.payerCompanyName ||
                          "—"}
                      </strong>
                    </div>
                  </div>

                  {renewOrg.pendingRenewal.payerCompanyName &&
                    renewOrg.pendingRenewal.paymentReference && (
                      <div className="text-[11px] text-[#64748B]">
                        Entreprise indiquée :{" "}
                        <strong className="text-[#062653]">
                          {renewOrg.pendingRenewal.payerCompanyName}
                        </strong>
                      </div>
                    )}

                  {renewOrg.pendingRenewal.payerNote && (
                    <div className="text-[11px] text-[#64748B]">
                      Note client :{" "}
                      <strong className="text-[#062653]">
                        {renewOrg.pendingRenewal.payerNote}
                      </strong>
                    </div>
                  )}

                  {renewOrg.pendingRenewal.proofDataUrl && (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#DCE2EA]">
                      {renewOrg.pendingRenewal.proofDataUrl.startsWith("data:image/") ? (
                        <img
                          src={renewOrg.pendingRenewal.proofDataUrl}
                          alt="Preuve de paiement"
                          className="w-11 h-11 rounded-lg object-cover border border-[#DCE2EA] shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-white border border-[#DCE2EA] text-rose-600 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-[#062653] truncate">
                          {renewOrg.pendingRenewal.proofFileName || "Preuve de paiement jointe"}
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          Justificatif transmis par l&apos;entreprise
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setProofPreview({
                            url: renewOrg.pendingRenewal!.proofDataUrl!,
                            name: renewOrg.pendingRenewal!.proofFileName,
                            title: `Preuve de paiement — ${renewOrg.name}`,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg border border-[#062653] bg-white hover:bg-[#062653] text-[#062653] hover:text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Voir la preuve</span>
                      </button>
                    </div>
                  )}

                  {/* BASCULE DÉCISION SOBRE SANS FOND COLORÉ */}
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-[#DCE2EA]">
                    <button
                      type="button"
                      onClick={() => setRenewTab("APPROVE")}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 bg-white ${
                        renewTab === "APPROVE"
                          ? "border-2 border-emerald-600 text-emerald-700"
                          : "border-[#DCE2EA] text-[#64748B] hover:text-[#062653]"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Valider &amp; Renouveler</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenewTab("REJECT")}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 bg-white ${
                        renewTab === "REJECT"
                          ? "border-2 border-rose-600 text-rose-700"
                          : "border-[#DCE2EA] text-[#64748B] hover:text-rose-700"
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Refuser la référence</span>
                    </button>
                  </div>
                </div>
              )}

              {/* COLONNE DROITE : FORMULAIRE DE VALIDATION OU DE REFUS */}
              <div className={renewOrg.pendingRenewal ? "lg:col-span-7" : ""}>
                {renewTab === "REJECT" && renewOrg.pendingRenewal ? (
                  <div className="p-4 bg-white border border-[#DCE2EA] rounded-xl space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#062653] mb-1.5">
                        Motif du refus (envoyé par e-mail à l&apos;entreprise)
                      </label>
                      <textarea
                        rows={4}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Ex : Référence introuvable sur notre compte MonCash ou montant incomplet."
                        className="w-full p-3 text-xs bg-white border border-[#DCE2EA] rounded-xl focus:border-rose-500 outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-[#DCE2EA]">
                      <button
                        type="button"
                        disabled={processingRenewal}
                        onClick={() => setRenewOrg(null)}
                        className="px-4 py-2 text-xs font-semibold text-[#64748B] border border-[#DCE2EA] hover:text-[#062653] bg-white rounded-lg cursor-pointer"
                      >
                        Fermer
                      </button>
                      <button
                        type="button"
                        disabled={processingRenewal}
                        onClick={handleConfirmRejectRenewal}
                        className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{processingRenewal ? "Traitement..." : "Confirmer le refus"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#062653] mb-1.5">
                        Durée à valider
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[1, 3, 6, 12].map((m) => {
                          const plan = plans.find((p) => p.durationMonths === m);
                          const isSel = durationMonths === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setDurationMonths(m)}
                              className={`p-2.5 rounded-xl bg-white text-left cursor-pointer transition-all ${
                                isSel
                                  ? "border-2 border-[#FF7900]"
                                  : "border border-[#DCE2EA] hover:border-slate-300"
                              }`}
                            >
                              <div className="text-xs font-bold text-[#062653]">
                                {m === 12 ? "12 mois (1 an)" : `${m} mois`}
                              </div>
                              <div className="text-xs font-bold text-[#FF7900]">
                                {plan ? formatMoney(plan.price, plan.currency) : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#062653] mb-1">
                          Mode de règlement perçu
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full h-10 px-3 text-xs border border-[#DCE2EA] rounded-xl bg-white outline-none focus:border-[#062653]"
                        >
                          {(settings?.paymentAccounts || []).map((a) => (
                            <option key={a.id} value={a.label}>
                              {a.label}
                            </option>
                          ))}
                          {!(settings?.paymentAccounts || []).some(
                            (a) => a.label === paymentMethod
                          ) &&
                            paymentMethod && (
                              <option value={paymentMethod}>{paymentMethod}</option>
                            )}
                          <option value="Espèces / Reçu manuel">Espèces / Reçu manuel</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#062653] mb-1">
                          Référence de transaction
                        </label>
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Ex : MC-884920"
                          className="w-full h-10 px-3 text-xs font-mono bg-white border border-[#DCE2EA] rounded-xl outline-none focus:border-[#062653]"
                        />
                      </div>
                    </div>

                    {calculatedWindow && (
                      <div className="p-3 bg-white border border-[#DCE2EA] rounded-xl space-y-1 text-xs">
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5 text-[#062653]">
                            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Nouvelle expiration calculée :</span>
                          </span>
                          <span className="text-emerald-700 tabular-nums">
                            {formatFrDate(calculatedWindow.periodEnd)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B]">
                          {renewOrg.subscriptionExpiresAt &&
                          renewOrg.subscriptionExpiresAt > Date.now()
                            ? `Paiement en avance : part du ${formatFrDate(
                                calculatedWindow.periodStart
                              )} (+${durationMonths} mois, aucun jour restant perdu).`
                            : `Redémarrage à compter d'aujourd'hui (${formatFrDate(
                                calculatedWindow.periodStart
                              )} + ${durationMonths} mois).`}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                      <div className="flex items-center gap-2">
                        <input
                          id="customExpiryToggle"
                          type="checkbox"
                          checked={useCustomExpiry}
                          onChange={(e) => setUseCustomExpiry(e.target.checked)}
                          className="w-4 h-4 accent-[#062653]"
                        />
                        <label
                          htmlFor="customExpiryToggle"
                          className="text-xs font-medium text-[#263445] cursor-pointer"
                        >
                          Ajuster manuellement la date d&apos;expiration (optionnel)
                        </label>
                      </div>

                      {useCustomExpiry && (
                        <input
                          type="date"
                          value={customExpiryDate}
                          onChange={(e) => setCustomExpiryDate(e.target.value)}
                          className="h-9 px-3 text-xs bg-white border border-[#DCE2EA] rounded-lg"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DCE2EA]">
                      <button
                        type="button"
                        disabled={processingRenewal}
                        onClick={() => setRenewOrg(null)}
                        className="px-4 py-2 text-xs font-semibold text-[#64748B] border border-[#DCE2EA] hover:text-[#062653] bg-white rounded-lg cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        disabled={processingRenewal}
                        onClick={handleConfirmApproveRenewal}
                        className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {processingRenewal
                            ? "Validation..."
                            : `Confirmer (+${durationMonths} mois${
                                selectedPlan
                                  ? ` • ${formatMoney(selectedPlan.price, selectedPlan.currency)}`
                                  : ""
                              })`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: HISTORIQUE DE TOUS LES RENOUVELLEMENTS */}
      <Modal
        isOpen={Boolean(historyOrg)}
        onClose={() => setHistoryOrg(null)}
        title={`Historique des renouvellements — ${historyOrg?.name || ""}`}
        maxWidth="4xl"
      >
        {historyOrg && (
          <div className="space-y-4">
            {loadingHistory ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Chargement de l'historique...
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 bg-white rounded-xl border border-[#DCE2EA]">
                Aucun renouvellement ni soumission de paiement enregistré pour cette entreprise.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#DCE2EA] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F6F9] text-[10px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                    <tr>
                      <th className="px-4 py-3">Soumission</th>
                      <th className="px-4 py-3">Durée & Montant</th>
                      <th className="px-4 py-3">Mode & Référence</th>
                      <th className="px-4 py-3">Période validée</th>
                      <th className="px-4 py-3">Statut / Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE2EA]">
                    {historyItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#062653]">
                            {formatFrDate(item.createdAt)}
                          </div>
                          {item.submittedByName && (
                            <div className="text-[10px] text-[#64748B]">
                              Par {item.submittedByName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#062653]">
                            {item.durationMonths} mois
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            {formatMoney(item.amountExpected, item.currency)}
                          </div>
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          <div className="font-semibold text-[#263445]">
                            {item.paymentMethod}
                          </div>
                          {item.paymentReference && (
                            <div className="font-mono text-[11px] text-[#64748B]">
                              Réf : {item.paymentReference}
                            </div>
                          )}
                          {item.payerCompanyName && (
                            <div className="text-[10px] text-[#64748B]">
                              Entreprise : {item.payerCompanyName}
                            </div>
                          )}
                          {item.proofDataUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setProofPreview({
                                  url: item.proofDataUrl!,
                                  name: item.proofFileName,
                                  title: `Preuve — ${historyOrg.name}`,
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF7900] hover:underline cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Voir preuve</span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#263445]">
                          {item.periodStart && item.periodEnd ? (
                            <span>
                              {formatFrDate(item.periodStart)} →{" "}
                              <strong>{formatFrDate(item.periodEnd)}</strong>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.status === "APPROVED" ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Validé
                              </span>
                              {item.reviewedAt && (
                                <div className="text-[10px] text-[#64748B] mt-0.5">
                                  Le {formatFrDate(item.reviewedAt)}
                                </div>
                              )}
                            </div>
                          ) : item.status === "REJECTED" ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                Refusé
                              </span>
                              {item.rejectionReason && (
                                <div className="text-[10px] text-rose-700 mt-0.5 max-w-xs whitespace-normal">
                                  {item.rejectionReason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF7900]" />
                              En attente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL 3: CONFIRMATION ARRET / REACTIVATION DE SERVICE */}
      <Modal
        isOpen={Boolean(serviceModalOrg)}
        onClose={() => {
          if (!togglingService) setServiceModalOrg(null);
        }}
        title={
          serviceModalOrg?.subscriptionState?.serviceStopped
            ? "Réactiver le service"
            : "Arrêter le service de l'entreprise"
        }
        maxWidth="xl"
      >
        {serviceModalOrg && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white border border-[#DCE2EA] text-xs space-y-2 text-[#263445]">
              <div
                className={`font-bold flex items-center gap-2 ${
                  serviceModalOrg.subscriptionState?.serviceStopped
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{serviceModalOrg.name}</span>
              </div>
              {serviceModalOrg.subscriptionState?.serviceStopped ? (
                serviceModalOrg.subscriptionState?.isExpired ? (
                  <p>
                    L'abonnement de cette entreprise est expiré. Utilisez le bouton « Réactiver / Renouveler » pour accorder une nouvelle durée avant de rétablir l'accès.
                  </p>
                ) : (
                  <p>
                    En réactivant le service, tous les utilisateurs de cette entreprise pourront de nouveau se connecter à leur espace.
                  </p>
                )
              ) : (
                <p>
                  Tous les utilisateurs actuellement connectés de cette entreprise seront{" "}
                  <strong>immédiatement déconnectés</strong>. À la reconnexion, l'administrateur verra votre message et les comptes de paiement ; les employés verront uniquement « Veuillez contacter votre administrateur pour cet arrêt de service. »
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={togglingService}
                onClick={() => setServiceModalOrg(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  togglingService ||
                  Boolean(
                    serviceModalOrg.subscriptionState?.serviceStopped &&
                      serviceModalOrg.subscriptionState?.isExpired
                  )
                }
                onClick={handleConfirmServiceToggle}
                className={`px-4 py-2 text-xs font-bold text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                  serviceModalOrg.subscriptionState?.serviceStopped
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {togglingService
                  ? "Application..."
                  : serviceModalOrg.subscriptionState?.serviceStopped
                  ? "Confirmer la réactivation"
                  : "Confirmer l'arrêt du service"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ProofPreviewModal
        isOpen={Boolean(proofPreview)}
        onClose={() => setProofPreview(null)}
        proofDataUrl={proofPreview?.url}
        proofFileName={proofPreview?.name}
        title={proofPreview?.title || "Preuve de paiement"}
      />
    </div>
  );
}
