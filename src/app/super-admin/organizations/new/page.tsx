"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
} from "lucide-react";
import { PhoneCountryInput } from "@/components/ui/PhoneCountryInput";

const EMPLOYEE_RANGES = [
  "1 à 5 employés",
  "6 à 20 employés",
  "21 à 50 employés",
  "51 à 100 employés",
  "101 à 250 employés",
  "Plus de 250 employés",
];

const ROLES = [
  "PDG",
  "Directeur Général",
  "Administrateur",
];

export default function NewOrganizationPage() {
  const [formData, setFormData] = useState({
    companyName: "",
    companyEmail: "",
    phone: "",
    address: "",
    employeeRange: "6 à 20 employés",
    applicantName: "",
    applicantRole: "PDG",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    organizationId: string;
    companyName: string;
    companyEmail: string;
    activationUrl?: string;
    emailSent?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCopyLink = async () => {
    if (!successData?.activationUrl) return;
    try {
      await navigator.clipboard.writeText(successData.activationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !formData.companyName.trim() ||
      !formData.companyEmail.trim() ||
      !formData.phone.trim() ||
      !formData.address.trim() ||
      !formData.employeeRange.trim() ||
      !formData.applicantName.trim() ||
      !formData.applicantRole.trim()
    ) {
      setError("Veuillez renseigner tous les champs obligatoires du formulaire.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/super-admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible d'enregistrer l'entreprise.");
        return;
      }

      setSuccessData({
        organizationId: data.organizationId,
        companyName: formData.companyName,
        companyEmail: formData.companyEmail,
        activationUrl: data.activationUrl,
        emailSent: data.emailSent,
      });
    } catch (err) {
      setError("Erreur réseau lors de l'enregistrement de l'entreprise.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/super-admin/organizations"
            className="text-xs font-semibold text-[#64748B] hover:text-[#062653] inline-flex items-center gap-1.5 mb-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux entreprises
          </Link>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Ajouter une entreprise
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Enregistrez une nouvelle entreprise cliente. Un e-mail direct contenant le document de synthèse (tarifs, objectifs, conditions) et le lien d'activation sécurisé lui sera immédiatement transmis.
          </p>
        </div>
      </div>

      {/* ERROR ALERT */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-sm font-medium flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SUCCESS BANNER */}
      {successData && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 sm:p-7 space-y-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-emerald-950">
                Entreprise enregistrée avec succès !
              </h3>
              <p className="text-sm text-emerald-800">
                L'espace de <strong>{successData.companyName}</strong> a été créé. Un e-mail contenant le <strong>document de synthèse officiel</strong> et le lien pour confirmer l'acceptation et définir le mot de passe a été envoyé à <strong>{successData.companyEmail}</strong>.
              </p>
            </div>
          </div>

          {successData.activationUrl && (
            <div className="bg-white rounded-xl p-4 border border-emerald-200/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Lien d'activation sécurisé (copiable en cas de besoin) :
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {successData.emailSent ? "Email envoyé avec succès" : "Envoi email en attente"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={successData.activationUrl}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 select-all outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? "Copié !" : "Copier"}</span>
                </button>
                <a
                  href={successData.activationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ouvrir</span>
                </a>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/super-admin/organizations"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              <span>Voir la liste des entreprises</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setSuccessData(null);
                setFormData({
                  companyName: "",
                  companyEmail: "",
                  phone: "",
                  address: "",
                  employeeRange: "6 à 20 employés",
                  applicantName: "",
                  applicantRole: "PDG",
                });
              }}
              className="px-5 py-2.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Ajouter une autre entreprise
            </button>
          </div>
        </div>
      )}

      {/* FORM: Full width and identical structure to Photo 2 */}
      {!successData && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xs p-6 sm:p-8 space-y-6 w-full"
        >
          {/* Section 1: Informations de l'Entreprise */}
          <div>
            <h3 className="text-sm font-bold text-[#FF7900] uppercase tracking-wider mb-3">
              1. Informations de l'entreprise
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nom de l'entreprise */}
              <div className="sm:col-span-2">
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Nom de l'entreprise <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyName"
                  required
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Ex: Carib Tech Solutions S.A."
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors border border-transparent focus:border-slate-300"
                />
              </div>

              {/* Email de l'entreprise */}
              <div>
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Email de l'entreprise <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  name="companyEmail"
                  required
                  value={formData.companyEmail}
                  onChange={handleChange}
                  placeholder="contact@entreprise.com"
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors border border-transparent focus:border-slate-300"
                />
                <span className="text-[11px] text-slate-500 mt-1 block leading-tight italic">
                  Un email direct sera envoyé à cette adresse pour valider l'enregistrement.
                </span>
              </div>

              {/* Numéro de téléphone avec sélecteur de pays */}
              <div>
                <PhoneCountryInput
                  label="Numéro de téléphone *"
                  value={formData.phone}
                  onChange={(val: string) =>
                    setFormData((prev) => ({ ...prev, phone: val }))
                  }
                  required
                />
              </div>

              {/* Adresse physique */}
              <div>
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Adresse physique <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="address"
                  required
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Ex: 14, Rue Panaméricaine, Pétion-Ville"
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors border border-transparent focus:border-slate-300"
                />
              </div>

              {/* Nombre d'employés */}
              <div>
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Nombre d'employés (Intervalle) <span className="text-rose-500">*</span>
                </label>
                <select
                  name="employeeRange"
                  required
                  value={formData.employeeRange}
                  onChange={handleChange}
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-semibold text-[#263445] focus:bg-white outline-none transition-colors cursor-pointer border border-transparent focus:border-slate-300"
                >
                  {EMPLOYEE_RANGES.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Responsable de l'enregistrement */}
          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-sm font-bold text-[#FF7900] uppercase tracking-wider mb-3">
              2. Responsable de l'enregistrement
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nom et prénom */}
              <div>
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Nom et prénom du déclarant <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="applicantName"
                  required
                  value={formData.applicantName}
                  onChange={handleChange}
                  placeholder="Ex: Piton Rodjensky Emmanuel"
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors border border-transparent focus:border-slate-300"
                />
              </div>

              {/* Rôle dans l'entreprise */}
              <div>
                <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                  Rôle dans l'entreprise <span className="text-rose-500">*</span>
                </label>
                <select
                  name="applicantRole"
                  required
                  value={formData.applicantRole}
                  onChange={handleChange}
                  className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-semibold text-[#263445] focus:bg-white outline-none transition-colors cursor-pointer border border-transparent focus:border-slate-300"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Ce compte bénéficiera de tous les droits et accès d'administrateur dans le système.
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-6 pb-1 border-t border-slate-100 flex items-center justify-between gap-4">
            <Link
              href="/super-admin/organizations"
              className="text-sm font-semibold text-[#64748B] hover:text-[#062653] transition-colors"
            >
              Retour aux entreprises
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="px-9 h-12 bg-[#FF7900] hover:bg-[#E66D00] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#FF7900]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Créer l'entreprise & envoyer l'accès</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
