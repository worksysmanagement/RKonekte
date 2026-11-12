import fs from "fs";
import path from "path";
import {
  sendWhatsAppMessage,
  generateWhatsAppDirectLink,
  buildWhatsAppSalaryRevisionMessage,
} from "@/lib/notifications/whatsapp";
import {
  sendEmail,
  generateSalaryRevisionEmail,
} from "@/lib/notifications/email";
import { getOrganizationById } from "@/lib/services/organizations";

export interface SalaryAdjustment {
  id: string; // e.g. "SAL-2026-001"
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
  whatsappMessageId?: string;
  whatsappDirectUrl?: string;
  emailSent?: boolean;
  emailError?: string;
  whatsappError?: string;
  lastNotifiedAt?: string;
}

export interface CreateSalaryAdjustmentInput {
  employeeId?: string;
  employeeName: string;
  employeeNumber: string;
  department?: string;
  branch?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  previousSalary: string;
  newSalary: string;
  currency?: string;
  effectiveDate?: string;
  reason?: string;
  signatureDataUrl?: string;
  sendWhatsApp?: boolean;
  sendEmail?: boolean;
}

const DEFAULT_SALARY_ADJUSTMENTS: SalaryAdjustment[] = [
  {
    id: "SAL-2026-001",
    employeeName: "Alice Smith",
    employeeNumber: "TEC-001",
    department: "Développement",
    branch: "Siège Principal",
    previousSalary: "85 000",
    newSalary: "105 000",
    currency: "HTG",
    effectiveDate: "2026-04-01",
    reason: "Promotion au poste de Tech Lead et extension des responsabilités d'équipe.",
    attributedBy: "Direction Générale",
    createdAt: "2026-03-25",
    status: "APPLIED",
    whatsappSent: true,
    emailSent: true,
  },
  {
    id: "SAL-2026-002",
    employeeName: "Jean Kouassi",
    employeeNumber: "WES-001",
    department: "Logistique",
    branch: "Succursale Delmas",
    previousSalary: "45 000",
    newSalary: "55 000",
    currency: "HTG",
    effectiveDate: "2026-04-01",
    reason: "Ajustement annuel suite à l'évaluation des performances positives.",
    attributedBy: "Direction Générale",
    createdAt: "2026-03-20",
    status: "APPLIED",
    whatsappSent: true,
    emailSent: false,
  },
];

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "salary-adjustments.json");

let memoryCache: SalaryAdjustment[] | null = null;

function loadFromFileOrMemory(): SalaryAdjustment[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      if (raw && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            memoryCache = parsed;
            return parsed;
          }
        } catch (_) {}
      }
    }

    // Only create default sample items if the file doesn't exist at all yet
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_SALARY_ADJUSTMENTS, null, 2), "utf-8");
    memoryCache = [...DEFAULT_SALARY_ADJUSTMENTS];
    return memoryCache;
  } catch (err) {
    console.error("Failed to read/write salary adjustments file:", err);
    if (!memoryCache) {
      memoryCache = [];
    }
    return memoryCache;
  }
}

function ensureFileInitialized(): SalaryAdjustment[] {
  return loadFromFileOrMemory();
}

function persistToFile(items: SalaryAdjustment[]) {
  memoryCache = items;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist salary adjustments file:", err);
  }
}

export async function listSalaryAdjustments(organizationId?: string): Promise<SalaryAdjustment[]> {
  const all = loadFromFileOrMemory();
  if (!organizationId) return all;
  return all.filter((item) => !item.organizationId || item.organizationId === organizationId);
}

