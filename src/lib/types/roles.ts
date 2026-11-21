export interface TabPermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  subTabs?: string[];
}

export interface SubTabItem {
  id: string;
  name: string;
  scope: string;
  href?: string;
}

export type ModuleKey =
  | "dashboard"
  | "requests"
  | "employees"
  | "branches"
  | "financial_ops"
  | "financial_reports"
  | "events"
  | "customer_space"
  | "users"
  | "notifications"
  | "configuration"
  | "broadcast";

export type HierarchyLevel =
  | "DIRECTION"
  | "MANAGEMENT"
  | "SUPERVISOR"
  | "OPERATIONAL";

export interface RoleModel {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  hierarchyLevel: HierarchyLevel;
  isSystem: boolean;
  isDefaultOwner?: boolean;
  permissions: Record<ModuleKey, TabPermission>;
  createdAt: number;
  updatedAt: number;
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Tableau de bord",
  requests: "Requêtes & Demandes",
  employees: "Gestion des Employés",
  branches: "Gestion des Succursales",
  financial_ops: "Opérations Financières",
  financial_reports: "Rapports Financiers",
  events: "Événements & Calendrier",
  customer_space: "Espace Client",
  users: "Gestion des Accès & Sécurité",
  notifications: "Centre de Notifications",
  configuration: "Configurations & Paramètres",
  broadcast: "Échanges administratifs",
};

export const MODULE_SUB_TABS: Record<ModuleKey, SubTabItem[]> = {
  dashboard: [
    { id: "overview", name: "Vue Globale", scope: "Consultation des indicateurs & statistiques", href: "/admin/dashboard" },
  ],
  requests: [
    { id: "leaves", name: "Demandes de congés", scope: "Consultation et soumission", href: "/admin/requests" },
    { id: "signature_auth", name: "Signatures d'autorisation", scope: "Approbations et visas de documents", href: "/admin/requests/signature-auth" },
    { id: "salary_raise", name: "Attribution de salaire", scope: "Attribution, revalorisation et notifications WhatsApp/Email", href: "/admin/requests/salary-raise" },
  ],
  employees: [
    { id: "list", name: "Liste des employés", scope: "Consultation de l'effectif", href: "/admin/employees" },
    { id: "new", name: "Nouvel employé", scope: "Création et envoi des invitations (+C)", href: "/admin/employees/new" },
  ],
  branches: [
    { id: "list", name: "Liste des succursales", scope: "Consultation des implantations", href: "/admin/branches" },
    { id: "new", name: "Nouvelle succursale", scope: "Création de succursales (+C)", href: "/admin/branches/new" },
  ],
  financial_ops: [
    { id: "accounts", name: "Comptes bancaires", scope: "Gestion des comptes, dépôts et retraits", href: "/admin/financial-operations?tab=accounts" },
    { id: "report", name: "Rapport des transactions", scope: "Journal général des dépôts et retraits", href: "/admin/financial-operations?tab=report" },
  ],
  financial_reports: [
    { id: "reports_summary", name: "Synthèse & Rapports Consolidés", scope: "Totaux, clôtures et KPI financiers", href: "/admin/financial-reports?tab=reports" },
    { id: "cashier_entry", name: "Saisie de Caisse", scope: "Enregistrement quotidien par les caissiers (+C / ✎M)", href: "/admin/financial-reports?tab=entry" },
  ],
  events: [
    { id: "calendar", name: "Événements & Calendrier", scope: "Agenda interne et célébrations", href: "/admin/events" },
  ],
  customer_space: [
    { id: "overview", name: "Espace Client & Partenaires", scope: "Gestion de la relation client", href: "/admin/espace-client" },
  ],
  users: [
    { id: "users_list", name: "Utilisateurs", scope: "Comptes d'accès du personnel", href: "/admin/users" },
    { id: "roles", name: "Rôles & Permissions", scope: "Matrice des autorisations par sous-onglet", href: "/admin/users/roles" },
    { id: "signatures", name: "Signatures", scope: "Signatures électroniques enregistrées", href: "/admin/users/signatures" },
  ],
  notifications: [
    { id: "center", name: "Centre de Notifications", scope: "Historique et alertes en direct", href: "/admin/notifications" },
  ],
  configuration: [
    { id: "profile", name: "Profil Entreprise", scope: "Identité et logo de l'organisation", href: "/admin/configuration" },
    { id: "security", name: "Sécurité", scope: "Politiques d'accès et mots de passe", href: "/admin/configuration/security" },
  ],
  broadcast: [
    { id: "exchanges", name: "Échanges administratifs", scope: "Transmission et suivi des documents entre administrateurs", href: "/admin/exchanges" },
  ],
};

export const HIERARCHY_LABELS: Record<HierarchyLevel, { label: string; badge: string; color: string }> = {
  DIRECTION: {
    label: "Direction & Propriétaire (Niveau 1)",
    badge: "Direction",
    color: "bg-indigo-100 text-indigo-800",
  },
  MANAGEMENT: {
    label: "Management & Cadres (Niveau 2)",
    badge: "Management",
    color: "bg-emerald-100 text-emerald-800",
  },
  SUPERVISOR: {
    label: "Superviseurs & Chefs d'équipe (Niveau 3)",
    badge: "Superviseur",
    color: "bg-amber-100 text-amber-800",
  },
  OPERATIONAL: {
    label: "Opérationnels & Collaborateurs (Niveau 4)",
    badge: "Opérationnel",
    color: "bg-slate-100 text-slate-700",
  },
};

export const ALL_ALLOWED_PERMS: Record<ModuleKey, TabPermission> = {
  dashboard: { view: true, create: true, edit: true, delete: true },
  requests: { view: true, create: true, edit: true, delete: true },
  employees: { view: true, create: true, edit: true, delete: true },
  branches: { view: true, create: true, edit: true, delete: true },
  financial_ops: { view: true, create: true, edit: true, delete: true },
  financial_reports: { view: true, create: true, edit: true, delete: true },
  events: { view: true, create: true, edit: true, delete: true },
  customer_space: { view: true, create: true, edit: true, delete: true },
  users: { view: true, create: true, edit: true, delete: true },
  notifications: { view: true, create: true, edit: true, delete: true },
  configuration: { view: true, create: true, edit: true, delete: true },
  broadcast: { view: true, create: true, edit: true, delete: true },
};
