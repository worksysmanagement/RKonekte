"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  PlusCircle,
  Eye,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

import { EmployeeLeaveView } from "@/components/requests/EmployeeLeaveView";
import { Check, X } from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";

interface RequestItem {
  id: string;
  requestNumber: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: string;
  position: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  status: string;
  submittedAt: number;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rk_active_branch");
      if (saved && saved !== "all") return saved;
    }
    return "all";
  });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
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

    fetch("/api/admin/branches")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.branches) setBranches(d.branches);
      })
      .catch(() => {});

    fetch("/api/admin/employees")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.employees || [];
        setEmployees(list);
      })
      .catch(() => {});

    const handleBranchChange = (e: any) => {
      const bId = e.detail?.branchId;
      if (bId !== undefined) {
        setActiveBranchId(bId);
      }
    };
    window.addEventListener("branchChange", handleBranchChange);
    return () => window.removeEventListener("branchChange", handleBranchChange);
  }, []);

  const isEmployee =
    currentUserRole === "EMPLOYEE" ||
    currentUserRole === "COLLABORATEUR" ||
    currentUserRole === "CASHIER" ||
    currentUserRole === "CAISSIER" ||
    currentUserRole?.toLowerCase().includes("employ") ||
    currentUserRole?.toLowerCase().includes("collab") ||
    currentUserRole?.toLowerCase().includes("caissier") ||
    currentUserRole?.toLowerCase().includes("cashier") ||
    currentUserRole?.toLowerCase().includes("operat");

  const isMasterAccount =
    currentUserRole === "ORGANIZATION_ADMIN" ||
    currentUserRole === "SUPER_ADMIN" ||
    currentUserRole?.toLowerCase().includes("pdg") ||
    currentUserRole?.toLowerCase().includes("fondateur") ||
    currentUserRole?.toLowerCase().includes("directeur général") ||
    currentUserRole?.toLowerCase().includes("propriétaire");

  const activeBranchObj = branches.find((b) => b.id === activeBranchId) || null;

  const filteredRequests = requests.filter((r) => {
    if (activeBranchId === "all" || activeBranchId === "ALL") return true;
    const brObj = branches.find((b) => b.id === activeBranchId);
    const emp = employees.find((e) => e.employeeNumber === r.employeeNumber);
    if (emp && emp.branchId) {
      return emp.branchId === activeBranchId;
    }
    if ((r as any).branch) {
      return (
        (r as any).branch === activeBranchId ||
        (brObj && (r as any).branch === brObj.name) ||
        (brObj?.name && (r as any).branch?.toLowerCase().includes(brObj.name.toLowerCase()))
      );
    }
    return true;
  });

  const fetchRequests = async (p = page, s = statusFilter, q = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", p.toString());
      params.set("limit", "10");
      if (s !== "ALL") params.set("status", s);
      if (q.trim()) params.set("search", q.trim());

      const res = await fetch(`/api/admin/requests?${params.toString()}`);
      const data = await res.json();

      if (data.items) {
        setRequests(data.items);
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(1, statusFilter, searchTerm);
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequests(1, statusFilter, searchTerm);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchRequests(newPage, statusFilter, searchTerm);
    }
  };

  const handleDelete = async (id: string, requestNumber: string, status?: string) => {
    const isApproved = status === "APPROVED";
    const confirmMessage = isApproved
      ? `Êtes-vous sûr de vouloir retirer la demande approuvée N° ${requestNumber} de votre espace d'administration pour libérer votre espace ?\n\nRemarque importante : Elle ne sera PAS supprimée pour le collaborateur et restera APPROUVÉE et certifiée dans son dossier.`
      : `Êtes-vous sûr de vouloir supprimer la demande N° ${requestNumber} ?\nElle sera enregistrée comme REFUSÉE pour le collaborateur.`;

    if (!confirm(confirmMessage)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Impossible de supprimer la demande.", "error");
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      showSystemToast(
        isApproved
          ? `La demande approuvée N° ${requestNumber} a été retirée de l'administration (reste validée pour le collaborateur).`
          : `La demande N° ${requestNumber} a été supprimée (enregistrée comme refusée pour le collaborateur).`
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("rkonekte_notification_update"));
      }
    } catch (err) {
      showSystemToast("Erreur réseau lors de la suppression.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (currentUserRole === null) {
    return (
      <div className="p-16 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-[#FF7900] rounded-full animate-spin" />
        <span>Chargement de votre espace...</span>
      </div>
    );
  }

  // Si collaborateur / employé : Interface directe de soumission & suivi personnel
  if (isEmployee) {
    return <EmployeeLeaveView />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
              Demandes de congé
            </h1>
            {activeBranchObj && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800">
                {activeBranchObj.name} ({activeBranchObj.city})
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            {activeBranchObj
              ? `Demandes de congé filtrées pour la succursale ${activeBranchObj.name} (${filteredRequests.length} trouvée(s)).`
              : `Consultez, recherchez et traitez les demandes de congé (${total} au total).`}
          </p>
        </div>

        {/* Bouton Nouvelle Demande de Congé (Vert, mais grisé/désactivé pour le compte Maître/PDG) */}
        <div className="relative group">
          <button
            type="button"
            disabled={isMasterAccount}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 self-start ${
              isMasterAccount
                ? "bg-slate-200 text-slate-400 cursor-not-allowed select-none"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nouvelle demande de congé</span>
          </button>
          {isMasterAccount && (
            <div className="hidden group-hover:block absolute right-0 top-full mt-1.5 w-72 p-2.5 bg-[#031B3A] text-white text-[11px] rounded-lg shadow-xl z-50 pointer-events-none">
              Compte Direction / Maître : Vous détenez l'autorité suprême de validation et ne formulez pas de demande pour vous-même.
            </div>
          )}
        </div>
      </div>

      {/* FILTERS & SEARCH BAR */}
      <div className="bg-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "ALL", label: "Toutes" },
            { id: "PENDING", label: "En attente" },
            { id: "APPROVED", label: "Approuvées" },
            { id: "REJECTED", label: "Refusées" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                statusFilter === tab.id
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200/80 hover:text-[#263445]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="w-full md:w-80 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher (nom, N° demande)..."
            className="w-full h-10 pl-9 pr-3.5 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder:text-[#64748B] focus:bg-white transition-all"
          />
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
        </form>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#64748B] text-xs">Chargement des demandes...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#64748B]">
            Aucune demande trouvée avec les critères actuels.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                <tr>
                  <th className="px-5 py-3.5">N° Demande</th>
                  <th className="px-5 py-3.5">Employé</th>
                  <th className="px-5 py-3.5">Département & Poste</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Période</th>
                  <th className="px-5 py-3.5">Jours</th>
                  <th className="px-5 py-3.5">Statut</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req, idx) => (
                  <tr key={`${req.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4 font-bold text-[#062653]">
                      {req.requestNumber}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#263445]">
                        {req.firstName} {req.lastName}
                      </div>
                      <div className="text-[11px] text-[#64748B]">N° {req.employeeNumber}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[#263445] font-medium">{req.department}</div>
                      <div className="text-[11px] text-[#64748B]">{req.position}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-2.5 py-1 bg-[#F4F6F9] rounded-md text-[11px] font-semibold text-[#263445]">
                        {req.leaveType === "ANNUAL"
                          ? "Annuel"
                          : req.leaveType === "SICK"
                          ? "Maladie"
                          : req.leaveType === "UNPAID"
                          ? "Sans solde"
                          : req.leaveType === "MATERNITY_PATERNITY"
                          ? "Maternité/Paternité"
                          : "Autre"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#263445]">
                      <div className="font-medium">
                        {req.startDate} → {req.endDate}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-bold text-[#062653]">
                      {req.requestedDays} j
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={req.status} size="sm" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/requests/${req.id}`}
                          className="px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white flex items-center gap-1.5 text-xs font-semibold transition-all shadow-xs"
                          title="Voir la feuille de demande"
                        >
                          <Eye className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>Voir</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(req.id, req.requestNumber, req.status)}
                          disabled={deletingId === req.id}
                          className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer disabled:opacity-50"
                          title={
                            req.status === "APPROVED"
                              ? "Retirer de l'espace administration (reste approuvée pour le collaborateur)"
                              : "Supprimer la demande"
                          }
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

        {/* PAGINATION */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
            <div>
              Page {page} sur {totalPages} ({total} résultats)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="p-1.5 bg-[#F4F6F9] rounded-lg hover:bg-slate-200/70 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 bg-[#F4F6F9] rounded-lg hover:bg-slate-200/70 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