export async function createSalaryAdjustment(
  organizationId: string,
  input: CreateSalaryAdjustmentInput,
  attributedBy: string
): Promise<SalaryAdjustment> {
  const currentList = ensureFileInitialized();

  const nextSeq = currentList.length + 1;
  const year = new Date().getFullYear();
  const id = `SAL-${year}-${String(nextSeq).padStart(3, "0")}`;

  const todayStr = new Date().toISOString().split("T")[0];
  const effectiveDate = input.effectiveDate || todayStr;
  const currency = input.currency || "HTG";

  const firstName = input.employeeName.trim().split(" ")[0] || input.employeeName.trim();

  // Resolve enterprise/company name
  let companyName = input.companyName?.trim();
  if (!companyName && organizationId) {
    try {
      const org = await getOrganizationById(organizationId);
      if (org?.name) companyName = org.name;
    } catch (_) {}
  }
  if (!companyName) {
    companyName = "e-biznis";
  }

  let whatsappSent = false;
  let whatsappMessageId: string | undefined;
  let whatsappError: string | undefined;
  let whatsappDirectUrl: string | undefined;

  let emailSent = false;
  let emailError: string | undefined;

  // 1. WHATSAPP NOTIFICATION
  if (input.phone && input.sendWhatsApp !== false) {
    const waText = buildWhatsAppSalaryRevisionMessage({
      employeeFirstName: firstName,
      reference: id,
      previousSalary: input.previousSalary,
      newSalary: input.newSalary,
      currency,
      effectiveDate,
      reason: input.reason,
      companyName,
      branchName: input.branch,
    });

    whatsappDirectUrl = generateWhatsAppDirectLink(input.phone, waText);

    try {
      const waRes = await sendWhatsAppMessage({
        toPhone: input.phone,
        messageText: waText,
      });
      whatsappSent = waRes.success;
      whatsappMessageId = waRes.messageId;
      whatsappError = waRes.error;
    } catch (err: any) {
      whatsappError = err?.message || "Erreur lors de l'envoi WhatsApp";
    }
  }

  // 2. EMAIL NOTIFICATION
  if (input.email && input.sendEmail !== false) {
    const { subject, html } = generateSalaryRevisionEmail({
      reference: id,
      employeeName: input.employeeName,
      previousSalary: input.previousSalary,
      newSalary: input.newSalary,
      currency,
      effectiveDate,
      reason: input.reason,
      decidedBy: attributedBy,
      companyName,
      branchName: input.branch,
    });

    try {
      const emailRes = await sendEmail({
        to: input.email,
        subject,
        html,
      });
      emailSent = emailRes.success;
      emailError = emailRes.error;
    } catch (err: any) {
      emailError = err?.message || "Erreur lors de l'envoi Email";
    }
  }

  const record: SalaryAdjustment = {
    id,
    organizationId,
    companyName,
    employeeId: input.employeeId,
    employeeName: input.employeeName.trim(),
    employeeNumber: input.employeeNumber.trim(),
    department: input.department?.trim() || "Direction",
    branch: input.branch?.trim() || "Non assignée",
    phone: input.phone?.trim(),
    email: input.email?.trim(),
    previousSalary: input.previousSalary.trim(),
    newSalary: input.newSalary.trim(),
    currency,
    effectiveDate,
    reason: input.reason?.trim() || "Revalorisation salariale administrative",
    attributedBy: attributedBy || "Direction Générale",
    signatureDataUrl: input.signatureDataUrl,
    createdAt: todayStr,
    status: "APPLIED",
    whatsappSent,
    whatsappMessageId,
    whatsappDirectUrl,
    whatsappError,
    emailSent,
    emailError,
    lastNotifiedAt: todayStr,
  };

  const updated = [record, ...currentList];
  persistToFile(updated);

  return record;
}

export async function resendSalaryNotification(
  organizationId: string,
  id: string,
  channel: "whatsapp" | "email" | "both"
): Promise<{ success: boolean; whatsappSent?: boolean; emailSent?: boolean; whatsappDirectUrl?: string; error?: string }> {
  const currentList = ensureFileInitialized();
  const idx = currentList.findIndex((item) => item.id === id);
  if (idx === -1) {
    return { success: false, error: "Révision salariale introuvable." };
  }

  const item = currentList[idx];
  const firstName = item.employeeName.trim().split(" ")[0] || item.employeeName.trim();
  const companyName = item.companyName || "e-biznis";
  let whatsappSent = item.whatsappSent || false;
  let whatsappDirectUrl = item.whatsappDirectUrl;
  let emailSent = item.emailSent || false;

  if ((channel === "whatsapp" || channel === "both") && item.phone) {
    const waText = buildWhatsAppSalaryRevisionMessage({
      employeeFirstName: firstName,
      reference: item.id,
      previousSalary: item.previousSalary,
      newSalary: item.newSalary,
      currency: item.currency,
      effectiveDate: item.effectiveDate,
      reason: item.reason,
      companyName,
      branchName: item.branch,
    });
    whatsappDirectUrl = generateWhatsAppDirectLink(item.phone, waText);
    const waRes = await sendWhatsAppMessage({
      toPhone: item.phone,
      messageText: waText,
    });
    whatsappSent = waRes.success;
    item.whatsappSent = whatsappSent;
    item.whatsappDirectUrl = whatsappDirectUrl;
  }

  if ((channel === "email" || channel === "both") && item.email) {
    const { subject, html } = generateSalaryRevisionEmail({
      reference: item.id,
      employeeName: item.employeeName,
      previousSalary: item.previousSalary,
      newSalary: item.newSalary,
      currency: item.currency,
      effectiveDate: item.effectiveDate,
      reason: item.reason,
      decidedBy: item.attributedBy,
      companyName,
      branchName: item.branch,
    });
    const emailRes = await sendEmail({
      to: item.email,
      subject,
      html,
    });
    emailSent = emailRes.success;
    item.emailSent = emailSent;
  }

  item.lastNotifiedAt = new Date().toISOString().split("T")[0];
  persistToFile(currentList);

  return { success: true, whatsappSent, emailSent, whatsappDirectUrl };
}

export async function deleteSalaryAdjustment(organizationId: string, id: string): Promise<boolean> {
  const currentList = loadFromFileOrMemory();
  const cleanId = id.trim().toLowerCase();
  const initialCount = currentList.length;
  const filtered = currentList.filter((item) => item.id.trim().toLowerCase() !== cleanId);

  if (filtered.length !== initialCount) {
    persistToFile(filtered);
    return true;
  }
  return false;
}
