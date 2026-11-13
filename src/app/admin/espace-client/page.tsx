"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Heart,
  Info,
  Lock,
  MapPin,
  Maximize2,
  MessageSquare,
  MessageSquareText,
  Power,
  QrCode,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { CustomSelectOption } from "@/components/ui/CustomSelect";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";
import {
  downloadQrPng,
  downloadQrSvg,
  generateQrPreviewDataUrl,
} from "@/lib/utils/qr-code-client";

interface BranchOption {
  id: string;
  name: string;
  city: string;
  status?: string;
}

interface CustomerFeedbackQrItem {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCity: string;
  uniqueToken: string;
  publicUrl: string;
  isActive: boolean;
  feedbackCount: number;
  createdAt: number;
  updatedAt: number;
}

interface CustomerFeedbackItem {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCity: string;
  qrCodeId: string;
  customerName: string | null;
  category: string | null;
  comment: string;
  isFavorite: boolean;
  createdAt: number;
}

interface FeedbackStats {
  totalCount: number;
  currentMonthCount: number;
  favoritesCount: number;
}

interface CustomerSpacePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

const FRENCH_MONTHS: Record<number, string> = {
  1: "Janvier",
  2: "Février",
  3: "Mars",
  4: "Avril",
  5: "Mai",
  6: "Juin",
  7: "Juillet",
  8: "Août",
  9: "Septembre",
  10: "Octobre",
  11: "Novembre",
  12: "Décembre",
};

function formatDateFr(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleDateString("fr-FR");
  }
}

function formatShortDateFr(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleDateString("fr-FR");
  }
}

