"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  Eye,
  Filter,
  Info,
  Loader2,
  Mail,
  Megaphone,
  Radio,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  adminEmail?: string | null;
  adminName?: string | null;
  status: "ACTIVE" | "DISABLED";
  subscriptionState?: {
    isTrial?: boolean;
    isExpired?: boolean;
    serviceStopped?: boolean;
    isAccessBlocked?: boolean;
    badgeLabel?: string;
  };
}

interface SendResultItem {
  email: string;
  companyName: string;
  recipientType: string;
  success: boolean;
  error?: string;
}

const MESSAGE_TEMPLATES = [
  {
    label: "Mise à jour & Maintenance",
    subject: "Maintenance programmée de la plateforme RKonekte",
    titleHeader: "Intervention technique planifiée",
    message: `Chers clients,\n\nUne opération de maintenance et d'amélioration des performances de la plateforme RKonekte aura lieu ce dimanche entre 02h00 et 04h00 du matin (heure locale).\n\nDurant cet intervalle, une courte interruption de service de quelques minutes pourra survenir. Toutes vos données restent intégralement sauvegardées et sécurisées.\n\nNous vous remercions pour votre confiance et restons à votre entière disposition pour tout renseignement.`,
    ctaLabel: "Accéder à RKonekte",
    ctaUrl: "https://app.rkonekte.com/login",
  },
  {
    label: "Rappel Abonnement",
    subject: "Information importante concernant le suivi de votre abonnement",
    titleHeader: "Continuité de votre service RKonekte",
    message: `Bonjour,\n\nNous vous rappelons que vous pouvez à tout moment consulter l'état de votre période d'accès et renouveler votre abonnement depuis votre espace administrateur dans l'onglet « Configuration » > « Abonnement & Paiement ».\n\nPour rappel, tout renouvellement anticipé s'ajoute directement à la suite de votre échéance actuelle, vous ne perdez aucun jour restant.\n\nNos équipes restent mobilisées pour vous accompagner au quotidien.`,
    ctaLabel: "Voir mon abonnement",
    ctaUrl: "https://app.rkonekte.com/login",
  },
  {
    label: "Nouvelles Fonctionnalités",
    subject: "Découvrez les nouvelles fonctionnalités sur RKonekte",
    titleHeader: "Évolution de vos outils de gestion",
    message: `Bonjour,\n\nDe nouvelles fonctionnalités viennent d'être déployées sur votre plateforme RKonekte pour simplifier davantage votre gestion quotidienne :\n\n• Saisie et suivi de caisse optimisés en temps réel.\n• Génération rapide des attestations et formulaires officiels A4 scellés.\n• Notifications automatiques des revalorisations salariales.\n\nConnectez-vous dès à présent à votre tableau de bord pour découvrir ces nouveautés.`,
    ctaLabel: "Découvrir les nouveautés",
    ctaUrl: "https://app.rkonekte.com/login",
  },
];

