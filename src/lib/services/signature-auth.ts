import fs from "fs";
import path from "path";

export interface SignatureAuthRequest {
  id: string;
  organizationId?: string;
  applicantName: string;
  applicantRole: string;
  employeeNumber?: string;
  branch?: string;
  pdfUrl?: string;
  pdfFileName: string;
  pdfFileSize?: string;
  description: string;
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  authorizedBy?: string;
  authorizedRole?: string;
  authorizedAt?: string;
  signatureUrl?: string;
  // Legacy optional fields for backwards compatibility
  documentType?: string;
  documentReference?: string;
  amount?: string;
  currency?: string;
}

export const SAMPLE_PDF_DATA_URL =
  "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFI+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDU1Pj5zdHJlYW0KQVQKL0YxIDI0IFRmCjEwMCA3NTAgVGQKKEF1dG9yaXNhdGlvbiBkZSBTaWduYXR1cmUgUktvbmVrdGUpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE4IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMjE5IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMzI1CiUlRU9G";

export const SAMPLE_ADMIN_SIGNATURE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 90' fill='none'><path d='M20,65 C45,15 75,80 110,35 C135,5 155,75 190,40 C210,20 230,70 245,30' stroke='%23062653' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/><path d='M70,55 C120,50 170,52 230,50' stroke='%23062653' stroke-width='2.5' stroke-linecap='round'/></svg>";

const DEFAULT_SIGNATURE_REQUESTS: SignatureAuthRequest[] = [
  {
    id: "SIG-2026-001",
    applicantName: "Fatou Traore",
    applicantRole: "Comptable",
    employeeNumber: "EB-SIEGE-102",
    branch: "Siège Principal",
    pdfFileName: "Ordre_Virement_VIR-SOGE-2026-089.pdf",
    pdfFileSize: "142 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "Virement bancaire fournisseur pour achat de matériel bureautique et fournitures de bureau du trimestre.",
    submittedAt: "2026-03-26",
    status: "PENDING",
  },
  {
    id: "SIG-2026-002",
    applicantName: "Marc Bamba",
    applicantRole: "Responsable Achats",
    employeeNumber: "EB-SIEGE-205",
    branch: "Siège Principal",
    pdfFileName: "Contrat_Maintenance_CTR-SERV-2026-014.pdf",
    pdfFileSize: "285 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "Contrat annuel de maintenance des serveurs et réseaux informatiques de l'entreprise.",
    submittedAt: "2026-03-24",
    status: "APPROVED",
    authorizedBy: "Direction Générale",
    authorizedAt: "2026-03-25",
    signatureUrl: SAMPLE_ADMIN_SIGNATURE,
  },
  {
    id: "SIG-2026-003",
    applicantName: "Rodjensky Emmanuel Piton",
    applicantRole: "Développeur",
    employeeNumber: "EB-SIEGE-884",
    branch: "Siège Principal",
    pdfFileName: "Rapport Lecture.pdf",
    pdfFileSize: "505 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "C est ok",
    submittedAt: "2026-10-24",
    status: "PENDING",
  },
];

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "signature-authorizations.json");

let memoryCache: SignatureAuthRequest[] | null = null;

function safeWriteFileSync(filePath: string, data: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.writeFileSync(filePath, data, "utf-8");
      return;
    } catch (err: any) {
      if (attempt === 3) throw err;
      const end = Date.now() + 30;
      while (Date.now() < end) {}
    }
  }
}

function ensureFileInitialized(): SignatureAuthRequest[] {
  if (memoryCache !== null) {
    return memoryCache;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      if (raw && raw.trim()) {
        const parsed: SignatureAuthRequest[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryCache = parsed;
          return parsed;
        }
      }
    }

    // Write initial defaults ONLY when the file does not exist or is empty
    safeWriteFileSync(DATA_FILE, JSON.stringify(DEFAULT_SIGNATURE_REQUESTS, null, 2));
    memoryCache = [...DEFAULT_SIGNATURE_REQUESTS];
    return memoryCache;
  } catch (err) {
    console.error("Failed to read/write signature authorizations file:", err);
    if (!memoryCache) {
      memoryCache = [...DEFAULT_SIGNATURE_REQUESTS];
    }
    return memoryCache;
  }
}

function persistToFile(items: SignatureAuthRequest[]) {
  memoryCache = items;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    safeWriteFileSync(DATA_FILE, JSON.stringify(items, null, 2));
  } catch (err) {
    console.error("Error persisting signature requests to disk:", err);
  }
}

export async function listSignatureAuthRequests(
  organizationId?: string,
  filter?: {
    status?: string;
    employeeNumber?: string;
    applicantName?: string;
  }
): Promise<SignatureAuthRequest[]> {
  const all = ensureFileInitialized();

  let filtered = all;
  if (organizationId) {
    // If requests have organizationId, match; if legacy request without organizationId, allow it
    filtered = filtered.filter((r) => !r.organizationId || r.organizationId === organizationId);
  }

  if (filter?.status && filter.status !== "ALL") {
    filtered = filtered.filter((r) => r.status === filter.status);
  }

  if (filter?.employeeNumber || filter?.applicantName) {
    const filterNum = (filter.employeeNumber || "").toLowerCase().trim();
    const filterName = (filter.applicantName || "").toLowerCase().trim();

    filtered = filtered.filter((r) => {
      const rNum = (r.employeeNumber || "").toLowerCase().trim();
      const rName = (r.applicantName || "").toLowerCase().trim();

      if (filterNum && rNum && rNum === filterNum) return true;
      if (filterName && rName && (rName.includes(filterName) || filterName.includes(rName))) return true;
      return false;
    });
  }

  return filtered;
}

export async function createSignatureAuthRequest(
  data: Omit<SignatureAuthRequest, "id" | "submittedAt" | "status"> & {
    organizationId?: string;
  }
): Promise<SignatureAuthRequest> {
  const current = ensureFileInitialized();

  const existingNumbers = current
    .map((r) => {
      const match = r.id?.match(/^SIG-2026-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n > 0);
  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const nextIndex = Math.max(current.length + 1, maxNumber + 1);
  const newId = `SIG-2026-${String(nextIndex).padStart(3, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  const newRequest: SignatureAuthRequest = {
    ...data,
    id: newId,
    submittedAt: today,
    status: "PENDING",
    pdfUrl: data.pdfUrl || SAMPLE_PDF_DATA_URL,
    pdfFileName: data.pdfFileName || "Document.pdf",
    description: data.description.trim(),
  };

  const updated = [newRequest, ...current];
  persistToFile(updated);

  return newRequest;
}

export async function updateSignatureAuthRequest(
  id: string,
  updates: Partial<SignatureAuthRequest>
): Promise<SignatureAuthRequest | null> {
  const current = ensureFileInitialized();
  const index = current.findIndex((r) => r.id === id);
  if (index === -1) {
    return null;
  }

  const updatedItem: SignatureAuthRequest = {
    ...current[index],
    ...updates,
  };

  const updatedList = [...current];
  updatedList[index] = updatedItem;
  persistToFile(updatedList);

  return updatedItem;
}

export async function deleteSignatureAuthRequest(id: string): Promise<boolean> {
  const current = ensureFileInitialized();
  const filtered = current.filter((r) => r.id !== id);
  if (filtered.length === current.length) {
    return false;
  }
  persistToFile(filtered);
  return true;
}
