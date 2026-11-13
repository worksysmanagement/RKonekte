"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  PlusCircle,
  Search,
  CheckCircle2,
  Eye,
  Trash2,
  X,
  Send,
  MessageSquare,
  Mail,
  Calendar,
  Building2,
  User,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  FileDown,
  FileSignature,
  Upload,
  Printer,
  RotateCcw,
  Edit3,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { showSystemToast } from "@/components/ui/SystemToast";
import { processTransparentImage } from "@/lib/utils/signature";
import {
  generateSalaryRevisionPdfBlob,
  downloadPdfBlob,
  printPdfDocument,
} from "@/lib/utils/pdf";
import { SalaryRevisionDocument } from "@/components/documents/SalaryRevisionDocument";

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department?: string;
  position?: string;
  branchId?: string | null;
  branch?: string | null;
  branchName?: string;
  phone?: string;
  email?: string;
  salary?: string;
  currency?: string;
}

interface SalaryAdjustment {
  id: string;
  organizationId?: string;
  companyName?: string;
  employeeId?: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  branch: string;
  phone?: string;
  email?: string;
  previousSalary: string;
  newSalary: string;
  currency: string;
  effectiveDate: string;
  reason: string;
  attributedBy: string;
  signatureDataUrl?: string;
  createdAt: string;
  status: "APPLIED" | "PENDING";
  whatsappSent?: boolean;
  whatsappDirectUrl?: string;
  emailSent?: boolean;
  lastNotifiedAt?: string;
}

