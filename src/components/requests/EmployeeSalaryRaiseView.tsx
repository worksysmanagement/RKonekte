"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Building,
  Briefcase,
  FileText,
  DollarSign,
  RefreshCw,
  Plus,
} from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";

interface EmployeeProfile {
  id?: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: string;
  position: string;
  branch: string;
  phone?: string;
  email: string;
}

export interface SalaryRaiseRequest {
  id: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  branch: string;
  currentSalary: string;
  requestedSalary: string;
  currency: string;
  reason: string;
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decidedBy?: string;
  decisionComment?: string;
}

const STORAGE_KEY = "rkonekte_salary_raise_requests";
const PROFILE_STORAGE_KEY = "rkonekte_cached_employee_profile";

function getCachedProfile(): EmployeeProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function EmployeeSalaryRaiseView() {
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [profile, setProfile] = useState<EmployeeProfile | null>(() => getCachedProfile());
  const [myRequests, setMyRequests] = useState<SalaryRaiseRequest[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(() => !getCachedProfile());

  // Form State
  const [currentSalary, setCurrentSalary] = useState("");
  const [requestedSalary, setRequestedSalary] = useState("");
  const [currency, setCurrency] = useState("HTG");
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // Load employee profile & listen for profile updates
  useEffect(() => {
    fetch("/api/admin/my-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.profile) {
          setProfile(data.profile);
          try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data.profile));
          } catch (_) {}
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    const handleProfileUpdate = (e: any) => {
      const p = e.detail || getCachedProfile();
      if (p) setProfile(p);
    };

    window.addEventListener("rkonekte_profile_updated", handleProfileUpdate);
    window.addEventListener("storage", handleProfileUpdate);
    return () => {
      window.removeEventListener("rkonekte_profile_updated", handleProfileUpdate);
      window.removeEventListener("storage", handleProfileUpdate);
    };
  }, []);

  // Load requests from localStorage
  const loadRequests = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: SalaryRaiseRequest[] = JSON.parse(saved);
        // Filter requests belonging to this employee
        const myItems = profile?.employeeNumber
          ? parsed.filter((r) => r.employeeNumber === profile.employeeNumber)
          : parsed;
        setMyRequests(myItems);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const isFormValid = Boolean(
    currentSalary.trim() &&
    requestedSalary.trim() &&
    currency.trim() &&
    reason.trim()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentSalary.trim()) {
      showSystemToast("Veuillez renseigner votre salaire actuel estimé.", "error");
      return;
    }

    if (!requestedSalary.trim()) {
      showSystemToast("Veuillez renseigner le salaire souhaité.", "error");
      return;
    }

    if (!reason.trim()) {
      showSystemToast("Veuillez fournir un motif ou une justification pour votre demande.", "error");
      return;
    }

    setSubmitting(true);

    try {
      const existingStr = localStorage.getItem(STORAGE_KEY);
      const allRequests: SalaryRaiseRequest[] = existingStr ? JSON.parse(existingStr) : [];

      const newReq: SalaryRaiseRequest = {
        id: `AUG-2026-${String(allRequests.length + 1).padStart(3, "0")}`,
        employeeName: profile ? `${profile.firstName} ${profile.lastName}` : "Collaborateur",
        employeeNumber: profile?.employeeNumber || "COLLAB",
        department: profile?.department || "Non renseigné",
        branch: profile?.branch || "",
        currentSalary: currentSalary || "Non spécifié",
        requestedSalary,
        currency,
        reason,
        submittedAt: new Date().toISOString().split("T")[0],
        status: "PENDING",
      };

      const updated = [newReq, ...allRequests];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      showSystemToast(`Votre demande d'augmentation (Réf: ${newReq.id}) a été transmise à la Direction.`);
      setRequestedSalary("");
      setCurrentSalary("");
      setReason("");
      loadRequests();
      setActiveTab("history");
    } catch (err) {
      showSystemToast("Erreur lors de l'enregistrement de la demande.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Approuvée par la Direction
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            Refusée
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900]">
            <Clock className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
            En attente de décision
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Collaborateur */}
      <div className="bg-white rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Demande d'augmentation
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Formulez votre demande d'ajustement salarial en toute confidentialité auprès de la Direction.
          </p>
        </div>

        {/* Informations fixes pré-remplies (sans background, texte en gras) */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#062653]">
          <div className="flex items-center gap-1.5">
            <span>Matricule :</span>
            {profile?.employeeNumber ? (
              <strong className="text-[#FF7900] font-mono font-bold">
                {profile.employeeNumber}
              </strong>
            ) : (
              <span className="inline-block w-24 h-3.5 bg-slate-200 animate-pulse rounded-sm" />
            )}
          </div>
          <span className="text-slate-300 font-normal">|</span>
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            {profile?.branch ? (
              <span>{profile.branch}</span>
            ) : (
              <span className="inline-block w-20 h-3.5 bg-slate-200 animate-pulse rounded-sm" />
            )}
          </div>
          <span className="text-slate-300 font-normal">|</span>
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-500" />
            {profile?.position ? (
              <span>{profile.position}</span>
            ) : (
              <span>Employé</span>
            )}
          </div>
        </div>
      </div>

      {/* Onglets Faciles */}
      <div className="flex items-center gap-2 pb-1">
        <button
          onClick={() => setActiveTab("form")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "form"
              ? "bg-[#062653] text-white shadow-xs"
              : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653] hover:bg-slate-200/70"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle demande</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("history");
            loadRequests();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === "history"
              ? "bg-[#062653] text-white shadow-xs"
              : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653] hover:bg-slate-200/70"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="8" fill="#F59E0B" />
            <path d="M8 4V8.2L10.8 9.8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Mes demandes</span>
          {myRequests.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "history"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {myRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* FORMULAIRE DIRECT */}
      {activeTab === "form" && (
        <div className="bg-white rounded-2xl shadow-xs p-6 md:p-8 animate-in fade-in">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#062653]">
              Formuler ma demande d'augmentation
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Précisez le montant souhaité ainsi que vos arguments clés (responsabilités, résultats, ancienneté).
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#062653] mb-1">
                  Salaire actuel estimé *
                </label>
                <input
                  type="text"
                  value={currentSalary}
                  onChange={(e) => setCurrentSalary(e.target.value)}
                  placeholder="Ex: 50,000"
                  required
                  className="w-full px-3.5 py-2.5 bg-[#F4F6F9] rounded-xl text-xs text-[#062653] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062653] mb-1">
                  Nouveau salaire sollicité *
                </label>
                <input
                  type="text"
                  value={requestedSalary}
                  onChange={(e) => setRequestedSalary(e.target.value)}
                  placeholder="Ex: 65,000"
                  className="w-full px-3.5 py-2.5 bg-[#F4F6F9] rounded-xl text-xs text-[#062653] font-bold outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062653] mb-1">
                  Devise monétaire *
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F4F6F9] rounded-xl text-xs text-[#062653] font-bold outline-hidden"
                >
                  <option value="HTG">HTG (Gourde Haïtienne)</option>
                  <option value="USD">USD (Dollar US)</option>
                </select>
              </div>
            </div>

            {/* Motif / Argumentaire */}
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Justification & Argumentaire de la demande *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Décrivez vos accomplissements récents, vos nouvelles responsabilités ou les raisons motivant cette revalorisation..."
                className="w-full px-3.5 py-2.5 bg-[#F4F6F9] rounded-xl text-xs text-[#062653] outline-hidden"
                required
              />
            </div>

            {/* Bouton de Soumission Vert Émeraude */}
            <div className="pt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Envoi en cours...</span>
                  </>
                ) : (
                  <span>Soumettre ma demande d'augmentation</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HISTORIQUE PERSONNEL */}
      {activeTab === "history" && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#062653]">
              Mes demandes d'augmentation de salaire
            </h2>
            <button
              onClick={loadRequests}
              className="text-xs text-[#64748B] hover:text-[#062653] flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualiser</span>
            </button>
          </div>

          {myRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#062653]">Aucune demande d'augmentation</h3>
              <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                Vous n'avez soumis aucune demande de revalorisation salariale pour le moment.
              </p>
              <button
                onClick={() => setActiveTab("form")}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                Faire une demande
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myRequests.map((req, idx) => (
                <div
                  key={`${req.id}-${idx}`}
                  className="bg-white p-5 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#062653] bg-slate-100 px-2 py-0.5 rounded-md">
                        {req.id}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        {req.requestedSalary} {req.currency}
                      </span>
                      {req.currentSalary && req.currentSalary !== "Non spécifié" && (
                        <span className="text-xs text-[#64748B]">
                          (Actuel : {req.currentSalary} {req.currency})
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 bg-[#F4F6F9] p-3 rounded-xl">
                      <strong>Argumentaire :</strong> {req.reason}
                    </p>

                    {req.status === "APPROVED" && (
                      <div className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg">
                        🎉 Félicitations ! Votre demande a été validée par la Direction ({req.decidedBy || "Direction Générale"}).
                      </div>
                    )}

                    {req.status === "REJECTED" && (
                      <div className="text-xs text-rose-800 bg-rose-50 p-2.5 rounded-lg">
                        Votre demande n'a pas été retenue pour cette période.
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center md:flex-col md:items-end gap-2">
                    {getStatusBadge(req.status)}
                    <span className="text-[11px] text-[#64748B]">
                      Soumis le {req.submittedAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