function formatTimeFr(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function QrCodePreviewImage({
  url,
  alt,
  className = "w-28 h-28",
  resolution = 320,
}: {
  url: string;
  alt: string;
  className?: string;
  resolution?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    generateQrPreviewDataUrl(url, resolution)
      .then((res) => {
        if (!cancelled) setDataUrl(res);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url, resolution]);

  if (!dataUrl) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 flex items-center justify-center animate-pulse`}
      >
        <QrCode className="w-6 h-6 text-slate-300" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={`${className} object-contain rounded-xl bg-white p-1 shadow-2xs`}
    />
  );
}

function MinimalFilterSelect({
  value,
  onChange,
  options,
  placeholder = "Sélectionner",
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full h-10 px-3.5 rounded-xl text-xs font-semibold text-[#263445] transition-colors flex items-center justify-between text-left select-none cursor-pointer ${
          open
            ? "bg-white shadow-xs ring-2 ring-[#062653]/15"
            : "bg-[#F4F6F9] hover:bg-slate-200/70"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate min-w-0 mr-2">
          {icon && <span className="shrink-0">{icon}</span>}
          <span
            className={`truncate ${
              selectedOption ? "text-[#263445]" : "text-slate-400 font-normal"
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-[#062653]" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1.5 w-full z-50 bg-white rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto"
        >
          {options.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-400 text-center">
              Aucune option disponible
            </div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer select-none ${
                    isSelected
                      ? "bg-[#062653] text-white font-bold"
                      : "text-[#263445] hover:bg-slate-50 font-semibold"
                  } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex flex-col truncate mr-2">
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && (
                      <span
                        className={`text-[10px] ${
                          isSelected ? "text-slate-300" : "text-[#64748B]"
                        }`}
                      >
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function QrSlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden no-print">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-fade-in-overlay cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
        <div
          className="w-screen max-w-xl bg-white shadow-2xl flex flex-col h-full pointer-events-auto animate-slide-in-right z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header sans ligne de séparation */}
          <div className="px-6 pt-5 pb-2 flex items-start justify-between bg-white shrink-0">
            <div className="flex items-start gap-3">
              {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
              <div>
                <h3 className="text-base font-bold text-[#062653] tracking-tight">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1 -mt-1 text-slate-400 hover:text-[#062653] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerSpacePage() {
  // Access & Metadata state
  const [accessDenied, setAccessDenied] = useState(false);
  const [permission, setPermission] = useState<CustomerSpacePermission>({
    view: true,
    create: true,
    edit: true,
    delete: true,
  });
  const [organizationName, setOrganizationName] = useState("e-biznis");
  const [branches, setBranches] = useState<BranchOption[]>([]);

  // Section 1: Feedback state (Full page)
  const [feedback, setFeedback] = useState<CustomerFeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats>({
    totalCount: 0,
    currentMonthCount: 0,
    favoritesCount: 0,
  });
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableMonths, setAvailableMonths] = useState<number[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);

  // Filters state
  const [selectedBranchFilter, setSelectedBranchFilter] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedMonth, setSelectedMonth] = useState("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Action states for Section 1
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerFeedbackItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Section 2: QR Codes SlideOver drawer state (sortant latéralement de la droite)
  const [isQrDrawerOpen, setIsQrDrawerOpen] = useState(false);
  const [qrCodes, setQrCodes] = useState<CustomerFeedbackQrItem[]>([]);
  const [loadingQr, setLoadingQr] = useState(true);
  const [selectedBranchForQr, setSelectedBranchForQr] = useState("");
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [togglingQrId, setTogglingQrId] = useState<string | null>(null);
  const [copiedQrId, setCopiedQrId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [zoomedQr, setZoomedQr] = useState<CustomerFeedbackQrItem | null>(null);
  const [deleteQrTarget, setDeleteQrTarget] = useState<CustomerFeedbackQrItem | null>(null);
  const [isDeletingQr, setIsDeletingQr] = useState(false);

  // Reset selectedMonth if selected year no longer contains it
  useEffect(() => {
    if (
      selectedMonth !== "ALL" &&
      availableMonths.length > 0 &&
      !availableMonths.includes(Number(selectedMonth))
    ) {
      setSelectedMonth("ALL");
    }
  }, [availableMonths, selectedMonth]);

  // Load branches & QR codes
  const fetchQrData = useCallback(async (silent = false) => {
    if (!silent) setLoadingQr(true);
    try {
      const res = await fetch("/api/admin/espace-client/qr-codes", {
        cache: "no-store",
      });
      if (res.status === 403 || res.status === 401) {
        setAccessDenied(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de charger les QR Codes.");
      }

      const loadedQr: CustomerFeedbackQrItem[] = Array.isArray(data.qrCodes)
        ? data.qrCodes
        : [];
      const loadedBranches: BranchOption[] = Array.isArray(data.branches)
        ? data.branches
        : [];

      setQrCodes(loadedQr);
      setBranches(loadedBranches);
      if (data.organizationName) setOrganizationName(data.organizationName);
      if (data.permission) setPermission(data.permission);

      setSelectedBranchForQr((prev) => {
        if (prev && loadedBranches.some((b) => b.id === prev)) return prev;
        return loadedBranches[0]?.id || "";
      });
    } catch (err: any) {
      if (!silent) {
        showSystemToast(
          err?.message || "Erreur lors du chargement des QR Codes.",
          "error"
        );
      }
    } finally {
      if (!silent) setLoadingQr(false);
    }
  }, []);

  // Load customer feedback with dynamic filters
  const fetchFeedback = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingFeedback(true);
      try {
        const params = new URLSearchParams();
        if (selectedYear !== "ALL") params.set("year", selectedYear);
        if (selectedMonth !== "ALL") params.set("month", selectedMonth);
        if (selectedBranchFilter !== "ALL")
          params.set("branchId", selectedBranchFilter);
        if (favoritesOnly) params.set("favoritesOnly", "true");

        const res = await fetch(
          `/api/admin/espace-client/feedback?${params.toString()}`,
          { cache: "no-store" }
        );

        if (res.status === 403 || res.status === 401) {
          setAccessDenied(true);
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Impossible de charger les avis clients.");
        }

        setFeedback(Array.isArray(data.feedback) ? data.feedback : []);
        setStats(
          data.stats || { totalCount: 0, currentMonthCount: 0, favoritesCount: 0 }
        );
        setAvailableYears(
          Array.isArray(data.availableYears) ? data.availableYears : []
        );
        setAvailableMonths(
          Array.isArray(data.availableMonths) ? data.availableMonths : []
        );
        if (data.permission) setPermission(data.permission);
      } catch (err: any) {
        if (!silent) {
          showSystemToast(
            err?.message || "Erreur lors du chargement des avis.",
            "error"
          );
        }
      } finally {
        if (!silent) setLoadingFeedback(false);
      }
    },
    [selectedYear, selectedMonth, selectedBranchFilter, favoritesOnly]
  );

  // Initial load for QR & branches
  useEffect(() => {
    fetchQrData();
  }, [fetchQrData]);

  // Reload feedback whenever filters change
  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  // Helper to resolve live origin URL for QR encoding & downloads
  const getScanUrl = useCallback((qr: CustomerFeedbackQrItem): string => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/avis/${qr.uniqueToken}`;
    }
    return qr.publicUrl;
  }, []);

  // Derived lookups
  const qrByBranchId = useMemo(() => {
    const map = new Map<string, CustomerFeedbackQrItem>();
    for (const qr of qrCodes) {
      map.set(qr.branchId, qr);
    }
    return map;
  }, [qrCodes]);

  const selectedBranchObj = useMemo(
    () => branches.find((b) => b.id === selectedBranchForQr) || null,
    [branches, selectedBranchForQr]
  );

  const existingQrForSelectedBranch = useMemo(
    () => (selectedBranchForQr ? qrByBranchId.get(selectedBranchForQr) || null : null),
    [qrByBranchId, selectedBranchForQr]
  );

  const hasActiveFilters = Boolean(
    selectedBranchFilter !== "ALL" ||
      selectedYear !== "ALL" ||
      selectedMonth !== "ALL" ||
      favoritesOnly
  );

  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    const mName = FRENCH_MONTHS[now.getMonth() + 1] || "";
    return `${mName} ${now.getFullYear()}`;
  }, []);

  // Dropdown Options
  const branchFilterOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Toutes les succursales" },
      ...branches.map((b) => ({
        value: b.id,
        label: b.name,
        sublabel: b.city || undefined,
      })),
    ],
    [branches]
  );

  const yearOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Toutes les années" },
      ...availableYears.map((y) => ({
        value: String(y),
        label: String(y),
      })),
    ],
    [availableYears]
  );

  const monthOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Tous les mois" },
      ...availableMonths.map((m) => ({
        value: String(m),
        label: FRENCH_MONTHS[m] || `Mois ${m}`,
      })),
    ],
    [availableMonths]
  );

  const qrBranchSelectOptions: CustomSelectOption[] = useMemo(
    () =>
      branches.map((b) => {
        const existing = qrByBranchId.get(b.id);
        return {
          value: b.id,
          label: b.name,
          sublabel: existing
            ? existing.isActive
              ? "QR Code généré • Actif"
              : "QR Code généré • Inactif"
            : b.city
              ? `${b.city} • Aucun QR Code`
              : "Aucun QR Code",
        };
      }),
    [branches, qrByBranchId]
  );

  // Actions — Section 1
  const handleResetFilters = () => {
    setSelectedBranchFilter("ALL");
    setSelectedYear("ALL");
    setSelectedMonth("ALL");
    setFavoritesOnly(false);
  };

  const handleToggleFavorite = async (item: CustomerFeedbackItem) => {
    if (!permission.edit) {
      showSystemToast(
        "Vous n'avez pas l'autorisation de modifier les favoris.",
        "error"
      );
      return;
    }
    if (togglingFavoriteId) return;

    const nextValue = !item.isFavorite;
    setTogglingFavoriteId(item.id);

    try {
      const res = await fetch(`/api/admin/espace-client/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: nextValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de mettre à jour le favori.");
      }

      showSystemToast(
        nextValue ? "Avis ajouté aux favoris." : "Avis retiré des favoris.",
        "success"
      );
      await fetchFeedback(true);
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors de la mise à jour du favori.",
        "error"
      );
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    if (!permission.delete) {
      showSystemToast(
        "Vous n'avez pas l'autorisation de supprimer un avis.",
        "error"
      );
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/espace-client/feedback/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de supprimer ce commentaire.");
      }

      setDeleteTarget(null);
      showSystemToast("Commentaire supprimé définitivement.", "success");
      await Promise.all([fetchFeedback(true), fetchQrData(true)]);
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors de la suppression du commentaire.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Actions — Section 2 (SlideOver QR management)
  const handleSelectBranchForQr = (branchId: string) => {
    setSelectedBranchForQr(branchId);
    const existing = qrByBranchId.get(branchId);
    if (existing) {
      showSystemToast(
        `La succursale « ${existing.branchName} » a déjà un QR Code.`,
        "info"
      );
    }
  };

  const handleGenerateQr = async () => {
    if (!selectedBranchForQr || isGeneratingQr) return;
    if (!permission.create) {
      showSystemToast(
        "Vous n'avez pas l'autorisation de générer un QR Code.",
        "error"
      );
      return;
    }

    if (existingQrForSelectedBranch) {
      showSystemToast(
        "Un QR Code existe déjà pour cette succursale.",
        "info"
      );
      return;
    }

    setIsGeneratingQr(true);
    try {
      const res = await fetch("/api/admin/espace-client/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: selectedBranchForQr }),
      });
      const data = await res.json();

      if (res.status === 409) {
        showSystemToast(
          data?.error || "Cette succursale possède déjà un QR Code unique.",
          "info"
        );
        await fetchQrData(true);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || "Impossible de générer le QR Code.");
      }

      showSystemToast(
        `QR Code généré avec succès pour « ${data.qrCode?.branchName || selectedBranchObj?.name} ».`,
        "success"
      );
      await fetchQrData(true);
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors de la génération du QR Code.",
        "error"
      );
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const handleToggleQrStatus = async (qr: CustomerFeedbackQrItem) => {
    if (!permission.edit) {
      showSystemToast(
        "Vous n'avez pas l'autorisation de modifier le statut d'un QR Code.",
        "error"
      );
      return;
    }
    if (togglingQrId) return;

    const nextActive = !qr.isActive;
    setTogglingQrId(qr.id);

    try {
      const res = await fetch(`/api/admin/espace-client/qr-codes/${qr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || "Impossible de modifier le statut du QR Code."
        );
      }

      setQrCodes((prev) =>
        prev.map((item) =>
          item.id === qr.id ? { ...item, isActive: nextActive } : item
        )
      );
      setZoomedQr((prev) =>
        prev && prev.id === qr.id ? { ...prev, isActive: nextActive } : prev
      );
      showSystemToast(
        nextActive
          ? `Le QR Code de « ${qr.branchName} » est désormais actif.`
          : `Le QR Code de « ${qr.branchName} » a été désactivé.`,
        "success"
      );
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors de la modification du statut.",
        "error"
      );
    } finally {
      setTogglingQrId(null);
    }
  };

  const handleConfirmDeleteQr = async () => {
    if (!deleteQrTarget || isDeletingQr) return;
    if (!permission.delete) {
      showSystemToast(
        "Vous n'avez pas l'autorisation de supprimer un QR Code.",
        "error"
      );
      return;
    }
    if (deleteQrTarget.isActive) {
      showSystemToast(
        "Désactivez d'abord ce QR Code avant de le supprimer.",
        "info"
      );
      setDeleteQrTarget(null);
      return;
    }

    setIsDeletingQr(true);
    try {
      const res = await fetch(
        `/api/admin/espace-client/qr-codes/${deleteQrTarget.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Impossible de supprimer ce QR Code.");
      }

      const deletedId = deleteQrTarget.id;
      const deletedBranchName = deleteQrTarget.branchName;
      setDeleteQrTarget(null);
      setZoomedQr((prev) => (prev && prev.id === deletedId ? null : prev));
      showSystemToast(
        `Le QR Code inactif de « ${deletedBranchName} » a été supprimé.`,
        "success"
      );
      await fetchQrData(true);
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors de la suppression du QR Code.",
        "error"
      );
    } finally {
      setIsDeletingQr(false);
    }
  };

  const handleCopyUrl = async (qr: CustomerFeedbackQrItem) => {
    const url = getScanUrl(qr);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedQrId(qr.id);
      showSystemToast("Lien public copié dans le presse-papiers.", "success");
      setTimeout(() => {
        setCopiedQrId((curr) => (curr === qr.id ? null : curr));
      }, 2000);
    } catch {
      showSystemToast("Impossible de copier automatiquement le lien.", "error");
    }
  };

  const handleDownloadPng = async (qr: CustomerFeedbackQrItem) => {
    const key = `png-${qr.id}`;
    setDownloadingKey(key);
    try {
      await downloadQrPng(getScanUrl(qr), qr.branchName, organizationName);
      showSystemToast(`QR Code PNG prêt pour « ${qr.branchName} ».`, "success");
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors du téléchargement PNG.",
        "error"
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadSvg = async (qr: CustomerFeedbackQrItem) => {
    const key = `svg-${qr.id}`;
    setDownloadingKey(key);
    try {
      await downloadQrSvg(getScanUrl(qr), qr.branchName);
      showSystemToast(`QR Code SVG prêt pour « ${qr.branchName} ».`, "success");
    } catch (err: any) {
      showSystemToast(
        err?.message || "Erreur lors du téléchargement SVG.",
        "error"
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  if (accessDenied) {
    return (
      <div className="bg-white rounded-2xl shadow-xs p-10 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[#031B3A]">Accès restreint</h2>
        <p className="text-sm text-[#64748B] max-w-md mx-auto">
          Vous ne disposez pas des droits nécessaires pour consulter le module Espace Client.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-white">
      {/* En-tête pleine largeur avec bouton Générer QR code ouvrant le panneau latéral droit */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#031B3A]">Espace Client</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Consultez et gérez les avis envoyés par vos clients dans chaque succursale.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsQrDrawerOpen(true)}
          className="h-10 px-4 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <QrCode className="w-4 h-4 text-white" />
          <span>Générer QR code</span>
          {qrCodes.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white">
              {qrCodes.length}
            </span>
          )}
        </button>
      </div>

      {/* Tableau de bord des avis (statistiques réelles de la BDD, pleine largeur) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-xs p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Total des avis reçus
            </p>
            <p className="text-3xl font-bold text-[#031B3A] mt-1">
              {stats.totalCount}
            </p>
          </div>
          <MessageSquare className="w-6 h-6 text-slate-400 shrink-0" />
        </div>

        <div className="bg-white rounded-2xl shadow-xs p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Avis du mois actuel
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-bold text-[#031B3A]">
                {stats.currentMonthCount}
              </p>
              <span className="text-xs text-[#64748B] font-medium">
                {currentMonthLabel}
              </span>
            </div>
          </div>
          <Calendar className="w-6 h-6 text-slate-400 shrink-0" />
        </div>

        <div className="bg-white rounded-2xl shadow-xs p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Avis en favoris
            </p>
            <p className="text-3xl font-bold text-[#031B3A] mt-1">
              {stats.favoritesCount}
            </p>
          </div>
          <Heart className="w-6 h-6 fill-rose-500 text-rose-500 shrink-0" />
        </div>
      </div>

      {/* Barre de filtres (pleine largeur) */}
      <div className="bg-white rounded-2xl shadow-xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <MinimalFilterSelect
              value={selectedBranchFilter}
              onChange={setSelectedBranchFilter}
              options={branchFilterOptions}
              placeholder="Toutes les succursales"
            />

            <MinimalFilterSelect
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
              placeholder="Toutes les années"
            />

            <MinimalFilterSelect
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={monthOptions}
              placeholder="Tous les mois"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
            <div className="inline-flex p-1 bg-[#F4F6F9] rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setFavoritesOnly(false)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !favoritesOnly
                    ? "bg-[#062653] text-white shadow-xs"
                    : "text-[#64748B] hover:text-[#062653]"
                }`}
              >
                Tous les avis
              </button>
              <button
                type="button"
                onClick={() => setFavoritesOnly(true)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  favoritesOnly
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-[#64748B] hover:text-rose-600"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    favoritesOnly ? "fill-white text-white" : ""
                  }`}
                />
                <span>Favoris</span>
              </button>
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-bold text-[#062653] hover:text-[#031B3A] hover:underline px-2 py-1.5 bg-transparent transition-colors cursor-pointer"
              >
                Réinitialiser
              </button>
            ) : (
              <span className="text-xs font-medium text-[#64748B] px-2">
                {feedback.length} avis affiché{feedback.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Liste des avis pleine largeur façon flux éditorial épuré avec lignes de séparation horizontales */}
      <div className="bg-white rounded-2xl shadow-xs overflow-hidden">
        {loadingFeedback ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="px-6 py-5 space-y-3 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-28 bg-slate-100 rounded" />
                </div>
                <div className="h-10 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : feedback.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <MessageSquareText className="w-7 h-7 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-[#031B3A]">
              {hasActiveFilters
                ? "Aucun avis ne correspond à vos critères"
                : "Aucun avis client reçu pour le moment"}
            </h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto">
              {hasActiveFilters
                ? "Modifiez ou réinitialisez vos filtres pour consulter d'autres commentaires."
                : "Cliquez sur « Générer QR code » en haut à droite pour configurer et télécharger les QR Codes de vos succursales."}
            </p>
            {!hasActiveFilters && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsQrDrawerOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-white" />
                  <span>Générer QR code</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {feedback.map((item) => {
              const displayName = item.customerName || "Client anonyme";
              const isAnonymous = !item.customerName;

              return (
                <article
                  key={item.id}
                  className="px-5 py-5 sm:px-7 sm:py-6 hover:bg-slate-50/40 transition-colors"
                >
                  {/* Ligne du haut : Nom du client à gauche, Date & heure à droite */}
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <h3
                      className={`text-sm sm:text-[15px] font-bold tracking-tight ${
                        isAnonymous
                          ? "text-[#64748B] italic font-semibold"
                          : "text-[#031B3A]"
                      }`}
                    >
                      {displayName}
                    </h3>

                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      {formatDateFr(item.createdAt)} • {formatTimeFr(item.createdAt)}
                    </span>
                  </div>

                  {/* Contenu intégral directement sur fond blanc épuré */}
                  <p className="mt-2.5 text-sm text-[#475569] leading-relaxed whitespace-pre-wrap break-words">
                    {item.comment}
                  </p>

                  {/* Ligne du bas : Succursale + catégorie à gauche, Favori + Supprimer uniquement à droite */}
                  <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#062653]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.branchName}</span>
                      </span>

                      {item.category && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#64748B]">
                            <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{item.category}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Deux actions uniquement : Favori (cœur) & Supprimer (corbeille) */}
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        disabled={
                          togglingFavoriteId === item.id || !permission.edit
                        }
                        onClick={() => handleToggleFavorite(item)}
                        aria-label={
                          item.isFavorite
                            ? "Retirer des favoris"
                            : "Ajouter aux favoris"
                        }
                        title={
                          item.isFavorite
                            ? "Retirer des favoris"
                            : "Ajouter aux favoris"
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          item.isFavorite
                            ? "text-rose-600 bg-rose-50 hover:bg-rose-100"
                            : "text-slate-500 hover:text-rose-600 hover:bg-rose-50/70"
                        }`}
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            item.isFavorite ? "fill-rose-500 text-rose-500" : ""
                          }`}
                        />
                        <span className="hidden sm:inline">
                          {item.isFavorite ? "Favori" : "Favoris"}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={!permission.delete}
                        onClick={() => setDeleteTarget(item)}
                        aria-label="Supprimer le commentaire"
                        title="Supprimer le commentaire"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Supprimer</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SLIDE-OVER LATÉRAL DROIT : GÉNÉRATION & GESTION DES QR CODES          */}
      {/* (Sans ligne de séparation sous l'en-tête, Bloc 1 sans fond gris)      */}
      {/* ===================================================================== */}
      <QrSlideOver
        isOpen={isQrDrawerOpen}
        onClose={() => setIsQrDrawerOpen(false)}
        title="Gestion & Génération des QR Codes"
        subtitle="Générez, activez et téléchargez le QR Code de vos succursales pour impression."
        icon={<QrCode className="w-5 h-5 text-[#FF7900]" />}
      >
        <div className="space-y-6">
          {/* Bloc 1 : Sélection de succursale & création unique (sans encadrement ni fond gris) */}
          <div className="space-y-4">
            <span className="block text-xs font-bold text-[#062653] uppercase tracking-wider">
              Succursale E-Biznis
            </span>

            {branches.length === 0 && !loadingQr ? (
              <div className="p-3 rounded-xl bg-amber-50 text-xs text-amber-800">
                Aucune succursale enregistrée dans le système.
              </div>
            ) : (
              <MinimalFilterSelect
                value={selectedBranchForQr}
                onChange={handleSelectBranchForQr}
                options={qrBranchSelectOptions}
                placeholder="Sélectionner une succursale..."
                icon={<MapPin className="w-4 h-4 text-[#FF7900]" />}
              />
            )}

            {loadingQr ? (
              <div className="py-4 text-center text-xs text-[#64748B]">
                Vérification des QR Codes en cours...
              </div>
            ) : !selectedBranchObj ? (
              <div className="py-3 text-center text-xs text-[#64748B]">
                Sélectionnez une succursale ci-dessus pour continuer.
              </div>
            ) : existingQrForSelectedBranch ? (
              /* Un QR Code existe déjà -> afficher existant, JAMAIS de bouton Générer */
              <div className="pt-1 space-y-4">
                <div
                  className={`p-3 rounded-xl text-xs leading-relaxed flex items-start gap-2 ${
                    existingQrForSelectedBranch.isActive
                      ? "bg-blue-50 text-[#062653]"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {existingQrForSelectedBranch.isActive
                      ? `Un QR Code unique existe déjà pour « ${existingQrForSelectedBranch.branchName} ». Vous pouvez le télécharger ci-dessous.`
                      : `Le QR Code de « ${existingQrForSelectedBranch.branchName} » est actuellement désactivé. Vous pouvez le réactiver ou le supprimer ci-dessous.`}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setZoomedQr(existingQrForSelectedBranch)}
                    className="group relative shrink-0 cursor-pointer"
                    title="Agrandir le QR Code"
                  >
                    <QrCodePreviewImage
                      url={getScanUrl(existingQrForSelectedBranch)}
                      alt={`QR Code ${existingQrForSelectedBranch.branchName}`}
                      className="w-32 h-32 shadow-xs"
                      resolution={360}
                    />
                    <span className="absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-[#062653]/85 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="w-3 h-3" />
                    </span>
                  </button>

                  <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#031B3A]">
                        {existingQrForSelectedBranch.branchName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          existingQrForSelectedBranch.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {existingQrForSelectedBranch.isActive ? "Actif" : "Inactif"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#F4F6F9] rounded-xl px-2.5 py-1.5 text-[11px] text-[#64748B]">
                      <span className="truncate flex-1 font-mono">
                        {getScanUrl(existingQrForSelectedBranch)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(existingQrForSelectedBranch)}
                        className="p-1 text-[#062653] hover:text-[#FF7900] cursor-pointer shrink-0"
                        title="Copier le lien"
                      >
                        {copiedQrId === existingQrForSelectedBranch.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={getScanUrl(existingQrForSelectedBranch)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-[#062653] hover:text-[#FF7900] shrink-0"
                        title="Ouvrir la page publique"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={
                          downloadingKey ===
                          `png-${existingQrForSelectedBranch.id}`
                        }
                        onClick={() =>
                          handleDownloadPng(existingQrForSelectedBranch)
                        }
                        className="px-3.5 py-2 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-[#FF7900]" />
                        <span>Télécharger PNG</span>
                      </button>

                      <button
                        type="button"
                        disabled={
                          downloadingKey ===
                          `svg-${existingQrForSelectedBranch.id}`
                        }
                        onClick={() =>
                          handleDownloadSvg(existingQrForSelectedBranch)
                        }
                        className="px-3.5 py-2 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-[#062653] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger SVG</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Aucun QR Code existant -> Bouton Générer */
              <div className="pt-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[#031B3A]">
                    Aucun QR Code pour « {selectedBranchObj.name} »
                  </p>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    Générez un identifiant public unique et permanent associé définitivement à cette succursale.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isGeneratingQr || !permission.create}
                  onClick={handleGenerateQr}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <QrCode className="w-4 h-4" />
                  <span>
                    {isGeneratingQr ? "Génération..." : "Générer le QR Code"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Bloc 2 : Liste complète des QR Codes existants (sans gros encadrement) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#062653] border-b border-slate-100 pb-2">
              <span>QR Codes existants ({qrCodes.length})</span>
              <span className="text-[11px] font-semibold text-emerald-700">
                {qrCodes.filter((q) => q.isActive).length} actif
                {qrCodes.filter((q) => q.isActive).length > 1 ? "s" : ""} •{" "}
                {qrCodes.filter((q) => !q.isActive).length} inactif
                {qrCodes.filter((q) => !q.isActive).length > 1 ? "s" : ""}
              </span>
            </div>

            {loadingQr ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                Chargement de la liste...
              </div>
            ) : qrCodes.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                Aucun QR Code généré pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {qrCodes.map((qr) => {
                  const scanUrl = getScanUrl(qr);
                  const isBusyStatus = togglingQrId === qr.id;

                  return (
                    <div
                      key={qr.id}
                      className="py-4 first:pt-1 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setZoomedQr(qr)}
                          className="shrink-0 cursor-pointer"
                          title="Agrandir le QR Code"
                        >
                          <QrCodePreviewImage
                            url={scanUrl}
                            alt={`QR Code ${qr.branchName}`}
                            className="w-16 h-16"
                            resolution={220}
                          />
                        </button>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[#031B3A] truncate">
                              {qr.branchName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                qr.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {qr.isActive ? "Actif" : "Inactif"}
                            </span>
                          </div>

                          <p className="text-[11px] text-[#64748B]">
                            Créé le {formatShortDateFr(qr.createdAt)} •{" "}
                            {qr.feedbackCount} avis reçu
                            {qr.feedbackCount > 1 ? "s" : ""}
                          </p>

                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleCopyUrl(qr)}
                              className="text-[11px] font-semibold text-[#062653] hover:text-[#FF7900] inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedQrId === qr.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700">Copié</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copier le lien</span>
                                </>
                              )}
                            </button>
                            <span className="text-slate-300">•</span>
                            <a
                              href={scanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-[#64748B] hover:text-[#062653] inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Ouvrir la page</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`grid gap-2 ${
                          qr.isActive
                            ? "grid-cols-3"
                            : "grid-cols-2 sm:grid-cols-4"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={downloadingKey === `png-${qr.id}`}
                          onClick={() => handleDownloadPng(qr)}
                          className="py-1.5 px-3 rounded-lg bg-[#F4F6F9] hover:bg-[#062653] hover:text-white text-[#062653] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PNG</span>
                        </button>

                        <button
                          type="button"
                          disabled={downloadingKey === `svg-${qr.id}`}
                          onClick={() => handleDownloadSvg(qr)}
                          className="py-1.5 px-3 rounded-lg bg-[#F4F6F9] hover:bg-[#062653] hover:text-white text-[#062653] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>SVG</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusyStatus || !permission.edit}
                          onClick={() => handleToggleQrStatus(qr)}
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            qr.isActive
                              ? "bg-amber-50 hover:bg-amber-100 text-amber-800"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>
                            {isBusyStatus
                              ? "..."
                              : qr.isActive
                                ? "Désactiver"
                                : "Activer"}
                          </span>
                        </button>

                        {!qr.isActive && (
                          <button
                            type="button"
                            disabled={!permission.delete || isDeletingQr}
                            onClick={() => setDeleteQrTarget(qr)}
                            title="Supprimer ce QR Code inactif"
                            className="py-1.5 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Supprimer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pied du panneau latéral */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => setIsQrDrawerOpen(false)}
              className="px-5 py-2.5 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </QrSlideOver>

      {/* Modale d'aperçu agrandi d'un QR Code */}
      <Modal
        isOpen={Boolean(zoomedQr)}
        onClose={() => setZoomedQr(null)}
        title={zoomedQr ? `QR Code — ${zoomedQr.branchName}` : "QR Code"}
        maxWidth="sm"
      >
        {zoomedQr && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <QrCodePreviewImage
                url={getScanUrl(zoomedQr)}
                alt={`QR Code ${zoomedQr.branchName}`}
                className="w-56 h-56"
                resolution={480}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#031B3A]">
                Succursale : {zoomedQr.branchName}
              </p>
              <p className="text-xs text-[#64748B] font-mono break-all">
                {getScanUrl(zoomedQr)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDownloadPng(zoomedQr)}
                className="px-4 py-2 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#FF7900]" />
                <span>Télécharger PNG</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSvg(zoomedQr)}
                className="px-4 py-2 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-[#062653] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger SVG</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Boîte de confirmation obligatoire avant suppression d'un avis */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        title="Confirmer la suppression"
        maxWidth="md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 text-rose-800 text-xs sm:text-sm leading-relaxed">
              Voulez-vous vraiment supprimer définitivement ce commentaire de la base de données ? Cette action est irréversible.
            </div>

            <div className="p-4 rounded-xl bg-[#F4F6F9] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-[#031B3A]">
                  {deleteTarget.customerName || "Client anonyme"}
                </span>
                <span className="text-[#64748B]">
                  {deleteTarget.branchName} • {formatDateFr(deleteTarget.createdAt)}
                </span>
              </div>
              <p className="text-[#263445] line-clamp-3 whitespace-pre-wrap">
                {deleteTarget.comment}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-bold text-[#263445] transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isDeleting ? "Suppression..." : "Supprimer définitivement"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Boîte de confirmation avant suppression d'un QR Code inactif */}
      <Modal
        isOpen={Boolean(deleteQrTarget)}
        onClose={() => {
          if (!isDeletingQr) setDeleteQrTarget(null);
        }}
        title="Supprimer ce QR Code inactif"
        maxWidth="md"
      >
        {deleteQrTarget && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 text-rose-800 text-xs sm:text-sm leading-relaxed">
              Voulez-vous vraiment supprimer définitivement le QR Code inactif de la succursale « {deleteQrTarget.branchName} » ? Le lien public actuel ne sera plus valide.
            </div>

            {deleteQrTarget.feedbackCount > 0 && (
              <div className="p-3.5 rounded-xl bg-[#F4F6F9] text-xs text-[#263445]">
                Les {deleteQrTarget.feedbackCount} avis client{deleteQrTarget.feedbackCount > 1 ? "s" : ""} déjà reçu{deleteQrTarget.feedbackCount > 1 ? "s" : ""} pour cette succursale seront conservés dans votre historique.
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingQr}
                onClick={() => setDeleteQrTarget(null)}
                className="px-4 py-2.5 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-bold text-[#263445] transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeletingQr}
                onClick={handleConfirmDeleteQr}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isDeletingQr ? "Suppression..." : "Supprimer le QR Code"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