export default function SalaryRaiseRequestsPage() {
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rk_active_branch");
      if (saved && saved !== "all") return saved;
    }
    return "all";
  });
  const [companyName, setCompanyName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("rk_company_name") || "e-biznis";
    }
    return "e-biznis";
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<SalaryAdjustment | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // PDF Generation State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfTargetAdjustment, setPdfTargetAdjustment] = useState<SalaryAdjustment | null>(null);
  const pdfPrintRef = useRef<HTMLDivElement | null>(null);

  // Signature in Form Modal
  const [signatureUrl, setSignatureUrl] = useState<string>("");
  const [signatureMode, setSignatureMode] = useState<"upload" | "draw">("upload");
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Success Notification Dialog
  const [notificationResult, setNotificationResult] = useState<{
    reference: string;
    employeeName: string;
    phone?: string;
    email?: string;
    whatsappDirectUrl?: string;
    emailSent?: boolean;
    whatsappSent?: boolean;
    adjustment?: SalaryAdjustment;
  } | null>(null);

  // New salary attribution form
  const [formData, setFormData] = useState({
    employeeId: "",
    employeeName: "",
    employeeNumber: "",
    department: "",
    branch: "",
    phone: "",
    email: "",
    previousSalary: "",
    newSalary: "",
    currency: "HTG",
    effectiveDate: new Date().toISOString().split("T")[0],
    reason: "Revalorisation annuelle et appréciation du rendement",
    sendWhatsApp: true,
    sendEmail: true,
  });

  useEffect(() => {
    // 1. Fetch user role
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.role) {
          setCurrentUserRole(data.user.role);
        } else {
          setCurrentUserRole("EMPLOYEE");
        }
      })
      .catch(() => {
        setCurrentUserRole("EMPLOYEE");
      });

    // 2. Fetch salary adjustments
    loadSalaryAdjustments();

    // 3. Fetch employees for dropdown
    fetch("/api/admin/employees")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.employees || [];
        setEmployees(list);
      })
      .catch(() => setEmployees([]));

    // 4. Fetch branches
    fetch("/api/admin/branches")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.branches) setBranches(data.branches);
      })
      .catch(() => {});

    // 4b. Fetch organization name
    fetch("/api/admin/organization")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.organization?.name) {
          setCompanyName(data.organization.name);
          if (typeof window !== "undefined") {
            localStorage.setItem("rk_company_name", data.organization.name);
          }
        }
      })
      .catch(() => {});

    // 5. Pre-load saved signature from localStorage if exists
    if (typeof window !== "undefined") {
      const savedSig =
        localStorage.getItem("rk_admin_saved_signature") ||
        localStorage.getItem("rkonekte_user_signature");
      if (savedSig) {
        setSignatureUrl(savedSig);
      }
    }

    // 6. Listen to global branch change event from AdminHeader
    const handleBranchChange = (e: any) => {
      const bId = e.detail?.branchId;
      if (bId !== undefined) {
        setActiveBranchId(bId);
      }
    };
    window.addEventListener("branchChange", handleBranchChange);
    return () => window.removeEventListener("branchChange", handleBranchChange);
  }, []);

  const loadSalaryAdjustments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/salary-adjustments?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setAdjustments(data.adjustments || []);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const isEmployee =
    currentUserRole === "EMPLOYEE" ||
    currentUserRole === "COLLABORATEUR" ||
    currentUserRole === "CASHIER" ||
    currentUserRole === "CAISSIER" ||
    (currentUserRole?.toLowerCase().includes("employ") &&
      !currentUserRole?.toLowerCase().includes("admin") &&
      !currentUserRole?.toLowerCase().includes("direct"));

  // Handle employee dropdown selection
  const handleSelectEmployee = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) {
      setFormData((prev) => ({
        ...prev,
        employeeId: "",
        employeeName: "",
        employeeNumber: "",
        department: "",
        branch: "",
        phone: "",
        email: "",
        previousSalary: "",
      }));
      return;
    }

    const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim();
    const resolvedBranch =
      (emp.branchId ? branches.find((b) => b.id === emp.branchId)?.name : undefined) ||
      emp.branchName ||
      emp.branch ||
      "";
    setFormData((prev) => ({
      ...prev,
      employeeId: emp.id,
      employeeName: fullName || emp.employeeNumber,
      employeeNumber: emp.employeeNumber || "",
      department: emp.department || "Général",
      branch: resolvedBranch,
      phone: emp.phone || "",
      email: emp.email || "",
      previousSalary: emp.salary || prev.previousSalary || "0",
      currency: emp.currency || prev.currency || "HTG",
    }));
  };

  // Signature File Upload Handler with Auto Transparency Cleanup
  const handleSignatureFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const raw = event.target.result as string;
        try {
          // Process transparent ink (removes paper shadows & photo background)
          const transparent = await processTransparentImage(raw);
          setSignatureUrl(transparent);
          localStorage.setItem("rk_admin_saved_signature", transparent);
          showSystemToast("Signature de la direction importée et détourée avec succès !");
        } catch (_) {
          setSignatureUrl(raw);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#062653";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      setSignatureUrl(dataUrl);
      try {
        localStorage.setItem("rk_admin_saved_signature", dataUrl);
      } catch (_) {}
    }
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureUrl("");
  };

  // Download PDF Handler
  const handleDownloadPdf = async (adjustment: SalaryAdjustment) => {
    try {
      setIsGeneratingPdf(true);
      showSystemToast("Génération du document officiel PDF...", "info");

      // Attach current signature if the adjustment record didn't have one saved
      const adjToRender: SalaryAdjustment = {
        ...adjustment,
        signatureDataUrl: adjustment.signatureDataUrl || signatureUrl || undefined,
      };

      setPdfTargetAdjustment(adjToRender);

      // Brief tick for DOM to mount SalaryRevisionDocument
      await new Promise((resolve) => setTimeout(resolve, 250));

      if (!pdfPrintRef.current) {
        throw new Error("Impossible de préparer la feuille du document officiel.");
      }

      const fileName = `Notification_Revalorisation_${adjustment.id}_${adjustment.employeeNumber}.pdf`;
      const { blob } = await generateSalaryRevisionPdfBlob(pdfPrintRef.current, fileName);
      downloadPdfBlob(blob, fileName);

      showSystemToast("Document PDF officiel téléchargé avec succès !");
    } catch (err: any) {
      console.error("Erreur PDF:", err);
      showSystemToast(err?.message || "Erreur lors de la génération du PDF", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Print PDF Handler
  const handlePrintPdf = async (adjustment: SalaryAdjustment) => {
    try {
      setIsGeneratingPdf(true);
      const adjToRender: SalaryAdjustment = {
        ...adjustment,
        signatureDataUrl: adjustment.signatureDataUrl || signatureUrl || undefined,
      };
      setPdfTargetAdjustment(adjToRender);
      await new Promise((resolve) => setTimeout(resolve, 250));

      if (!pdfPrintRef.current) return;
      const fileName = `Notification_Revalorisation_${adjustment.id}.pdf`;
      const { blob } = await generateSalaryRevisionPdfBlob(pdfPrintRef.current, fileName);
      printPdfDocument(blob, `Notification Officielle ${adjustment.id}`);
    } catch (err: any) {
      showSystemToast("Erreur lors de l'impression.", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.employeeName || !formData.newSalary.trim()) {
      showSystemToast("Veuillez sélectionner un employé et renseigner le nouveau salaire.", "error");
      return;
    }

    if (!signatureUrl || signatureUrl.trim().length === 0) {
      showSystemToast(
        "Veuillez uploader ou tracer votre signature de Direction afin de certifier le document officiel PDF.",
        "error"
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/admin/salary-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          companyName,
          signatureDataUrl: signatureUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Erreur lors de l'attribution.", "error");
        return;
      }

      showSystemToast(`Salaire réévalué pour ${formData.employeeName} avec signature officielle !`);
      setShowNewForm(false);

      const createdAdjustment = data.adjustment;

      // Open notification confirmation modal with download action
      setNotificationResult({
        reference: createdAdjustment?.id || "SAL-2026",
        employeeName: formData.employeeName,
        phone: formData.phone,
        email: formData.email,
        whatsappDirectUrl: data.whatsappDirectUrl,
        emailSent: data.emailSent,
        whatsappSent: data.whatsappSent,
        adjustment: createdAdjustment,
      });

      // Reload list
      await loadSalaryAdjustments();

      // Reset form (keep signature in memory)
      setFormData({
        employeeId: "",
        employeeName: "",
        employeeNumber: "",
        department: "",
        branch: "",
        phone: "",
        email: "",
        previousSalary: "",
        newSalary: "",
        currency: "HTG",
        effectiveDate: new Date().toISOString().split("T")[0],
        reason: "Revalorisation annuelle et appréciation du rendement",
        sendWhatsApp: true,
        sendEmail: true,
      });
    } catch (err: any) {
      showSystemToast(err?.message || "Erreur réseau.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Supprimer définitivement l'enregistrement de révision salariale pour ${name} (${id}) ?`);
      if (!ok) return;
    }
    try {
      setAdjustments((prev) => prev.filter((a) => a.id !== id));
      if (selectedAdjustment?.id === id) {
        setSelectedAdjustment(null);
      }

      const res = await fetch(`/api/admin/salary-adjustments/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Erreur lors de la suppression.", "error");
        await loadSalaryAdjustments();
        return;
      }
      showSystemToast(`L'ajustement ${id} a été supprimé définitivement.`);
      await loadSalaryAdjustments();
    } catch (err: any) {
      showSystemToast(err?.message || "Erreur de suppression.", "error");
      await loadSalaryAdjustments();
    }
  };

  const handleResend = async (id: string, channel: "whatsapp" | "email" | "both") => {
    try {
      showSystemToast("Envoi de la notification en cours...");
      const res = await fetch(`/api/admin/salary-adjustments/${id}/resend-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Échec de renvoi.", "error");
        return;
      }

      if (data.whatsappDirectUrl && channel !== "email") {
        window.open(data.whatsappDirectUrl, "_blank");
      }

      showSystemToast("Notification transmise avec succès !");
      await loadSalaryAdjustments();
    } catch (err: any) {
      showSystemToast(err?.message || "Erreur lors de la transmission.", "error");
    }
  };

  const filtered = adjustments.filter((r) => {
    if (activeBranchId !== "all" && activeBranchId !== "ALL") {
      const brObj = branches.find((b) => b.id === activeBranchId);
      const matchesBranch =
        r.branch === activeBranchId ||
        (brObj && r.branch === brObj.name) ||
        (brObj?.name && r.branch.toLowerCase().includes(brObj.name.toLowerCase())) ||
        (brObj?.city && r.branch.toLowerCase().includes(brObj.city.toLowerCase()));
      if (!matchesBranch) return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeNumber.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredEmployeesForAttribution = employees.filter((emp) => {
    if (activeBranchId === "all" || activeBranchId === "ALL") return true;
    const brObj = branches.find((b) => b.id === activeBranchId);
    return (
      (emp as any).branchId === activeBranchId ||
      (emp.branchName && (emp.branchName === activeBranchId || (brObj && emp.branchName === brObj.name)))
    );
  });

  if (currentUserRole === null) {
    return (
      <div className="p-16 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-[#FF7900] rounded-full animate-spin" />
        <span>Chargement de votre espace...</span>
      </div>
    );
  }

  // RESTRICTED VIEW FOR EMPLOYEES: Salary management is Top-Down / Administrative
  if (isEmployee) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#062653]">Module Réservé à l'Administration</h2>
        <p className="text-xs text-[#64748B] leading-relaxed max-w-lg mx-auto">
          Les révisions, augmentations et attributions salariales sont définies directement par la Direction et
          le service des Ressources Humaines.
        </p>
        <div className="p-4 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] text-left space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#062653]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Processus automatique des rémunérations :</span>
          </div>
          <p className="text-[11px] text-[#64748B]">
            Lorsqu'une revalorisation ou un nouveau salaire vous est attribué, vous recevez automatiquement une
            notification officielle par <strong>WhatsApp</strong> et par <strong>Email</strong> avec la date d'effet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden Offscreen Render Target for High-Quality PDF Generation */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          zIndex: -100,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        {pdfTargetAdjustment && (
          <SalaryRevisionDocument
            ref={pdfPrintRef}
            adjustment={pdfTargetAdjustment}
            companyName={pdfTargetAdjustment.companyName || companyName || "e-biznis"}
          />
        )}
      </div>

      {/* Page Header */}
      {showNewForm ? (
        <div className="space-y-6 pb-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="p-2 bg-white shadow-xs rounded-xl hover:bg-[#F4F6F9] text-[#64748B] transition-colors cursor-pointer"
              title="Retour à l'historique"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                Attribuer un nouveau salaire
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Sélectionnez un collaborateur, définissez sa nouvelle rémunération et apposez votre signature pour générer le PDF officiel et envoyer la notification.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
            <form onSubmit={handleCreateSubmit} className="space-y-6 sm:space-y-8">
              {/* 1. COLLABORATEUR CONCERNÉ */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider">
                    1. Collaborateur concerné
                  </h3>
                  <span className="text-[11px] text-red-600 font-semibold">
                    * Champs requis
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Sélectionner le collaborateur <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.employeeId}
                      onChange={(e) => handleSelectEmployee(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white font-medium cursor-pointer"
                      required
                    >
                      <option value="">-- Choisir un employé dans la liste --</option>
                      {(filteredEmployeesForAttribution.length > 0 ? filteredEmployeesForAttribution : employees).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeNumber}) — {emp.department || "Général"}
                        </option>
                      ))}
                    </select>
                    {employees.length === 0 && (
                      <p className="text-[11px] text-[#64748B] mt-1.5">
                        Aucun employé enregistré pour l&apos;instant.{" "}
                        <Link
                          href="/admin/employees/new"
                          className="text-[#FF7900] hover:underline font-semibold"
                        >
                          Ajouter un employé →
                        </Link>
                      </p>
                    )}
                  </div>

                  {formData.employeeId && (
                    <div className="p-4 bg-[#F4F6F9] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[#64748B] block text-[11px]">Matricule</span>
                        <span className="font-bold text-[#062653] font-mono">
                          {formData.employeeNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px]">Succursale / Dép.</span>
                        <span className="font-bold text-[#062653]">
                          {formData.branch || "Siège"} {formData.department ? `• ${formData.department}` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px]">WhatsApp</span>
                        <span className="font-semibold text-emerald-700">
                          {formData.phone || "Non renseigné"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px]">Email</span>
                        <span className="font-semibold text-blue-700 truncate block">
                          {formData.email || "Non renseigné"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. RÉMUNÉRATION & DÉTAILS */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider">
                    2. Rémunération &amp; Date d&apos;effet
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Ancien Salaire
                    </label>
                    <input
                      type="text"
                      value={formData.previousSalary}
                      onChange={(e) => setFormData({ ...formData, previousSalary: e.target.value })}
                      placeholder="Ex: 50 000"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-800 mb-1.5">
                      Nouveau Salaire <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.newSalary}
                      onChange={(e) => setFormData({ ...formData, newSalary: e.target.value })}
                      placeholder="Ex: 65 000"
                      className="w-full h-11 px-3.5 bg-emerald-50 rounded-xl text-xs text-emerald-900 font-bold focus:bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Devise
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white font-bold cursor-pointer"
                    >
                      <option value="HTG">HTG (Gourde)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Date d&apos;effet <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.effectiveDate}
                      onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Téléphone (WhatsApp)
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+509 3700 0000"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Motif de la revalorisation
                    </label>
                    <input
                      type="text"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Ex: Promotion, Réévaluation annuelle des performances..."
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 3. SIGNATURE OFFICIELLE & CANAUX DE NOTIFICATION */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider">
                    3. Signature officielle &amp; Notifications
                  </h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* SIGNATURE SECTION */}
                  <div className="p-4 sm:p-5 bg-[#F4F6F9] rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSignature className="w-4 h-4 text-[#062653]" />
                        <span className="text-xs font-bold text-[#062653]">
                          Signature de la Direction (Pour le bas du PDF) *
                        </span>
                      </div>

                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg shadow-2xs text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSignatureMode("upload")}
                          className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                            signatureMode === "upload"
                              ? "bg-[#062653] text-white"
                              : "text-[#64748B] hover:text-[#062653]"
                          }`}
                        >
                          Uploader
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignatureMode("draw")}
                          className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                            signatureMode === "draw"
                              ? "bg-[#062653] text-white"
                              : "text-[#64748B] hover:text-[#062653]"
                          }`}
                        >
                          Tracer
                        </button>
                      </div>
                    </div>

                    {signatureMode === "upload" ? (
                      <div>
                        {signatureUrl ? (
                          <div className="bg-white rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-3">
                              <div className="h-14 w-32 bg-[#F4F6F9] rounded-lg flex items-center justify-center p-1 overflow-hidden">
                                <img
                                  src={signatureUrl}
                                  alt="Signature Direction"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Signature prête pour le PDF
                                </span>
                                <p className="text-[11px] text-[#64748B]">
                                  Sera apposée au bas de la page officielle.
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSignatureUrl("")}
                              className="text-xs text-red-600 hover:text-red-700 font-semibold px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer shrink-0"
                            >
                              Remplacer
                            </button>
                          </div>
                        ) : (
                          <label className="bg-white hover:bg-emerald-50/50 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSignatureFileUpload}
                              className="hidden"
                            />
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                              <Upload className="w-4 h-4" />
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-bold text-[#062653]">
                                Cliquez pour uploader votre signature (photo ou scan)
                              </span>
                              <p className="text-[10px] text-[#64748B]">
                                PNG, JPG, WebP — Détourage automatique du fond blanc
                              </p>
                            </div>
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="rounded-xl overflow-hidden bg-white shadow-2xs">
                          <canvas
                            ref={canvasRef}
                            width={520}
                            height={110}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="w-full h-24 bg-white touch-none cursor-crosshair"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#64748B]">
                            Signez ci-dessus avec la souris ou le doigt
                          </span>
                          <button
                            type="button"
                            onClick={clearDrawing}
                            className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-0.5 bg-white hover:bg-slate-200 rounded cursor-pointer shadow-2xs"
                          >
                            Effacer le tracé
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NOTIFICATION CHANNELS */}
                  <div className="p-4 sm:p-5 bg-emerald-50/70 rounded-xl flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">
                        Canaux de notification automatique à l&apos;employé
                      </span>
                      <p className="text-[11px] text-emerald-800/80 mt-0.5">
                        Le collaborateur recevra automatiquement sa notification officielle de revalorisation dès l&apos;enregistrement.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-xs pt-2">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-950">
                        <input
                          type="checkbox"
                          checked={formData.sendWhatsApp}
                          onChange={(e) => setFormData({ ...formData, sendWhatsApp: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>WhatsApp</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-950">
                        <input
                          type="checkbox"
                          checked={formData.sendEmail}
                          onChange={(e) => setFormData({ ...formData, sendEmail: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <Mail className="w-4 h-4 text-blue-600" />
                        <span>Email</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBMIT BAR */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="w-full sm:w-auto px-5 py-3 bg-[#F4F6F9] text-[#64748B] rounded-xl text-xs font-semibold hover:bg-slate-200/70 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.employeeId || !formData.newSalary.trim()}
                  className="w-full sm:w-auto px-7 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmer et Générer le PDF</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                Attribution de Salaire
              </h1>
              <p className="text-xs text-[#64748B] mt-1">
                Attribution, revalorisation salariale, PDF professionnel signé et notifications WhatsApp / Email.
              </p>
            </div>

            {/* Bouton Attribuer un nouveau salaire */}
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Attribuer un nouveau salaire</span>
            </button>
          </div>

          {/* Filters & Search */}
          <div className="bg-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#062653] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#FF7900]" />
                Historique des attributions salariales
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F6F9] text-[#64748B]">
                {filtered.length} enregistrement(s)
              </span>
            </div>

            <div className="w-full md:w-80 relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher employé, matricule..."
                className="w-full h-10 pl-9 pr-3.5 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder:text-[#64748B] focus:bg-white transition-all"
              />
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
            <span>Chargement des attributions de salaire...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#64748B]">
            Aucune attribution de salaire enregistrée. Cliquez sur &quot;Attribuer un nouveau salaire&quot; pour commencer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                <tr>
                  <th className="px-5 py-3.5">Réf.</th>
                  <th className="px-5 py-3.5">Employé</th>
                  <th className="px-5 py-3.5">Affectation</th>
                  <th className="px-5 py-3.5">Ancien Salaire</th>
                  <th className="px-5 py-3.5">Nouveau Salaire</th>
                  <th className="px-5 py-3.5">Date d'effet</th>
                  <th className="px-5 py-3.5">Notifications</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((req, idx) => (
                  <tr key={`${req.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4 font-bold text-[#062653] font-mono">{req.id}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#263445]">{req.employeeName}</div>
                      <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                        <span>N° {req.employeeNumber}</span>
                        {req.phone && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-mono">
                            {req.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[#263445] font-medium">{req.branch}</div>
                      <div className="text-[11px] text-[#64748B]">{req.department}</div>
                    </td>
                    <td className="px-5 py-4 text-[#64748B] font-medium line-through">
                      {req.previousSalary} {req.currency}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-extrabold text-xs">
                        {req.newSalary} {req.currency}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#263445] font-medium">{req.effectiveDate}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* WhatsApp Status Badge */}
                        {req.whatsappDirectUrl ? (
                          <a
                            href={req.whatsappDirectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                            title="Ouvrir WhatsApp avec le message prêt"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        ) : req.phone ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>WhatsApp</span>
                          </span>
                        ) : null}

                        {/* Email Status Badge */}
                        {req.email ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              req.emailSent
                                ? "text-blue-600"
                                : "text-slate-400"
                            }`}
                            title={req.emailSent ? "Email envoyé" : "Email non envoyé"}
                          >
                            <Mail className="w-3 h-3 text-blue-600" />
                            <span>{req.emailSent ? "Email envoyé" : "Email"}</span>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Download Official Signed PDF */}
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(req)}
                          disabled={isGeneratingPdf}
                          className="w-8 h-8 rounded-lg bg-[#062653] hover:bg-[#0c3977] text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                          title="Télécharger le PDF officiel signé"
                        >
                          <FileDown className="w-4 h-4 text-white shrink-0" />
                        </button>

                        {/* WhatsApp Direct Action */}
                        {req.whatsappDirectUrl && (
                          <a
                            href={req.whatsappDirectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                            title="Envoyer via WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4 text-white shrink-0" />
                          </a>
                        )}

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => setSelectedAdjustment(req)}
                          className="w-8 h-8 rounded-lg bg-[#FF7900] hover:bg-[#E66D00] text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                          title="Voir les détails"
                        >
                          <Eye className="w-4 h-4 text-white shrink-0" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDelete(req.id, req.employeeName)}
                          className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-white shrink-0" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* DETAIL MODAL */}
      {selectedAdjustment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 font-mono">
                  {selectedAdjustment.id}
                </span>
                <h2 className="text-base font-bold text-[#062653]">Détail de l'attribution salariale</h2>
              </div>
              <button
                onClick={() => setSelectedAdjustment(null)}
                className="text-[#64748B] hover:text-[#263445] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#F4F6F9] rounded-xl">
                <span className="text-[#64748B] font-semibold">Employé</span>
                <div className="font-bold text-[#263445] mt-1">{selectedAdjustment.employeeName}</div>
                <div className="text-[#64748B]">N° {selectedAdjustment.employeeNumber}</div>
              </div>

              <div className="p-3 bg-[#F4F6F9] rounded-xl">
                <span className="text-[#64748B] font-semibold">Affectation</span>
                <div className="font-bold text-[#263445] mt-1">{selectedAdjustment.branch}</div>
                <div className="text-[#64748B]">{selectedAdjustment.department}</div>
              </div>

              <div className="p-3 bg-[#F4F6F9] rounded-xl">
                <span className="text-[#64748B] font-semibold">Ancien Salaire</span>
                <div className="font-bold text-[#64748B] mt-1 line-through">
                  {selectedAdjustment.previousSalary} {selectedAdjustment.currency}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl">
                <span className="text-emerald-800 font-semibold">Nouveau Salaire Attribué</span>
                <div className="font-extrabold text-emerald-700 mt-1 text-sm">
                  {selectedAdjustment.newSalary} {selectedAdjustment.currency}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#F4F6F9] rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-[#64748B]">
                <span>Date d'effet :</span>
                <span className="font-semibold text-[#263445]">{selectedAdjustment.effectiveDate}</span>
              </div>
              <div className="flex justify-between text-[#64748B]">
                <span>Attribué par :</span>
                <span className="font-semibold text-[#263445]">{selectedAdjustment.attributedBy}</span>
              </div>
              {selectedAdjustment.phone && (
                <div className="flex justify-between text-[#64748B]">
                  <span>WhatsApp :</span>
                  <span className="font-semibold text-emerald-700">{selectedAdjustment.phone}</span>
                </div>
              )}
              {selectedAdjustment.email && (
                <div className="flex justify-between text-[#64748B]">
                  <span>Email :</span>
                  <span className="font-semibold text-blue-700">{selectedAdjustment.email}</span>
                </div>
              )}
            </div>

            {/* Signature Preview if Available */}
            {(selectedAdjustment.signatureDataUrl || signatureUrl) && (
              <div className="p-3 bg-[#F4F6F9] rounded-xl text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#062653] font-bold text-[11px] flex items-center gap-1.5">
                    <FileSignature className="w-3.5 h-3.5 text-[#062653]" />
                    Signature officielle de la Direction :
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold">Apposée sur le PDF</span>
                </div>
                <div className="h-16 bg-white rounded-lg shadow-2xs flex items-center justify-center p-1 overflow-hidden">
                  <img
                    src={selectedAdjustment.signatureDataUrl || signatureUrl}
                    alt="Signature Direction"
                    className="max-h-full max-w-[200px] object-contain"
                  />
                </div>
              </div>
            )}

            <div>
              <span className="text-xs font-semibold text-[#64748B] block mb-1">
                Motif de la décision :
              </span>
              <div className="p-3 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] leading-relaxed">
                {selectedAdjustment.reason}
              </div>
            </div>

            {/* Bottom Modal Actions */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                {/* Download PDF button */}
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedAdjustment)}
                  disabled={isGeneratingPdf}
                  className="px-3 py-1.5 bg-[#062653] hover:bg-[#0c3977] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Télécharger PDF</span>
                </button>

                {/* Print button */}
                <button
                  type="button"
                  onClick={() => handlePrintPdf(selectedAdjustment)}
                  disabled={isGeneratingPdf}
                  className="px-2.5 py-1.5 bg-[#F4F6F9] hover:bg-slate-200 text-[#062653] text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Imprimer"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>

                {selectedAdjustment.phone && (
                  <button
                    type="button"
                    onClick={() => handleResend(selectedAdjustment.id, "whatsapp")}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                )}
                {selectedAdjustment.email && (
                  <button
                    type="button"
                    onClick={() => handleResend(selectedAdjustment.id, "email")}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedAdjustment(null)}
                className="px-4 py-1.5 bg-[#F4F6F9] hover:bg-slate-200 text-[#263445] text-xs font-bold rounded-lg cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS & NOTIFICATION MODAL */}
      {notificationResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fadeIn text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#062653]">
                Nouveau Salaire Attribué avec Succès !
              </h3>
              <p className="text-xs text-[#64748B] mt-1">
                La rémunération de <strong>{notificationResult.employeeName}</strong> a été enregistrée avec visa officiel.
              </p>
            </div>

            {/* Direct Download Signed PDF Action Button */}
            {notificationResult.adjustment && (
              <button
                type="button"
                onClick={() => handleDownloadPdf(notificationResult.adjustment!)}
                disabled={isGeneratingPdf}
                className="w-full py-2.5 px-4 bg-[#062653] hover:bg-[#0c3977] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FileDown className="w-4 h-4 text-emerald-400" />
                <span>Télécharger la Notification Officielle (PDF Pro)</span>
              </button>
            )}

            <div className="p-3 bg-[#F4F6F9] rounded-xl text-xs text-left space-y-2">
              {notificationResult.email && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[#64748B]">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    Email ({notificationResult.email}) :
                  </span>
                  <span className="font-bold text-emerald-700">
                    {notificationResult.emailSent ? "Transmis ✓" : "Programmé"}
                  </span>
                </div>
              )}

              {notificationResult.phone && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[#64748B]">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    WhatsApp ({notificationResult.phone}) :
                  </span>
                  <span className="font-bold text-emerald-700">
                    Prêt
                  </span>
                </div>
              )}
            </div>

            {/* Direct WhatsApp Action Link */}
            {notificationResult.whatsappDirectUrl && (
              <a
                href={notificationResult.whatsappDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Ouvrir WhatsApp pour confirmer l'envoi</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            )}

            <button
              type="button"
              onClick={() => setNotificationResult(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-[#263445] font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