function SuperAdminBroadcastContent() {
  const searchParams = useSearchParams();
  const preselectedOrgId = searchParams.get("orgId");

  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Target config
  const [targetMode, setTargetMode] = useState<"ALL" | "SELECTED">(
    preselectedOrgId ? "SELECTED" : "ALL"
  );
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>(
    preselectedOrgId ? [preselectedOrgId] : []
  );
  const [recipientTarget, setRecipientTarget] = useState<"BOTH" | "ADMIN_ONLY" | "COMPANY_ONLY">("BOTH");

  // Filter & Search inside organization selection
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "TRIAL" | "EXPIRED">("ALL");

  // Message fields
  const [subject, setSubject] = useState("");
  const [titleHeader, setTitleHeader] = useState("");
  const [message, setMessage] = useState("");
  const [hasCta, setHasCta] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("Accéder à mon espace");
  const [ctaUrl, setCtaUrl] = useState("https://app.rkonekte.com/login");

  // Modals & execution state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<{
    totalSent: number;
    totalFailed: number;
    results: SendResultItem[];
  } | null>(null);

  // Load organizations
  useEffect(() => {
    async function load() {
      setLoadingOrgs(true);
      try {
        const res = await fetch("/api/super-admin/organizations", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.organizations)) {
            setOrganizations(json.organizations);
            if (preselectedOrgId && !selectedOrgIds.includes(preselectedOrgId)) {
              setSelectedOrgIds([preselectedOrgId]);
              setTargetMode("SELECTED");
            }
          }
        }
      } catch (err) {
        console.error("Failed to load organizations:", err);
        showSystemToast("Erreur lors du chargement des entreprises.", "error");
      } finally {
        setLoadingOrgs(false);
      }
    }
    load();
  }, [preselectedOrgId]);

  // Filtered orgs for manual selection
  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch =
        !searchQuery.trim() ||
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (org.adminEmail && org.adminEmail.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (org.email && org.email.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter === "ACTIVE") return org.status === "ACTIVE";
      if (statusFilter === "TRIAL") return org.subscriptionState?.isTrial === true;
      if (statusFilter === "EXPIRED")
        return (
          org.subscriptionState?.isExpired === true ||
          org.subscriptionState?.serviceStopped === true
        );

      return true;
    });
  }, [organizations, searchQuery, statusFilter]);

  // Target orgs count
  const targetedOrganizations = useMemo(() => {
    if (targetMode === "ALL") return organizations;
    return organizations.filter((o) => selectedOrgIds.includes(o.id));
  }, [targetMode, organizations, selectedOrgIds]);

  // Calculated recipients count
  const estimatedRecipients = useMemo(() => {
    let count = 0;
    for (const org of targetedOrganizations) {
      const emails = new Set<string>();
      if (recipientTarget === "ADMIN_ONLY" || recipientTarget === "BOTH") {
        if (org.adminEmail?.trim()) emails.add(org.adminEmail.trim().toLowerCase());
      }
      if (recipientTarget === "COMPANY_ONLY" || recipientTarget === "BOTH") {
        if (org.email?.trim()) emails.add(org.email.trim().toLowerCase());
      }
      count += emails.size;
    }
    return count;
  }, [targetedOrganizations, recipientTarget]);

  const handleSelectAllFiltered = () => {
    const idsToAdd = filteredOrgs.map((o) => o.id);
    setSelectedOrgIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleDeselectAllFiltered = () => {
    const idsToRemove = new Set(filteredOrgs.map((o) => o.id));
    setSelectedOrgIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
  };

  const toggleOrgSelection = (id: string) => {
    setSelectedOrgIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyTemplate = (tpl: (typeof MESSAGE_TEMPLATES)[0]) => {
    setSubject(tpl.subject);
    setTitleHeader(tpl.titleHeader);
    setMessage(tpl.message);
    if (tpl.ctaLabel && tpl.ctaUrl) {
      setHasCta(true);
      setCtaLabel(tpl.ctaLabel);
      setCtaUrl(tpl.ctaUrl);
    } else {
      setHasCta(false);
    }
    showSystemToast(`Modèle « ${tpl.label} » appliqué.`);
  };

  const handleSendBroadcast = async () => {
    setShowConfirmModal(false);
    setSending(true);
    setSendReport(null);

    try {
      const res = await fetch("/api/super-admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: targetMode,
          selectedOrganizationIds: targetMode === "SELECTED" ? selectedOrgIds : undefined,
          recipientTarget,
          subject: subject.trim(),
          titleHeader: titleHeader.trim() || undefined,
          message: message.trim(),
          ctaLabel: hasCta && ctaLabel.trim() ? ctaLabel.trim() : undefined,
          ctaUrl: hasCta && ctaUrl.trim() ? ctaUrl.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors de l'envoi de l'e-mail.", "error");
        return;
      }

      setSendReport({
        totalSent: json.totalSent || 0,
        totalFailed: json.totalFailed || 0,
        results: json.results || [],
      });

      if (json.totalFailed === 0) {
        showSystemToast(`Message diffusé avec succès à ${json.totalSent} destinataire(s) !`);
      } else {
        showSystemToast(
          `${json.totalSent} e-mail(s) envoyé(s), ${json.totalFailed} échec(s).`,
          "info"
        );
      }
    } catch (_) {
      showSystemToast("Erreur réseau lors de la diffusion.", "error");
    } finally {
      setSending(false);
    }
  };

  const isFormValid =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    (targetMode === "ALL" || selectedOrgIds.length > 0) &&
    estimatedRecipients > 0;

  return (
    <div className="space-y-6 w-full pb-16">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/super-admin/organizations"
            className="text-xs font-semibold text-[#64748B] hover:text-[#062653] inline-flex items-center gap-1 mb-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux entreprises
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#062653] text-[#FF7900] flex items-center justify-center shadow-xs">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                Communication &amp; Diffusion E-mail
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Envoyez des messages automatiques à toutes les entreprises du système ou désignez des entreprises cibles.
              </p>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Link
            href="/super-admin/organizations"
            className="h-9 px-3.5 bg-white hover:bg-slate-50 text-[#062653] text-xs font-semibold rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5 text-[#FF7900]" />
            <span>Voir les entreprises</span>
          </Link>
        </div>
      </div>

      {/* RESULT BANNER IF SENT */}
      {sendReport && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-fadeIn space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                Diffusion terminée : {sendReport.totalSent} e-mail(s) envoyé(s) avec succès
                {sendReport.totalFailed > 0 && ` (${sendReport.totalFailed} échec(s))`}.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSendReport(null)}
              className="text-emerald-700 hover:text-emerald-950 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
            {sendReport.results.map((res, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg flex items-center justify-between ${
                  res.success ? "bg-white text-slate-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-[#062653]">{res.companyName}</span>
                  <span className="text-slate-500">({res.email})</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 uppercase font-semibold">
                    {res.recipientType}
                  </span>
                </div>
                <div>
                  {res.success ? (
                    <span className="text-emerald-600 font-bold text-[11px]">✓ Envoyé</span>
                  ) : (
                    <span className="text-rose-600 font-bold text-[11px]">
                      ✗ Échec : {res.error || "Erreur"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: FORM & TARGETING (7 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECTION 1: CIBLAGE DES ENTREPRISES */}
          <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#062653]">
                <Users className="w-4 h-4 text-[#FF7900]" />
                <span>1. Ciblage des Entreprises Destinataires</span>
              </div>
              <span className="text-[11px] font-bold text-[#FF7900] bg-orange-50 px-2 py-0.5 rounded-full">
                {targetedOrganizations.length} entreprise(s) • ~{estimatedRecipients} e-mail(s)
              </span>
            </div>

            {/* Target mode switch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  targetMode === "ALL"
                    ? "bg-blue-50/70 border-[#062653] ring-1 ring-[#062653]"
                    : "bg-[#F4F6F9] border-slate-200 hover:bg-slate-100/70"
                }`}
              >
                <input
                  type="radio"
                  name="targetMode"
                  value="ALL"
                  checked={targetMode === "ALL"}
                  onChange={() => setTargetMode("ALL")}
                  className="mt-0.5 w-4 h-4 accent-[#062653] cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-[#062653] block">
                    Toutes les entreprises du système
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Diffusion automatique à l'ensemble des {organizations.length} entreprises enregistrées.
                  </span>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  targetMode === "SELECTED"
                    ? "bg-blue-50/70 border-[#062653] ring-1 ring-[#062653]"
                    : "bg-[#F4F6F9] border-slate-200 hover:bg-slate-100/70"
                }`}
              >
                <input
                  type="radio"
                  name="targetMode"
                  value="SELECTED"
                  checked={targetMode === "SELECTED"}
                  onChange={() => setTargetMode("SELECTED")}
                  className="mt-0.5 w-4 h-4 accent-[#062653] cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-[#062653] block">
                    Désigner les entreprises cibles
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Sélection manuelle sur-mesure ({selectedOrgIds.length} sélectionnée(s)).
                  </span>
                </div>
              </label>
            </div>

            {/* Recipient within each company */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-[#263445] mb-2">
                Destinataires au sein de chaque entreprise :
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setRecipientTarget("BOTH")}
                  className={`h-9 px-3 rounded-xl font-semibold transition-all border text-left flex items-center justify-between cursor-pointer ${
                    recipientTarget === "BOTH"
                      ? "bg-[#062653] text-white border-[#062653]"
                      : "bg-[#F4F6F9] text-[#263445] border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>Admin + Contact</span>
                  {recipientTarget === "BOTH" && <span className="text-[#FF7900]">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientTarget("ADMIN_ONLY")}
                  className={`h-9 px-3 rounded-xl font-semibold transition-all border text-left flex items-center justify-between cursor-pointer ${
                    recipientTarget === "ADMIN_ONLY"
                      ? "bg-[#062653] text-white border-[#062653]"
                      : "bg-[#F4F6F9] text-[#263445] border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>Admin principal seul</span>
                  {recipientTarget === "ADMIN_ONLY" && <span className="text-[#FF7900]">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientTarget("COMPANY_ONLY")}
                  className={`h-9 px-3 rounded-xl font-semibold transition-all border text-left flex items-center justify-between cursor-pointer ${
                    recipientTarget === "COMPANY_ONLY"
                      ? "bg-[#062653] text-white border-[#062653]"
                      : "bg-[#F4F6F9] text-[#263445] border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>E-mail entreprise seul</span>
                  {recipientTarget === "COMPANY_ONLY" && <span className="text-[#FF7900]">✓</span>}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                ℹ️ Déduplication automatique : si l'adresse de l'administrateur et celle de l'entreprise sont identiques, un seul message est expédié.
              </p>
            </div>

            {/* MANUAL SELECTOR DRAWER (WHEN TARGET === "SELECTED") */}
            {targetMode === "SELECTED" && (
              <div className="pt-3 border-t border-slate-100 space-y-3 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#062653]">
                    Sélection des entreprises ({selectedOrgIds.length} / {organizations.length}) :
                  </span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#062653] bg-[#F4F6F9] hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Tout cocher ({filteredOrgs.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 bg-[#F4F6F9] hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>

                {/* Search & Status Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrer par nom, email..."
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-xl bg-[#F4F6F9] focus:bg-white text-slate-800 outline-hidden border border-transparent focus:border-slate-300 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStatusFilter("ALL")}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-semibold transition-colors ${
                        statusFilter === "ALL" ? "bg-[#062653] text-white" : "bg-[#F4F6F9] text-slate-600"
                      }`}
                    >
                      Toutes
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("ACTIVE")}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-semibold transition-colors ${
                        statusFilter === "ACTIVE" ? "bg-emerald-600 text-white" : "bg-[#F4F6F9] text-slate-600"
                      }`}
                    >
                      Actives
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("TRIAL")}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-semibold transition-colors ${
                        statusFilter === "TRIAL" ? "bg-amber-500 text-white" : "bg-[#F4F6F9] text-slate-600"
                      }`}
                    >
                      Essai
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("EXPIRED")}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-semibold transition-colors ${
                        statusFilter === "EXPIRED" ? "bg-rose-600 text-white" : "bg-[#F4F6F9] text-slate-600"
                      }`}
                    >
                      Expirées
                    </button>
                  </div>
                </div>

                {/* Scrollable list */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-[#F8FAFC]">
                  {loadingOrgs ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#FF7900] mb-2" />
                      Chargement des entreprises...
                    </div>
                  ) : filteredOrgs.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Aucune entreprise ne correspond à votre filtre.
                    </div>
                  ) : (
                    filteredOrgs.map((org) => {
                      const isSelected = selectedOrgIds.includes(org.id);
                      return (
                        <div
                          key={org.id}
                          onClick={() => toggleOrgSelection(org.id)}
                          className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between select-none ${
                            isSelected
                              ? "bg-white border-[#062653] shadow-xs"
                              : "bg-white/60 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#FF7900] shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-[#062653] truncate block">
                                {org.name}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate block">
                                {org.adminEmail || org.email || "Sans email"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {org.subscriptionState?.isTrial && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
                                Essai
                              </span>
                            )}
                            {org.status === "ACTIVE" ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                                Actif
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700">
                                Coupé
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: RÉDACTION DU MESSAGE */}
          <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#062653]">
                <Mail className="w-4 h-4 text-[#FF7900]" />
                <span>2. Composition du Message</span>
              </div>

              {/* Template pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#FF7900]" /> Modèles :
                </span>
                {MESSAGE_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="px-2 py-0.5 bg-[#F4F6F9] hover:bg-orange-50 hover:text-[#FF7900] text-[11px] font-semibold text-slate-600 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-[#263445] mb-1">
                Objet de l'e-mail <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex : Information importante concernant votre espace RKonekte"
                className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-semibold text-[#062653] outline-hidden border border-transparent focus:border-slate-300 transition-colors"
              />
            </div>

            {/* Internal Title Header */}
            <div>
              <label className="block text-xs font-semibold text-[#263445] mb-1">
                Titre interne du document / annonce{" "}
                <span className="text-slate-400 font-normal">(Optionnel)</span>
              </label>
              <input
                type="text"
                value={titleHeader}
                onChange={(e) => setTitleHeader(e.target.value)}
                placeholder="Ex : Note d'information officielle ou Annonce système"
                className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs text-slate-800 outline-hidden border border-transparent focus:border-slate-300 transition-colors"
              />
            </div>

            {/* Message Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[#263445]">
                  Corps du message <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {message.length} caractères • Sauts de lignes pris en charge
                </span>
              </div>
              <textarea
                required
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Rédigez votre message ici. Vous pouvez sauter des lignes pour créer des paragraphes distincts..."
                className="w-full p-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs text-slate-800 leading-relaxed outline-hidden border border-transparent focus:border-slate-300 transition-colors resize-y"
              />
            </div>

            {/* Optional Call to Action Button */}
            <div className="p-3.5 bg-[#F8FAFC] rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasCta}
                  onChange={(e) => setHasCta(e.target.checked)}
                  className="w-4 h-4 accent-[#062653] cursor-pointer"
                />
                <span className="text-xs font-bold text-[#062653]">
                  Ajouter un bouton d'action dans l'e-mail (Call to Action)
                </span>
              </label>

              {hasCta && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fadeIn">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Libellé du bouton
                    </label>
                    <input
                      type="text"
                      value={ctaLabel}
                      onChange={(e) => setCtaLabel(e.target.value)}
                      placeholder="Ex : Se connecter à mon espace"
                      className="w-full h-8 px-3 bg-white rounded-lg text-xs font-semibold text-[#062653] outline-hidden border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      URL de destination
                    </label>
                    <input
                      type="url"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-8 px-3 bg-white rounded-lg text-xs text-slate-800 outline-hidden border border-slate-200"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {targetedOrganizations.length} entreprise(s) ciblée(s)
              </span>

              <button
                type="button"
                disabled={!isFormValid || sending}
                onClick={() => setShowConfirmModal(true)}
                className="px-6 py-2.5 bg-[#062653] hover:bg-[#031B3A] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#FF7900]" />
                    <span>Diffusion en cours...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-[#FF7900]" />
                    <span>Diffuser le message</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE PREVIEW OF EMAIL (5 COLS) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-xs space-y-3 sticky top-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#062653]">
                <Eye className="w-4 h-4 text-[#FF7900]" />
                <span>Aperçu Réel de l'E-mail</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Branding Officiel RKonekte
              </span>
            </div>

            {/* Email Canvas Preview */}
            <div className="bg-[#F8FAFC] p-3 sm:p-4 rounded-xl border border-slate-200">
              <div className="max-w-[460px] mx-auto bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden text-[#1E293B] text-xs">
                {/* Email Header */}
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center">
                  <span className="text-base font-bold text-[#062653] tracking-tight">
                    RKonekte
                  </span>
                </div>

                {/* Email Body */}
                <div className="p-5 space-y-3">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#FF7900] block">
                      Notification Super-Administration
                    </span>
                    <h3 className="text-sm font-bold text-[#062653] mt-0.5">
                      {titleHeader.trim() || "Communication Officielle RKonekte"}
                    </h3>
                  </div>

                  <p className="text-xs font-semibold text-slate-800">
                    Bonjour Responsable,
                  </p>

                  <div className="text-xs text-slate-600 leading-relaxed space-y-2 whitespace-pre-wrap">
                    {message.trim() ? (
                      message.trim()
                    ) : (
                      <span className="text-slate-400 italic">
                        Le corps de votre message apparaîtra ici avec la mise en page exacte reçue dans la boîte de messagerie des entreprises.
                      </span>
                    )}
                  </div>

                  {hasCta && ctaLabel.trim() && (
                    <div className="py-2 text-center">
                      <div className="inline-block px-5 py-2 bg-[#062653] text-white font-bold text-xs rounded-lg shadow-xs">
                        {ctaLabel}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-snug">
                    Ce message officiel est transmis à l'attention de la direction de{" "}
                    <strong>{targetedOrganizations[0]?.name || "Votre entreprise"}</strong> par l'équipe de supervision RKonekte.
                  </div>
                </div>

                {/* Email Footer */}
                <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400">
                  Message officiel de supervision RKonekte adressé aux organisations clientes.
                </div>
              </div>
            </div>

            {/* Summary card */}
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5 text-xs text-[#062653]">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#062653]" />
                <span>Récapitulatif de l'envoi</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-0.5 list-disc pl-4">
                <li>
                  Mode : <strong>{targetMode === "ALL" ? "Toutes les entreprises" : "Sélection manuelle"}</strong>
                </li>
                <li>
                  Volume : <strong>{targetedOrganizations.length} entreprise(s)</strong> (~{estimatedRecipients} e-mail(s))
                </li>
                <li>
                  Cible : <strong>{recipientTarget === "BOTH" ? "Admin + E-mail officiel" : recipientTarget === "ADMIN_ONLY" ? "Admin principal seul" : "E-mail entreprise seul"}</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmer la diffusion du message"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs text-[#263445]">
          <p className="leading-relaxed">
            Vous vous apprêtez à envoyer cet e-mail à{" "}
            <strong className="text-[#062653]">{targetedOrganizations.length} entreprise(s)</strong>{" "}
            (soit environ <strong className="text-[#062653]">{estimatedRecipients} destinataire(s)</strong> au total).
          </p>

          <div className="p-3 bg-[#F4F6F9] rounded-xl space-y-1">
            <div>
              <span className="text-slate-500 font-medium">Objet :</span>{" "}
              <strong className="text-[#062653]">{subject}</strong>
            </div>
            {titleHeader.trim() && (
              <div>
                <span className="text-slate-500 font-medium">Titre :</span>{" "}
                <span className="font-semibold text-slate-800">{titleHeader}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500 font-medium">Cible :</span>{" "}
              <span>{targetMode === "ALL" ? "Toutes les entreprises du système" : "Entreprises sélectionnées"}</span>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">
              Liste des entreprises concernées :
            </span>
            {targetedOrganizations.map((o) => (
              <div key={o.id} className="text-[11px] text-slate-700 flex justify-between">
                <span className="font-semibold text-[#062653]">{o.name}</span>
                <span className="text-slate-500">{o.adminEmail || o.email}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirmModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSendBroadcast}
              className="px-5 py-2 bg-[#FF7900] hover:bg-[#E66D00] text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Confirmer &amp; Envoyer maintenant</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SuperAdminBroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#FF7900] mb-2" />
          Chargement du module de communication...
        </div>
      }
    >
      <SuperAdminBroadcastContent />
    </Suspense>
  );
}
