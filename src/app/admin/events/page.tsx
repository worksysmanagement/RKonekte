"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Bell,
  CheckCircle2,
  AlertCircle,
  Filter,
  Building,
  UserCheck,
  Briefcase,
  Layers,
  Trash2,
  Search,
  Mail,
} from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { showSystemToast } from "@/components/ui/SystemToast";

export interface EmployeeProfile {
  id?: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: string;
  position: string;
  branchId?: string | null;
  branch: string;
  email?: string;
}

export interface SystemBranch {
  id: string;
  name: string;
  city: string;
  status?: string;
}

export interface SystemEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department?: string | null;
  position?: string | null;
  branchId?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
}

export type EventType =
  | "MEETING"
  | "TRAINING"
  | "HOLIDAY"
  | "ANNOUNCEMENT"
  | "WORKSHOP"
  | "PERSONAL";

export type PersonalCategory =
  | "RDV"
  | "REMINDER"
  | "TASK"
  | "ADMIN_STEP"
  | "PERSONAL_LEAVE"
  | "OTHER";

const PERSONAL_CATEGORY_LABELS: Record<PersonalCategory, string> = {
  RDV: "Rendez-vous personnel",
  REMINDER: "Rappel / Mémo",
  TASK: "Tâche personnelle",
  ADMIN_STEP: "Démarche administrative",
  PERSONAL_LEAVE: "Congé / Absence personnelle",
  OTHER: "Autre événement personnel",
};

export type AudienceType =
  | "ALL_EMPLOYEES"
  | "DEPARTMENT"
  | "BRANCH"
  | "CUSTOM";

export interface ScheduledEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  type: EventType;
  location: string;
  audienceType?: AudienceType;
  audienceTargetName?: string;
  audienceBranchId?: string;
  targetEmployeeIds?: string[];
  notifyImmediate?: boolean;
  reminder24h?: boolean;
  isPersonal?: boolean;
  personalCategory?: PersonalCategory;
  creatorUserId?: string;
  creatorEmployeeId?: string;
  creatorEmployeeNumber?: string;
  creatorName?: string;
  recipientsCount?: number;
  emailsSentCount?: number;
  emailsFailedCount?: number;
  createdAt: string;
}

const TYPE_CONFIG: Record<
  EventType,
  { label: string; bg: string; text: string; dot: string }
> = {
  MEETING: {
    label: "Réunion",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-600",
  },
  TRAINING: {
    label: "Formation",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-600",
  },
  HOLIDAY: {
    label: "Férié / Congé",
    bg: "bg-amber-50 text-amber-800 border-amber-200",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  ANNOUNCEMENT: {
    label: "Annonce générale",
    bg: "bg-purple-50 text-purple-700 border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-600",
  },
  WORKSHOP: {
    label: "Atelier de travail",
    bg: "bg-cyan-50 text-cyan-700 border-cyan-200",
    text: "text-cyan-700",
    dot: "bg-cyan-600",
  },
  PERSONAL: {
    label: "Personnel",
    bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
    text: "text-indigo-700",
    dot: "bg-indigo-600",
  },
};

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  ALL_EMPLOYEES: "Tous les employés",
  DEPARTMENT: "Par département",
  BRANCH: "Par succursale",
  CUSTOM: "Employés ciblés",
};

const STORAGE_KEY = "rkonekte_scheduled_events";

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

