"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, Send, MapPin } from "lucide-react";

const CATEGORY_OPTIONS = [
  "Expérience de livraison",
  "Accueil et service client",
  "Temps d'attente",
  "Personnel",
  "Autre",
] as const;

interface PublicFeedbackFormProps {
  token: string;
  organizationName: string;
  branchName: string;
}

export function PublicFeedbackForm({
  token,
  organizationName,
  branchName,
}: PublicFeedbackFormProps) {
  const [customerName, setCustomerName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState(""); // Anti-spam honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanComment = comment.trim();
    if (cleanComment.length < 3) {
      setError("Veuillez saisir un commentaire d'au moins 3 caractères.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/public/avis/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim() || null,
          category: category || null,
          comment: cleanComment,
          website,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(
          data?.error ||
            "Impossible d'enregistrer votre avis pour le moment. Veuillez réessayer."
        );
        return;
      }

      setSubmitted(true);
    } catch (_) {
      setError("Erreur de connexion avec le serveur. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900">
            Avis enregistré avec succès
          </h3>
          <p className="text-sm text-[#263445] leading-relaxed">
            Merci d'avoir partagé votre expérience avec{" "}
            <strong className="text-slate-900">{organizationName}</strong>. Votre avis nous
            aide à améliorer continuellement nos services.
          </p>
        </div>

        <div className="pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            <span>Succursale : <strong className="text-slate-900">{branchName}</strong></span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Honeypot anti-spam caché aux utilisateurs réels */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="hp-website">Site web</label>
        <input
          id="hp-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Nom du client (facultatif) */}
      <div>
        <label
          htmlFor="customer-name"
          className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
        >
          Votre nom{" "}
          <span className="text-[#64748B] font-normal normal-case">(Facultatif)</span>
        </label>
        <input
          id="customer-name"
          type="text"
          maxLength={100}
          placeholder="Laissez vide pour rester anonyme"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 rounded-xl text-sm text-[#263445] placeholder:text-slate-400 transition-all"
        />
      </div>

      {/* 2. Catégorie de l'expérience (facultatif) */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Catégorie de votre expérience{" "}
          <span className="text-[#64748B] font-normal normal-case">(Facultatif)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = category === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(isSelected ? "" : option)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer touch-manipulation ${
                  isSelected
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-[#263445] border-[#DCE2EA] hover:bg-slate-50"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Commentaire (obligatoire) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="customer-comment"
            className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
          >
            Votre commentaire <span className="text-rose-500">*</span>
          </label>
          <span className="text-[11px] text-[#64748B]">
            {comment.length} / 2000
          </span>
        </div>
        <textarea
          id="customer-comment"
          required
          rows={5}
          maxLength={2000}
          placeholder="Décrivez votre expérience ou vos suggestions d'amélioration..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full p-3.5 bg-white border border-[#DCE2EA] focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 rounded-xl text-sm text-[#263445] placeholder:text-slate-400 transition-all resize-y"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || comment.trim().length < 3}
        className="w-full h-12 px-5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4 text-white" />
        <span>{submitting ? "Envoi en cours..." : "Envoyer mon avis"}</span>
      </button>
    </form>
  );
}
