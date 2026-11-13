"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PaymentAccountLogo } from "@/components/subscription/PaymentVisuals";
import { showSystemToast } from "@/components/ui/SystemToast";
import {
  computeDiscountedPrice,
  DEFAULT_SUBSCRIPTION_SETTINGS,
  formatMoney,
  PaymentAccountConfig,
  PlatformSubscriptionSettingsData,
} from "@/lib/utils/subscription";

export default function SuperAdminSubscriptionSettingsPage() {
  const [settings, setSettings] = useState<PlatformSubscriptionSettingsData>(
    DEFAULT_SUBSCRIPTION_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/super-admin/subscription-settings", {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          if (json.settings) {
            setSettings(json.settings);
          }
        }
      } catch (err) {
        console.error("Failed to load subscription settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleMonthlyPriceChange = (val: number) => {
    const monthly = Math.max(1, Number(val) || 1);
    setSettings((prev) => ({
      ...prev,
      priceMonthly: monthly,
      priceQuarterly: computeDiscountedPrice(monthly, 3, prev.discountQuarterlyPct),
      priceSemiannual: computeDiscountedPrice(monthly, 6, prev.discountSemiannualPct),
      priceAnnual: computeDiscountedPrice(monthly, 12, prev.discountAnnualPct),
    }));
  };

  const handleDiscountChange = (
    field: "discountQuarterlyPct" | "discountSemiannualPct" | "discountAnnualPct",
    priceField: "priceQuarterly" | "priceSemiannual" | "priceAnnual",
    months: number,
    pctVal: number
  ) => {
    const pct = Math.min(90, Math.max(0, Number(pctVal) || 0));
    setSettings((prev) => ({
      ...prev,
      [field]: pct,
      [priceField]: computeDiscountedPrice(prev.priceMonthly, months, pct),
    }));
  };

  const handleAccountChange = (
    index: number,
    patch: Partial<PaymentAccountConfig>
  ) => {
    setSettings((prev) => ({
      ...prev,
      paymentAccounts: prev.paymentAccounts.map((acc, idx) =>
        idx === index ? { ...acc, ...patch } : acc
      ),
    }));
  };

  const handleAddAccount = () => {
    setSettings((prev) => ({
      ...prev,
      paymentAccounts: [
        ...prev.paymentAccounts,
        {
          id: `acc-${Date.now()}`,
          label: "Nouveau compte",
          accountName: "RKonekte",
          accountNumber: "",
          instructions: "",
          logoUrl: null,
          enabled: true,
        },
      ],
    }));
  };

  const handleAccountLogoUpload = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showSystemToast("Le logo ne doit pas dépasser 1,5 Mo.", "error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        handleAccountChange(index, { logoUrl: result });
        showSystemToast("Logo chargé. Pensez à enregistrer la configuration.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveAccount = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      paymentAccounts: prev.paymentAccounts.filter((_, idx) => idx !== index),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/subscription-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors de l'enregistrement.", "error");
        return;
      }
      if (json.settings) {
        setSettings(json.settings);
      }
      showSystemToast(
        "Tarifs, comptes de paiement et message automatique enregistrés."
      );
    } catch (_) {
      showSystemToast("Erreur réseau lors de la sauvegarde.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        Chargement de la configuration...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 w-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/super-admin/organizations"
            className="text-xs font-semibold text-[#64748B] hover:text-[#062653] inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux entreprises
          </Link>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Tarifs, Durées & Comptes de Paiement
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Définissez les prix par durée, les comptes affichés aux entreprises lors du renouvellement et le message automatique envoyé par e-mail / page de connexion.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-[#FF7900] hover:bg-[#E66D00] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 self-start cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Enregistrement..." : "Enregistrer la configuration"}</span>
        </button>
      </div>

      {/* SECTION 1: ESSAI & DEVISE & ALERTE SUPERADMIN */}
      <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#062653]">
          <Sparkles className="w-4 h-4 text-[#FF7900]" />
          <span>Paramètres généraux & Notifications Super-Admin</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#263445] mb-1">
              Mois gratuit initial (à l'activation)
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={settings.trialMonths}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  trialMonths: Math.max(1, Number(e.target.value) || 1),
                }))
              }
              className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-bold text-[#062653] outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#263445] mb-1">
              Devise d'affichage
            </label>
            <input
              type="text"
              value={settings.currency}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))
              }
              placeholder="USD"
              className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-bold text-[#062653] outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#263445] mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#64748B]" />
              <span>E-mail alerté lors d'un paiement</span>
            </label>
            <input
              type="email"
              value={settings.superAdminAlertEmail}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  superAdminAlertEmail: e.target.value,
                }))
              }
              placeholder="admin@rkonekte.com"
              className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-medium text-[#062653] outline-hidden transition-colors"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: TARIFS & REDUCTIONS */}
      <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#062653]">
              Tarification par durée (1, 3, 6, 12 mois)
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Modifier le tarif mensuel ou le pourcentage recalcule automatiquement le total (ajustable manuellement à tout moment).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1 MOIS */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#062653]">1 mois</span>
              <span className="text-[10px] font-bold text-slate-500">Tarif de base</span>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                Prix ({settings.currency})
              </label>
              <input
                type="number"
                min={1}
                step="0.01"
                value={settings.priceMonthly}
                onChange={(e) => handleMonthlyPriceChange(Number(e.target.value))}
                className="w-full h-10 px-3 bg-white shadow-2xs rounded-lg text-sm font-extrabold text-[#062653] outline-hidden"
              />
            </div>
            <div className="text-[11px] text-[#64748B]">
              Soit {formatMoney(settings.priceMonthly, settings.currency)} / mois
            </div>
          </div>

          {/* 3 MOIS */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#062653]">3 mois</span>
              <span className="text-[11px] font-bold text-emerald-700">
                -{settings.discountQuarterlyPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Remise %
                </label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  step="0.5"
                  value={settings.discountQuarterlyPct}
                  onChange={(e) =>
                    handleDiscountChange(
                      "discountQuarterlyPct",
                      "priceQuarterly",
                      3,
                      Number(e.target.value)
                    )
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-xs font-bold text-[#062653] outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Total ({settings.currency})
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={settings.priceQuarterly}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      priceQuarterly: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-sm font-extrabold text-[#062653] outline-hidden"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#64748B]">
              Base sans remise : {formatMoney(settings.priceMonthly * 3, settings.currency)}
            </div>
          </div>

          {/* 6 MOIS */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#062653]">6 mois</span>
              <span className="text-[11px] font-bold text-emerald-700">
                -{settings.discountSemiannualPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Remise %
                </label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  step="0.5"
                  value={settings.discountSemiannualPct}
                  onChange={(e) =>
                    handleDiscountChange(
                      "discountSemiannualPct",
                      "priceSemiannual",
                      6,
                      Number(e.target.value)
                    )
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-xs font-bold text-[#062653] outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Total ({settings.currency})
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={settings.priceSemiannual}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      priceSemiannual: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-sm font-extrabold text-[#062653] outline-hidden"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#64748B]">
              Base sans remise : {formatMoney(settings.priceMonthly * 6, settings.currency)}
            </div>
          </div>

          {/* 12 MOIS */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#062653]">12 mois (1 an)</span>
              <span className="text-[11px] font-bold text-emerald-700">
                -{settings.discountAnnualPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Remise %
                </label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  step="0.5"
                  value={settings.discountAnnualPct}
                  onChange={(e) =>
                    handleDiscountChange(
                      "discountAnnualPct",
                      "priceAnnual",
                      12,
                      Number(e.target.value)
                    )
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-xs font-bold text-[#062653] outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Total ({settings.currency})
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={settings.priceAnnual}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      priceAnnual: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-10 px-2.5 bg-white shadow-2xs rounded-lg text-sm font-extrabold text-[#062653] outline-hidden"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#64748B]">
              Base sans remise : {formatMoney(settings.priceMonthly * 12, settings.currency)}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: COMPTES DISPONIBLES POUR LE PAIEMENT */}
      <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#062653] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#FF7900]" />
              <span>Comptes disponibles pour le paiement</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Seuls les comptes activés seront affichés dans les e-mails de rappel, la page Abonnement et le panneau de connexion en cas d'arrêt de service.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddAccount}
            className="px-3 py-1.5 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter un compte
          </button>
        </div>

        <div className="space-y-3">
          {settings.paymentAccounts.map((acc, index) => (
            <div
              key={acc.id}
              className={`p-4 rounded-xl space-y-3 ${
                acc.enabled
                  ? "bg-[#F4F6F9]/60"
                  : "bg-slate-100/70 opacity-75"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#062653] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acc.enabled}
                    onChange={(e) =>
                      handleAccountChange(index, { enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#FF7900]"
                  />
                  <span>{acc.enabled ? "Compte visible aux clients" : "Masqué"}</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleRemoveAccount(index)}
                  className="text-xs text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Mode / Plateforme
                  </label>
                  <input
                    type="text"
                    required
                    value={acc.label}
                    onChange={(e) =>
                      handleAccountChange(index, { label: e.target.value })
                    }
                    placeholder="Ex : MonCash, Unibank, Sogebank..."
                    className="w-full h-9 px-3 bg-white shadow-2xs rounded-lg text-xs font-bold text-[#062653] outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Titulaire du compte
                  </label>
                  <input
                    type="text"
                    value={acc.accountName}
                    onChange={(e) =>
                      handleAccountChange(index, { accountName: e.target.value })
                    }
                    placeholder="Ex : RKonekte S.A."
                    className="w-full h-9 px-3 bg-white shadow-2xs rounded-lg text-xs font-medium text-[#062653] outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Numéro de compte / téléphone
                  </label>
                  <input
                    type="text"
                    required
                    value={acc.accountNumber}
                    onChange={(e) =>
                      handleAccountChange(index, { accountNumber: e.target.value })
                    }
                    placeholder="Ex : +509 3700-0000 ou N° compte bancaire"
                    className="w-full h-9 px-3 bg-white shadow-2xs rounded-lg text-xs font-mono font-bold text-[#062653] outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Logo du moyen de paiement
                  </label>
                  <div className="flex items-center gap-2.5">
                    <PaymentAccountLogo account={acc} className="w-14 h-12" />
                    <label className="px-3 h-9 rounded-lg bg-white shadow-2xs hover:bg-slate-100 text-[11px] font-bold text-[#062653] inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors">
                      <Upload className="w-3.5 h-3.5 text-[#FF7900]" />
                      <span>Importer logo</span>
                      <input
                        type="file"
                        accept="image/*,.svg"
                        onChange={(e) => handleAccountLogoUpload(index, e)}
                        className="hidden"
                      />
                    </label>
                    {acc.logoUrl && (
                      <button
                        type="button"
                        onClick={() => handleAccountChange(index, { logoUrl: null })}
                        className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors"
                        title="Retirer le logo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Instructions pour l'entreprise
                  </label>
                  <input
                    type="text"
                    value={acc.instructions}
                    onChange={(e) =>
                      handleAccountChange(index, { instructions: e.target.value })
                    }
                    placeholder="Ex : Effectuez le versement puis importez la preuve de paiement."
                    className="w-full h-9 px-3 bg-white shadow-2xs rounded-lg text-xs text-[#263445] outline-hidden"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: MESSAGE AUTOMATIQUE */}
      <div className="bg-white rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#062653]">
          <MessageSquare className="w-4 h-4 text-[#FF7900]" />
          <span>Message automatique (E-mails de rappel, Espace client & Écran de suspension)</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#263445] mb-1">
              Titre du message
            </label>
            <input
              type="text"
              required
              value={settings.autoMessageTitle}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  autoMessageTitle: e.target.value,
                }))
              }
              className="w-full h-10 px-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-bold text-[#062653] outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#263445] mb-1">
              Corps du message automatique
            </label>
            <textarea
              rows={4}
              required
              value={settings.autoMessageBody}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  autoMessageBody: e.target.value,
                }))
              }
              className="w-full p-3 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs text-[#263445] leading-relaxed outline-hidden transition-colors"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