export default function EventsCalendarPage() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(
    today.toISOString().split("T")[0]
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // User role & profile
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(() => getCachedProfile());
  const [loadingUser, setLoadingUser] = useState(true);

  // Events list + Company directory (branches & employees)
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [branches, setBranches] = useState<SystemBranch[]>([]);
  const [systemEmployees, setSystemEmployees] = useState<SystemEmployee[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  useEffect(() => {
    // 1. Get user role
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.id) {
          setCurrentUserId(data.user.id);
        }
        if (data.user?.role) {
          setCurrentUserRole(data.user.role);
        } else {
          setCurrentUserRole("EMPLOYEE");
        }
      })
      .catch(() => setCurrentUserRole("EMPLOYEE"))
      .finally(() => setLoadingUser(false));

    // 2. Get employee profile for the institutional collaborator header
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
      .catch(() => {});

    // 3. Load events from backend API (database-backed, fallback to localStorage if needed)
    fetch("/api/admin/events")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.events && Array.isArray(data.events)) {
          setEvents(data.events);
        } else {
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) setEvents(parsed);
            }
          } catch (_) {}
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setEvents(parsed);
          }
        } catch (_) {}
      });
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

  const isAdmin = !isEmployee && currentUserRole !== null;

  // Fetch company branches & all employees for Admin audience selection
  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;
    setLoadingDirectory(true);
    Promise.all([
      fetch("/api/admin/branches").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/employees").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([branchData, empData]) => {
        if (!isMounted) return;
        if (Array.isArray(branchData?.branches)) {
          setBranches(branchData.branches);
        }
        const rawEmps = Array.isArray(empData)
          ? empData
          : Array.isArray(empData?.employees)
          ? empData.employees
          : [];
        setSystemEmployees(rawEmps);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingDirectory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  // Filter events:
  // 1. Personal events are strictly private to the user who created them
  // 2. Enterprise events: Admin sees all; Collaborators see events for ALL_EMPLOYEES or targeted to their dept/branch/ID
  const visibleEvents = useMemo(() => {
    return events.filter((ev) => {
      // Personal event check
      if (ev.isPersonal || ev.type === "PERSONAL") {
        if (ev.creatorUserId && currentUserId && ev.creatorUserId === currentUserId) {
          return true;
        }
        if (ev.creatorEmployeeId && profile?.id && ev.creatorEmployeeId === profile.id) {
          return true;
        }
        if (!profile?.employeeNumber && !ev.creatorEmployeeNumber && !ev.creatorUserId) {
          return true;
        }
        return (
          Boolean(profile?.employeeNumber) &&
          ev.creatorEmployeeNumber === profile?.employeeNumber
        );
      }

      // Enterprise / Administration event check
      if (isAdmin) {
        return true;
      }
      if (!ev.audienceType || ev.audienceType === "ALL_EMPLOYEES") return true;
      if (ev.audienceType === "DEPARTMENT") {
        if (!profile?.department || !ev.audienceTargetName) return false;
        return (
          profile.department.trim().toLowerCase() ===
          ev.audienceTargetName.trim().toLowerCase()
        );
      }
      if (ev.audienceType === "BRANCH") {
        if (ev.audienceBranchId && profile?.branchId) {
          return ev.audienceBranchId === profile.branchId;
        }
        if (!profile?.branch || !ev.audienceTargetName) return false;
        return (
          profile.branch.trim().toLowerCase() ===
          ev.audienceTargetName.trim().toLowerCase()
        );
      }
      if (ev.audienceType === "CUSTOM") {
        return Boolean(
          profile?.id &&
            Array.isArray(ev.targetEmployeeIds) &&
            ev.targetEmployeeIds.includes(profile.id)
        );
      }
      return false;
    });
  }, [events, isAdmin, profile, currentUserId]);

  // Modal form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(
    today.toISOString().split("T")[0]
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [type, setType] = useState<EventType>("MEETING");
  const [personalCategory, setPersonalCategory] =
    useState<PersonalCategory>("RDV");
  const [location, setLocation] = useState("");
  const [audienceType, setAudienceType] =
    useState<AudienceType>("ALL_EMPLOYEES");
  const [audienceTargetName, setAudienceTargetName] = useState("");
  const [audienceBranchId, setAudienceBranchId] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [notifyImmediate, setNotifyImmediate] = useState(true);
  const [reminder24h, setReminder24h] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived active employees & branch map
  const activeEmployees = useMemo(() => {
    return [...systemEmployees]
      .filter((e) => e.status !== "INACTIVE")
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
          "fr"
        )
      );
  }, [systemEmployees]);

  const branchNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) {
      map.set(b.id, b.name);
    }
    return map;
  }, [branches]);

  const filteredDirectoryEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter((emp) => {
      const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const bName = (emp.branchId ? branchNameMap.get(emp.branchId) : "") || "";
      return (
        fullName.includes(q) ||
        (emp.employeeNumber || "").toLowerCase().includes(q) ||
        (emp.email || "").toLowerCase().includes(q) ||
        (emp.department || "").toLowerCase().includes(q) ||
        bName.toLowerCase().includes(q)
      );
    });
  }, [activeEmployees, employeeSearch, branchNameMap]);

  const activeWithEmailCount = useMemo(() => {
    return activeEmployees.filter(
      (e) => Boolean(e.email && e.email.trim().includes("@"))
    ).length;
  }, [activeEmployees]);

  const selectedBranchEmployees = useMemo(() => {
    if (!audienceBranchId) return [];
    return activeEmployees.filter((e) => e.branchId === audienceBranchId);
  }, [activeEmployees, audienceBranchId]);

  const selectedBranchWithEmailCount = useMemo(() => {
    return selectedBranchEmployees.filter(
      (e) => Boolean(e.email && e.email.trim().includes("@"))
    ).length;
  }, [selectedBranchEmployees]);

  const toggleEmployeeSelection = (empId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  // Month navigation
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDate(today.toISOString().split("T")[0]);
  };

  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  const daysOfWeek = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  // Calendar math
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const currentMonthStr = String(currentMonth + 1).padStart(2, "0");

  // Calendar cells
  const calendarCells = useMemo(() => {
    const cells: {
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: ScheduledEvent[];
    }[] = [];

    // Prev month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: false,
        events: visibleEvents.filter((e) => e.date === dateStr),
      });
    }

    // Current month days
    const todayStr = today.toISOString().split("T")[0];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(
        2,
        "0"
      )}-${String(d).padStart(2, "0")}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        events: visibleEvents.filter((e) => e.date === dateStr),
      });
    }

    // Next month leading days to complete grid (multiples of 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: false,
        events: visibleEvents.filter((e) => e.date === dateStr),
      });
    }

    return cells;
  }, [currentYear, currentMonth, daysInMonth, firstDayIndex, daysInPrevMonth, visibleEvents]);

  // Selected date events
  const selectedDateEvents = useMemo(() => {
    return visibleEvents.filter((e) => e.date === selectedDate);
  }, [visibleEvents, selectedDate]);


  // Submit handler: Supports both Administrative Events (DB + Email) and Personal Events (DB)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventDate || isSubmitting) return;

    if (isAdmin) {
      if (audienceType === "BRANCH" && !audienceBranchId) {
        showSystemToast("Veuillez sélectionner une succursale destinataire.", "error");
        return;
      }
      if (audienceType === "CUSTOM" && selectedEmployeeIds.length === 0) {
        showSystemToast("Veuillez sélectionner au moins un employé dans la liste.", "error");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const selectedBranchObj = branches.find((b) => b.id === audienceBranchId);

      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isAdmin
            ? {
                title: title.trim(),
                description: description.trim(),
                date: eventDate,
                startTime: startTime || "09:00",
                endTime: endTime || "10:00",
                type,
                location: location.trim() || "Bureaux de l'entreprise",
                audienceType,
                audienceBranchId:
                  audienceType === "BRANCH" ? audienceBranchId : undefined,
                audienceTargetName:
                  audienceType === "BRANCH"
                    ? selectedBranchObj?.name || audienceTargetName.trim()
                    : undefined,
                targetEmployeeIds:
                  audienceType === "CUSTOM" ? selectedEmployeeIds : undefined,
                notifyImmediate,
                reminder24h,
                isPersonal: false,
              }
            : {
                title: title.trim(),
                description: description.trim(),
                date: eventDate,
                startTime: startTime || "09:00",
                endTime: endTime || "10:00",
                type: "PERSONAL",
                personalCategory,
                location: location.trim() || "Personnel",
                reminder24h,
                isPersonal: true,
              }
        ),
      });

      const data = await res.json();
      if (!res.ok || !data?.event) {
        showSystemToast(
          data?.error || "Impossible d'enregistrer l'événement.",
          "error"
        );
        return;
      }

      const created: ScheduledEvent = data.event;
      const updated = [created, ...events];
      setEvents(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}

      setSelectedDate(eventDate);
      setIsModalOpen(false);

      // Reset fields
      setTitle("");
      setDescription("");
      setLocation("");
      setAudienceTargetName("");
      setAudienceBranchId("");
      setSelectedEmployeeIds([]);
      setEmployeeSearch("");
      setPersonalCategory("RDV");

      if (isAdmin) {
        const stats = data.emailStats || {};
        if (notifyImmediate) {
          if (stats.sent > 0) {
            showSystemToast(
              `Événement « ${created.title} » programmé ! ${stats.sent} e-mail(s) envoyé(s) sur ${stats.totalTargeted} employé(s) ciblé(s).`
            );
          } else if (stats.totalTargeted === 0) {
            showSystemToast(
              `Événement « ${created.title} » enregistré (aucun employé actif trouvé pour cette cible).`
            );
          } else {
            showSystemToast(
              `Événement « ${created.title} » enregistré (aucune adresse e-mail valide disponible pour l'envoi).`
            );
          }
        } else {
          showSystemToast(`Événement « ${created.title} » programmé dans le calendrier !`);
        }
      } else {
        showSystemToast(
          `Événement personnel « ${created.title} » enregistré dans votre calendrier privé !`
        );
      }
    } catch (err) {
      console.error("Create event failed:", err);
      showSystemToast("Erreur réseau lors de l'enregistrement de l'événement.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const evToDelete = events.find((ev) => ev.id === id);
    if (!evToDelete) return;

    const isOwner =
      evToDelete.isPersonal &&
      ((evToDelete.creatorUserId && evToDelete.creatorUserId === currentUserId) ||
        (evToDelete.creatorEmployeeId && profile?.id && evToDelete.creatorEmployeeId === profile.id) ||
        (Boolean(profile?.employeeNumber) &&
          evToDelete.creatorEmployeeNumber === profile?.employeeNumber));
    if (!isAdmin && !isOwner) {
      alert("Vous n'êtes pas autorisé à supprimer cet événement.");
      return;
    }

    if (
      !confirm(
        evToDelete.isPersonal
          ? "Supprimer cet événement personnel ?"
          : "Voulez-vous supprimer cet événement officiel ?"
      )
    )
      return;

    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showSystemToast(
          errData?.error || "Impossible de supprimer cet événement.",
          "error"
        );
        return;
      }
    } catch (_) {}

    const updated = events.filter((ev) => ev.id !== id);
    setEvents(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
    showSystemToast("Événement supprimé avec succès.");
  };

  const openModalForDate = (dateStr: string) => {
    setEventDate(dateStr);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar: Distinct for Non-Administrative vs Administrative Accounts */}
      {loadingUser ? (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 animate-pulse flex items-center justify-between">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-6 bg-slate-200 rounded w-1/4" />
        </div>
      ) : isEmployee ? (
        /* Profil Header Collaborateur (Harmonisé avec Congés / Salaires / Signatures) */
        <div className="bg-white rounded-2xl p-5 border border-[#DCE2EA] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
              Mon Espace Événements
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Consultez les réunions d'équipe, formations et événements officiels de l'entreprise.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
        </div>
      ) : (
        /* Header Bar Administration */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#031B3A]">
                Événements & Calendrier d'Entreprise
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-[#031B3A]/10 text-[#031B3A]">
                Planification de l'administration
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Programmez des réunions, formations ou annonces officielles et diffusez les notifications aux employés ciblés.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEventDate(selectedDate);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
            title="Planification de l'administration"
          >
            <Plus className="w-4 h-4" />
            Planification de l'administration
          </button>
        </div>
      )}

      {/* Main Grid: Calendar on Left, Upcoming / Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Calendar (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Calendar Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#031B3A] text-white flex items-center justify-center shadow-xs">
                <img
                  src="/icons/sidebar/calendar-white.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain"
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#031B3A]">
                  {monthNames[currentMonth]} {currentYear}
                </h2>
                <p className="text-xs text-slate-500">
                  {events.filter((e) => e.date.startsWith(`${currentYear}-${currentMonthStr}`)).length} événement(s) ce mois-ci
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-xs transition-colors"
              >
                Aujourd'hui
              </button>
              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-xs">
                <button
                  onClick={prevMonth}
                  className="p-1.5 hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Mois précédent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-slate-200" />
                <button
                  onClick={nextMonth}
                  className="p-1.5 hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Mois suivant"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/70 text-center text-xs font-bold text-slate-600 py-2.5">
            {daysOfWeek.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr flex-1 bg-slate-200 gap-px">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDate;
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={`min-h-[92px] p-1.5 sm:p-2 bg-white flex flex-col justify-between transition-colors cursor-pointer group relative ${
                    !cell.isCurrentMonth ? "bg-slate-50/70 text-slate-400" : "text-slate-800"
                  } ${isSelected ? "ring-2 ring-inset ring-[#031B3A] bg-blue-50/30" : "hover:bg-slate-50"}`}
                >
                    {/* Day number & Quick add (Admin only) */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          cell.isToday
                            ? "bg-[#031B3A] text-white font-bold"
                            : isSelected
                            ? "bg-slate-200 text-[#031B3A] font-bold"
                            : ""
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModalForDate(cell.dateStr);
                          }}
                          title="Planification de l'administration"
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#031B3A] p-0.5 rounded hover:bg-slate-200/60 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModalForDate(cell.dateStr);
                          }}
                          title="Planifier un événement perso"
                          className="opacity-0 group-hover:opacity-100 text-[#FF7900] hover:text-[#062653] p-0.5 rounded hover:bg-orange-50 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                  {/* Event pills in day cell */}
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {cell.events.slice(0, 2).map((ev) => {
                      const cfg = TYPE_CONFIG[ev.type];
                      return (
                        <div
                          key={ev.id}
                          title={`${ev.startTime} - ${ev.title} (${
                            ev.isPersonal
                              ? "Personnel"
                              : ev.audienceType
                              ? AUDIENCE_LABELS[ev.audienceType]
                              : "Général"
                          })`}
                          className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium border ${cfg.bg}`}
                        >
                          <span className="font-semibold">{ev.startTime}</span> {ev.title}
                        </div>
                      );
                    })}
                    {cell.events.length > 2 && (
                      <div className="text-[10px] text-slate-500 font-semibold px-1">
                        +{cell.events.length - 2} autre(s)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Légende :</span>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <span>{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Selected Date Details & Upcoming Events (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Selected Date Box */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="pb-3 border-b border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Journée sélectionnée
              </span>
              <h3 className="text-base font-bold text-[#031B3A]">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                  "fr-FR",
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }
                )}
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm space-y-2">
                  <CalendarIcon className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                  <p className="text-xs text-slate-500">
                    Aucun événement programmé pour cette journée.
                  </p>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => openModalForDate(selectedDate)}
                      className="inline-flex items-center gap-1.5 mx-auto mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[#031B3A] hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Planification de l'administration
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openModalForDate(selectedDate)}
                      className="inline-flex items-center gap-1.5 mx-auto mt-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[#062653] hover:bg-slate-100 border border-[#DCE2EA]"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#FF7900]" />
                      Planifier un événement perso
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {selectedDateEvents.map((ev) => {
                  const cfg = TYPE_CONFIG[ev.type];
                  return (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:shadow-xs transition-all space-y-2 relative group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${cfg.bg}`}
                        >
                          {cfg.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {ev.startTime} - {ev.endTime}
                            </span>
                          </div>
                          {(isAdmin ||
                            (ev.isPersonal &&
                              ev.creatorEmployeeNumber ===
                                profile?.employeeNumber)) && (
                            <button
                              onClick={(e) => handleDeleteEvent(ev.id, e)}
                              title="Supprimer l'événement"
                              className="w-6 h-6 rounded-md bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-xs opacity-0 group-hover:opacity-100 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-white" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-slate-800">
                        {ev.title}
                      </h4>

                      {ev.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {ev.description}
                        </p>
                      )}

                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1 font-medium text-slate-700">
                          {ev.isPersonal ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-indigo-700 font-semibold">
                                {ev.personalCategory
                                  ? PERSONAL_CATEGORY_LABELS[ev.personalCategory]
                                  : "Événement personnel (Privé)"}
                              </span>
                            </>
                          ) : (
                            <>
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {ev.audienceType === "ALL_EMPLOYEES"
                                  ? "Tous les employés"
                                  : ev.audienceTargetName ||
                                    (ev.audienceType
                                      ? AUDIENCE_LABELS[ev.audienceType]
                                      : "Général")}
                              </span>
                            </>
                          )}
                        </div>
                        {ev.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[150px]">
                              {ev.location}
                            </span>
                          </div>
                        )}
                        {isAdmin && !ev.isPersonal && (ev.emailsSentCount ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <Mail className="w-3 h-3 text-emerald-600" />
                            <span>{ev.emailsSentCount} e-mail(s)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 text-center border-t border-slate-100">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => openModalForDate(selectedDate)}
                      className="inline-flex items-center gap-1.5 mx-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[#031B3A] hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Planification de l'administration
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openModalForDate(selectedDate)}
                      className="inline-flex items-center gap-1.5 mx-auto text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[#062653] hover:bg-slate-100 border border-[#DCE2EA]"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#FF7900]" />
                      Planifier un événement perso
                    </button>
                  )}
                </div>
              </>
            )}
            </div>
          </div>


        </div>
      </div>

      {/* SLIDE-OVER: Planification d'Événement (Admin: Planification de l'administration | Collaborateur: Événement Personnel) */}
      <SlideOver
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          isAdmin
            ? "Planification de l'administration"
            : "Planifier un événement personnel"
        }
        subtitle={
          isAdmin
            ? "Définissez l'événement officiel et les employés à alerter"
            : "Événement privé — visible uniquement par vous dans votre calendrier"
        }
        icon={
          isAdmin ? (
            <CalendarIcon className="w-5 h-5 text-[#062653]" />
          ) : (
            <UserCheck className="w-5 h-5 text-[#114C5A]" />
          )
        }
        width="xl"
      >
        <form onSubmit={handleCreateEvent} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {isAdmin
                    ? "Titre de l'événement officiel"
                    : "Titre de l'événement personnel"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    isAdmin
                      ? "Ex : Réunion générale d'entreprise, Formation RH..."
                      : "Ex : Rendez-vous médical, Démarche administrative, Rappel..."
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                    isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                  }`}
                />
              </div>

              {/* Type & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {isAdmin ? "Type d'événement" : "Catégorie personnelle"}
                  </label>
                  {isAdmin ? (
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as EventType)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#031B3A]"
                    >
                      <option value="MEETING">Réunion d'équipe / Direction</option>
                      <option value="TRAINING">Formation interne / externe</option>
                      <option value="HOLIDAY">Férié / Congé collectif</option>
                      <option value="ANNOUNCEMENT">Annonce officielle</option>
                      <option value="WORKSHOP">Atelier de travail</option>
                    </select>
                  ) : (
                    <select
                      value={personalCategory}
                      onChange={(e) =>
                        setPersonalCategory(e.target.value as PersonalCategory)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114C5A]"
                    >
                      <option value="RDV">Rendez-vous personnel</option>
                      <option value="REMINDER">Rappel / Mémo</option>
                      <option value="TASK">Tâche personnelle</option>
                      <option value="ADMIN_STEP">Démarche administrative</option>
                      <option value="PERSONAL_LEAVE">
                        Congé / Absence personnelle
                      </option>
                      <option value="OTHER">Autre événement personnel</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                      isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                    }`}
                  />
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Heure de début
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                      isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Heure de fin
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                      isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                    }`}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {isAdmin
                    ? "Lieu ou Lien de visioconférence"
                    : "Lieu ou Détail (Optionnel)"}
                </label>
                <input
                  type="text"
                  placeholder={
                    isAdmin
                      ? "Ex : Salle de conférence A ou Lien Zoom/Meet"
                      : "Ex : Cabinet, Domicile, Bureau..."
                  }
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                    isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                  }`}
                />
              </div>

              {/* ADMINISTRATION ONLY: AUDIENCE & BROADCAST ALERTS */}
              {isAdmin && (
                <>
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-[#031B3A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#114C5A]" />
                      Employés ciblés / Destinataires de l'alerte
                    </label>

                    <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      {/* 1. Tous les employés */}
                      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="audienceType"
                          checked={audienceType === "ALL_EMPLOYEES"}
                          onChange={() => setAudienceType("ALL_EMPLOYEES")}
                          className="mt-1 text-[#031B3A] focus:ring-[#031B3A]"
                        />
                        <div className="flex-1">
                          <span className="font-semibold text-slate-800">
                            Tous les employés du système
                          </span>
                          <p className="text-xs text-slate-500">
                            Notification et e-mail envoyés à tous les employés actifs enregistrés
                          </p>
                          {audienceType === "ALL_EMPLOYEES" && (
                            <div className="mt-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs flex flex-wrap items-center gap-2">
                              <Mail className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-slate-700">
                                {activeEmployees.length} employé(s) actif(s)
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-emerald-700 font-semibold">
                                {activeWithEmailCount} avec adresse e-mail enregistrée
                              </span>
                            </div>
                          )}
                        </div>
                      </label>

                      {/* 2. Par succursale */}
                      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="audienceType"
                          checked={audienceType === "BRANCH"}
                          onChange={() => setAudienceType("BRANCH")}
                          className="mt-1 text-[#031B3A] focus:ring-[#031B3A]"
                        />
                        <div>
                          <span className="font-semibold text-slate-800">
                            Par succursale
                          </span>
                          <p className="text-xs text-slate-500">
                            Choisissez la succursale : tous ses employés recevront cette planification
                          </p>
                        </div>
                      </label>

                      {audienceType === "BRANCH" && (
                        <div className="pl-6 space-y-2">
                          <select
                            required
                            value={audienceBranchId}
                            onChange={(e) => {
                              const bId = e.target.value;
                              setAudienceBranchId(bId);
                              const bObj = branches.find((b) => b.id === bId);
                              setAudienceTargetName(bObj?.name || "");
                            }}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#031B3A] cursor-pointer"
                          >
                            <option value="">
                              {loadingDirectory
                                ? "Chargement des succursales..."
                                : "Sélectionner une succursale..."}
                            </option>
                            {branches.map((b) => {
                              const count = activeEmployees.filter(
                                (emp) => emp.branchId === b.id
                              ).length;
                              return (
                                <option key={b.id} value={b.id}>
                                  {b.name} — {b.city} ({count} employé{count > 1 ? "s" : ""})
                                </option>
                              );
                            })}
                          </select>

                          {audienceBranchId && (
                            <div
                              className={`px-3 py-2 rounded-lg border text-xs flex flex-wrap items-center gap-2 ${
                                selectedBranchEmployees.length > 0
                                  ? "bg-white border-slate-200 text-slate-700"
                                  : "bg-amber-50 border-amber-200 text-amber-800"
                              }`}
                            >
                              <Mail
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  selectedBranchWithEmailCount > 0
                                    ? "text-emerald-600"
                                    : "text-amber-600"
                                }`}
                              />
                              {selectedBranchEmployees.length > 0 ? (
                                <span>
                                  <strong>{selectedBranchEmployees.length}</strong> employé(s) rattaché(s) •{" "}
                                  <strong className="text-emerald-700">
                                    {selectedBranchWithEmailCount} adresse(s) e-mail à notifier
                                  </strong>
                                </span>
                              ) : (
                                <span>
                                  Aucun employé actif rattaché à cette succursale pour le moment.
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. Groupe d'employés personnalisé */}
                      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="audienceType"
                          checked={audienceType === "CUSTOM"}
                          onChange={() => setAudienceType("CUSTOM")}
                          className="mt-1 text-[#031B3A] focus:ring-[#031B3A]"
                        />
                        <div>
                          <span className="font-semibold text-slate-800">
                            Groupe d'employés personnalisé
                          </span>
                          <p className="text-xs text-slate-500">
                            Sélectionnez les employés destinataires dans la liste complète du système
                          </p>
                        </div>
                      </label>

                      {audienceType === "CUSTOM" && (
                        <div className="pl-6 space-y-2.5 pt-1">
                          {/* Search + Quick Actions */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="text"
                              placeholder="Rechercher un employé (nom, matricule, e-mail, succursale)..."
                              value={employeeSearch}
                              onChange={(e) => setEmployeeSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#031B3A]"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span className="font-semibold">
                              {selectedEmployeeIds.length} sélectionné(s) sur {activeEmployees.length} employé(s)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedEmployeeIds(
                                    filteredDirectoryEmployees.map((e) => e.id)
                                  )
                                }
                                className="font-semibold text-[#062653] hover:underline cursor-pointer"
                              >
                                Tout cocher
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedEmployeeIds([])}
                                className="font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                              >
                                Effacer
                              </button>
                            </div>
                          </div>

                          {/* Complete List of System Employees */}
                          <div className="max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                            {loadingDirectory ? (
                              <div className="p-4 text-center text-xs text-slate-500">
                                Chargement de la liste des employés...
                              </div>
                            ) : filteredDirectoryEmployees.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-500">
                                Aucun employé trouvé dans le système.
                              </div>
                            ) : (
                              filteredDirectoryEmployees.map((emp) => {
                                const isChecked = selectedEmployeeIds.includes(emp.id);
                                const bName = emp.branchId
                                  ? branchNameMap.get(emp.branchId)
                                  : undefined;
                                const hasEmail = Boolean(
                                  emp.email && emp.email.trim().includes("@")
                                );
                                return (
                                  <label
                                    key={emp.id}
                                    className={`flex items-start gap-2.5 p-2.5 cursor-pointer transition-colors ${
                                      isChecked
                                        ? "bg-emerald-50/70"
                                        : "hover:bg-slate-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleEmployeeSelection(emp.id)}
                                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-bold text-slate-800">
                                          {emp.firstName} {emp.lastName}
                                        </span>
                                        {emp.employeeNumber && (
                                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                            {emp.employeeNumber}
                                          </span>
                                        )}
                                        {bName && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                                            {bName}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px]">
                                        {emp.department && (
                                          <span className="text-slate-500">
                                            {emp.department}
                                          </span>
                                        )}
                                        {hasEmail ? (
                                          <span className="text-emerald-700 flex items-center gap-1 truncate">
                                            <Mail className="w-3 h-3 shrink-0" />
                                            {emp.email}
                                          </span>
                                        ) : (
                                          <span className="text-amber-600">
                                            Aucun e-mail enregistré
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyImmediate}
                        onChange={(e) => setNotifyImmediate(e.target.checked)}
                        className="rounded text-[#031B3A] focus:ring-[#031B3A]"
                      />
                      <span>
                        Alerter immédiatement par notification dans le système et par courriel
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reminder24h}
                        onChange={(e) => setReminder24h(e.target.checked)}
                        className="rounded text-[#031B3A] focus:ring-[#031B3A]"
                      />
                      <span>
                        Envoyer un rappel automatique 24 heures avant l'événement
                      </span>
                    </label>
                  </div>
                </>
              )}

              {/* COLLABORATOR ONLY: Personal reminder */}
              {!isAdmin && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reminder24h}
                      onChange={(e) => setReminder24h(e.target.checked)}
                      className="rounded text-[#114C5A] focus:ring-[#114C5A]"
                    />
                    <span>
                      M'envoyer un rappel automatique avant cet événement
                    </span>
                  </label>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {isAdmin
                    ? "Description / Ordre du jour"
                    : "Notes personnelles / Détails"}
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    isAdmin
                      ? "Détails, ordre du jour ou instructions particulières..."
                      : "Notes pour vous-même, détails, instructions..."
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 ${
                    isAdmin ? "focus:ring-[#031B3A]" : "focus:ring-[#114C5A]"
                  }`}
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[#DCE2EA] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60 ${
                    isAdmin
                      ? "bg-[#031B3A] hover:bg-[#042854]"
                      : "bg-[#114C5A] hover:bg-[#0d3b46]"
                  }`}
                >
                  {isSubmitting
                    ? "Envoi en cours..."
                    : isAdmin
                    ? "Enregistrer et Alerter"
                    : "Enregistrer mon événement"}
                </button>
              </div>
            </form>
      </SlideOver>
    </div>
  );
}
