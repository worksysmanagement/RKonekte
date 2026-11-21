import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDb } from "@/lib/db/client";
import {
  administrativeDocuments,
  administrativeDocumentRecipients,
  users,
  AdministrativeDocument,
  AdministrativeDocumentRecipient,
} from "@/db/schema";
import { eq, and, desc, inArray, like, or } from "drizzle-orm";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { sendEmail, generateAdministrativeDocumentNotificationEmail, resolveAppOrigin } from "@/lib/notifications/email";

function getSafeSupabaseClient() {
  try {
    return getSupabaseAdminClient();
  } catch (_) {
    return null;
  }
}

// Allowed file extensions whitelist (strict security)
export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".csv",
];

// Maximum allowed size per file: 25 MB
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export interface FilePayload {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface AdminRecipientItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TransmittedRecipientInfo {
  id: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  status: "TRANSMITTED" | "DELIVERED" | "VIEWED";
  deliveredAt: number;
  viewedAt: number | null;
  notificationEmailSent: boolean;
  notificationEmailSentAt: number | null;
  notificationEmailError: string | null;
}

export interface TransmittedDocumentWithRecipients extends AdministrativeDocument {
  recipients: TransmittedRecipientInfo[];
  overallStatus: "ALL_VIEWED" | "PARTIALLY_VIEWED" | "DELIVERED" | "TRANSMITTED";
  viewedCount: number;
  totalRecipientsCount: number;
}

export interface ReceivedDocumentItem {
  recipientRecordId: string;
  documentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  fileExtension: string;
  fileSize: number;
  senderUserId: string;
  senderName: string;
  senderEmail: string;
  status: "TRANSMITTED" | "DELIVERED" | "VIEWED";
  deliveredAt: number;
  viewedAt: number | null;
  createdAt: number;
  isUnread: boolean;
}

// Helper: check if a user role is Administrator
export function isUserAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "ORGANIZATION_ADMIN" || r === "ADMIN" || r === "ADMINISTRATEUR" || r === "PDG") {
    return true;
  }
  if (r.includes("EMPLOY") || r.includes("COLLAB") || r.includes("CAISSIER") || r.includes("CASHIER") || r.includes("SECRETAR")) {
    return false;
  }
  return true;
}

// 1. List eligible administrative recipients in the enterprise
export async function listEligibleAdminRecipients(
  organizationId: string,
  currentUserId: string,
  dbInstance?: any
): Promise<AdminRecipientItem[]> {
  if (!dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        const { data: supaUsers, error } = await supabase
          .from("users")
          .select("id, name, email, role, status")
          .eq("organization_id", organizationId)
          .eq("status", "ACTIVE")
          .neq("id", currentUserId);

        if (!error && Array.isArray(supaUsers)) {
          return supaUsers
            .filter((u) => isUserAdminRole(u.role))
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
            }));
        }
      }
    } catch (_) {}
  }

  // SQLite fallback
  const db = dbInstance || getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.status, "ACTIVE")));

  return (rows as any[])
    .filter((u: any) => u.id !== currentUserId && isUserAdminRole(u.role))
    .map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
}

// Storage helper: ensure safe directory and save encrypted/secure file
function getSecureStorageDir(organizationId: string): string {
  const safeOrgId = organizationId.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(process.cwd(), "data", "secure-storage", safeOrgId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// 2. Transmit administrative documents to selected recipients
export async function transmitAdministrativeDocuments(params: {
  organizationId: string;
  senderUser: { id: string; name: string; email: string };
  recipientIds: string[];
  files: FilePayload[];
  companyName?: string;
  appOrigin?: string;
  dbInstance?: any;
}): Promise<{ batchId: string; count: number; documents: AdministrativeDocument[] }> {
  const { organizationId, senderUser, recipientIds, files } = params;
  const db = params.dbInstance || getDb();
  const supabase = !params.dbInstance ? getSafeSupabaseClient() : null;

  if (!files || files.length === 0) {
    throw new Error("Aucun fichier n'a été fourni pour la transmission.");
  }
  if (!recipientIds || recipientIds.length === 0) {
    throw new Error("Veuillez sélectionner au moins un administrateur destinataire.");
  }

  // Fetch recipients to validate they are real active admins of this organization
  const eligibleRecipients = await listEligibleAdminRecipients(
    organizationId,
    senderUser.id,
    params.dbInstance
  );
  const eligibleMap = new Map(eligibleRecipients.map((r) => [r.id, r]));

  const validatedRecipients: AdminRecipientItem[] = [];
  for (const rid of recipientIds) {
    let matched = eligibleMap.get(rid);
    if (!matched && supabase) {
      try {
        const { data: supaUser } = await supabase
          .from("users")
          .select("id, name, email, role, status")
          .eq("id", rid)
          .eq("organization_id", organizationId)
          .maybeSingle();

        if (supaUser && isUserAdminRole(supaUser.role)) {
          matched = {
            id: supaUser.id,
            name: supaUser.name,
            email: supaUser.email,
            role: supaUser.role,
          };
        }
      } catch (_) {}
    }

    if (!matched) {
      try {
        const [localUser] = await db
          .select()
          .from(users)
          .where(and(eq(users.id, rid), eq(users.organizationId, organizationId)))
          .limit(1);

        if (localUser && isUserAdminRole(localUser.role)) {
          matched = {
            id: localUser.id,
            name: localUser.name,
            email: localUser.email,
            role: localUser.role,
          };
        }
      } catch (_) {}
    }

    if (!matched) {
      throw new Error(`Le destinataire sélectionné (${rid}) n'est pas un administrateur éligible.`);
    }
    validatedRecipients.push(matched);
  }

  // Validate files
  for (const f of files) {
    const ext = path.extname(f.originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(
        `Le format du fichier « ${f.originalName} » n'est pas autorisé. Formats acceptés : ${ALLOWED_EXTENSIONS.join(
          ", "
        )}`
      );
    }
    if (f.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Le fichier « ${f.originalName} » dépasse la taille maximale autorisée de 25 Mo.`
      );
    }
    if (f.buffer.length === 0) {
      throw new Error(`Le fichier « ${f.originalName} » est vide.`);
    }
  }

  const batchId = `batch_${crypto.randomUUID()}`;
  const now = Date.now();
  const storageDir = getSecureStorageDir(organizationId);
  const createdDocuments: AdministrativeDocument[] = [];

  for (const file of files) {
    const docId = `doc_${crypto.randomUUID()}`;
    const ext = path.extname(file.originalName).toLowerCase();
    const storedFileName = `${docId}.dat`;
    const fullStoragePath = path.join(storageDir, storedFileName);

    // Write file securely
    fs.writeFileSync(fullStoragePath, file.buffer);

    const relativeStoragePath = `data/secure-storage/${organizationId}/${storedFileName}`;
    const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const docRecord: AdministrativeDocument = {
      id: docId,
      organizationId,
      senderUserId: senderUser.id,
      senderName: senderUser.name,
      senderEmail: senderUser.email,
      fileName: file.originalName,
      fileType: file.mimeType || "application/octet-stream",
      fileExtension: ext,
      fileSize: file.buffer.length,
      fileHash,
      storagePath: relativeStoragePath,
      storageProvider: "local",
      batchId,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    // Insert in Supabase if online (Primary in production)
    if (supabase) {
      try {
        const { error: supaErr } = await supabase.from("administrative_documents").insert({
          id: docRecord.id,
          organization_id: docRecord.organizationId,
          sender_user_id: docRecord.senderUserId,
          sender_name: docRecord.senderName,
          sender_email: docRecord.senderEmail,
          file_name: docRecord.fileName,
          file_type: docRecord.fileType,
          file_extension: docRecord.fileExtension,
          file_size: docRecord.fileSize,
          file_hash: docRecord.fileHash,
          storage_path: docRecord.storagePath,
          storage_provider: docRecord.storageProvider,
          batch_id: docRecord.batchId,
          is_archived: docRecord.isArchived,
          created_at: docRecord.createdAt,
          updated_at: docRecord.updatedAt,
        });
        if (supaErr) {
          console.warn("Supabase document insert note:", supaErr.message);
        }
      } catch (err) {
        console.warn("Supabase insert document exception:", err);
      }
    }

    // Insert in SQLite (Primary in tests, local cache in prod)
    try {
      await db.insert(administrativeDocuments).values(docRecord);
    } catch (sqliteErr) {
      if (!supabase) throw sqliteErr;
    }

    // Create recipient records
    for (const recipient of validatedRecipients) {
      const recipientRecordId = `rcp_${crypto.randomUUID()}`;
      const recpData: AdministrativeDocumentRecipient = {
        id: recipientRecordId,
        documentId: docId,
        organizationId,
        recipientUserId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        status: "DELIVERED",
        deliveredAt: now,
        viewedAt: null,
        notificationEmailSent: false,
        notificationEmailSentAt: null,
        notificationEmailError: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      if (supabase) {
        try {
          const { error: supaRecpErr } = await supabase.from("administrative_document_recipients").insert({
            id: recpData.id,
            document_id: recpData.documentId,
            organization_id: recpData.organizationId,
            recipient_user_id: recpData.recipientUserId,
            recipient_name: recpData.recipientName,
            recipient_email: recpData.recipientEmail,
            status: recpData.status,
            delivered_at: recpData.deliveredAt,
            viewed_at: recpData.viewedAt,
            notification_email_sent: recpData.notificationEmailSent,
            notification_email_sent_at: recpData.notificationEmailSentAt,
            notification_email_error: recpData.notificationEmailError,
            is_archived: recpData.isArchived,
            created_at: recpData.createdAt,
            updated_at: recpData.updatedAt,
          });
          if (supaRecpErr) {
            console.warn("Supabase recipient insert note:", supaRecpErr.message);
          }
        } catch (err) {
          console.warn("Supabase insert recipient exception:", err);
        }
      }

      try {
        await db.insert(administrativeDocumentRecipients).values(recpData);
      } catch (sqliteErr) {
        if (!supabase) throw sqliteErr;
      }
    }

    createdDocuments.push(docRecord);
  }

  // Send Email Notification to each recipient
  const appOrigin = params.appOrigin || resolveAppOrigin();
  const fileNames = files.map((f) => f.originalName);
  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(now));

  for (const recipient of validatedRecipients) {
    const viewUrl = `${appOrigin}/admin/exchanges?docId=${createdDocuments[0].id}`;
    const emailData = generateAdministrativeDocumentNotificationEmail({
      recipientName: recipient.name,
      senderName: senderUser.name,
      companyName: params.companyName || "RKonekte",
      documentNames: fileNames,
      transmissionDate: formattedDate,
      viewUrl,
    });

    try {
      const emailResult = await sendEmail({
        to: recipient.email,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      });

      if (emailResult.success) {
        // Update recipient record with email success
        await db
          .update(administrativeDocumentRecipients)
          .set({
            notificationEmailSent: true,
            notificationEmailSentAt: Date.now(),
            notificationEmailError: null,
            updatedAt: Date.now(),
          })
          .where(
            and(
              eq(administrativeDocumentRecipients.organizationId, organizationId),
              eq(administrativeDocumentRecipients.recipientUserId, recipient.id),
              inArray(
                administrativeDocumentRecipients.documentId,
                createdDocuments.map((d) => d.id)
              )
            )
          );

        if (supabase) {
          try {
            await supabase
              .from("administrative_document_recipients")
              .update({
                notification_email_sent: true,
                notification_email_sent_at: Date.now(),
                notification_email_error: null,
                updated_at: Date.now(),
              })
              .eq("organization_id", organizationId)
              .eq("recipient_user_id", recipient.id)
              .in(
                "document_id",
                createdDocuments.map((d) => d.id)
              );
          } catch (_) {}
        }
      } else {
        const errorMsg = emailResult.error || "Échec d'envoi de notification";
        await db
          .update(administrativeDocumentRecipients)
          .set({
            notificationEmailSent: false,
            notificationEmailError: errorMsg,
            updatedAt: Date.now(),
          })
          .where(
            and(
              eq(administrativeDocumentRecipients.organizationId, organizationId),
              eq(administrativeDocumentRecipients.recipientUserId, recipient.id),
              inArray(
                administrativeDocumentRecipients.documentId,
                createdDocuments.map((d) => d.id)
              )
            )
          );
      }
    } catch (err: any) {
      console.warn("Email dispatch error for recipient", recipient.email, err);
    }
  }

  return {
    batchId,
    count: createdDocuments.length,
    documents: createdDocuments,
  };
}

// 3. List received documents for an administrator (strictly isolated)
export async function listReceivedDocuments(
  organizationId: string,
  recipientUserId: string,
  options?: { search?: string; unreadOnly?: boolean; dbInstance?: any }
): Promise<ReceivedDocumentItem[]> {
  const db = options?.dbInstance || getDb();

  // Try Supabase first if not using custom test dbInstance
  if (!options?.dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        const { data: recpRows, error } = await supabase
          .from("administrative_document_recipients")
          .select(
            "id, document_id, organization_id, status, delivered_at, viewed_at, created_at, administrative_documents(*)"
          )
          .eq("organization_id", organizationId)
          .eq("recipient_user_id", recipientUserId)
          .eq("is_archived", false)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(recpRows) && recpRows.length > 0) {
          const items: ReceivedDocumentItem[] = [];
          for (const row of recpRows) {
            const doc = row.administrative_documents as any;
            if (!doc) continue;

            if (options?.unreadOnly && row.status === "VIEWED") continue;
            if (options?.search) {
              const q = options.search.toLowerCase().trim();
              const match =
                doc.file_name?.toLowerCase().includes(q) ||
                doc.sender_name?.toLowerCase().includes(q);
              if (!match) continue;
            }

            items.push({
              recipientRecordId: row.id,
              documentId: row.document_id,
              organizationId: row.organization_id,
              fileName: doc.file_name,
              fileType: doc.file_type,
              fileExtension: doc.file_extension,
              fileSize: doc.file_size,
              senderUserId: doc.sender_user_id,
              senderName: doc.sender_name,
              senderEmail: doc.sender_email,
              status: row.status,
              deliveredAt: row.delivered_at,
              viewedAt: row.viewed_at,
              createdAt: row.created_at,
              isUnread: row.status !== "VIEWED",
            });
          }
          return items;
        }
      }
    } catch (_) {}
  }

  // SQLite fallback
  const recpRows = await db
    .select()
    .from(administrativeDocumentRecipients)
    .where(
      and(
        eq(administrativeDocumentRecipients.organizationId, organizationId),
        eq(administrativeDocumentRecipients.recipientUserId, recipientUserId),
        eq(administrativeDocumentRecipients.isArchived, false)
      )
    )
    .orderBy(desc(administrativeDocumentRecipients.createdAt));

  if (recpRows.length === 0) return [];

  const docIds = recpRows.map((r: any) => r.documentId);
  const docRows = await db
    .select()
    .from(administrativeDocuments)
    .where(inArray(administrativeDocuments.id, docIds));

  const docMap = new Map<string, any>((docRows as any[]).map((d: any) => [d.id, d]));
  const items: ReceivedDocumentItem[] = [];

  for (const r of recpRows) {
    const doc = docMap.get(r.documentId);
    if (!doc) continue;

    if (options?.unreadOnly && r.status === "VIEWED") continue;
    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      const match =
        doc.fileName.toLowerCase().includes(q) ||
        doc.senderName.toLowerCase().includes(q);
      if (!match) continue;
    }

    items.push({
      recipientRecordId: r.id,
      documentId: r.documentId,
      organizationId: r.organizationId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileExtension: doc.fileExtension,
      fileSize: doc.fileSize,
      senderUserId: doc.senderUserId,
      senderName: doc.senderName,
      senderEmail: doc.senderEmail,
      status: r.status as any,
      deliveredAt: r.deliveredAt,
      viewedAt: r.viewedAt,
      createdAt: r.createdAt,
      isUnread: r.status !== "VIEWED",
    });
  }

  return items;
}

// 4. List sent documents for an administrator (strictly isolated to sender)
export async function listSentDocuments(
  organizationId: string,
  senderUserId: string,
  options?: { search?: string; dbInstance?: any }
): Promise<TransmittedDocumentWithRecipients[]> {
  const db = options?.dbInstance || getDb();

  // Try Supabase first if not using custom test dbInstance
  if (!options?.dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        const { data: docRows, error } = await supabase
          .from("administrative_documents")
          .select("*, administrative_document_recipients(*)")
          .eq("organization_id", organizationId)
          .eq("sender_user_id", senderUserId)
          .eq("is_archived", false)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(docRows) && docRows.length > 0) {
          const results: TransmittedDocumentWithRecipients[] = [];
          for (const d of docRows) {
            const rawRecps = (d.administrative_document_recipients || []) as any[];
            const recipients: TransmittedRecipientInfo[] = rawRecps.map((r) => ({
              id: r.id,
              recipientUserId: r.recipient_user_id,
              recipientName: r.recipient_name,
              recipientEmail: r.recipient_email,
              status: r.status,
              deliveredAt: r.delivered_at,
              viewedAt: r.viewed_at,
              notificationEmailSent: r.notification_email_sent,
              notificationEmailSentAt: r.notification_email_sent_at,
              notificationEmailError: r.notification_email_error,
            }));

            if (options?.search) {
              const q = options.search.toLowerCase().trim();
              const matchFileName = d.file_name?.toLowerCase().includes(q);
              const matchRecipient = recipients.some(
                (r) =>
                  r.recipientName?.toLowerCase().includes(q) ||
                  r.recipientEmail?.toLowerCase().includes(q)
              );
              if (!matchFileName && !matchRecipient) continue;
            }

            const viewedCount = recipients.filter((r) => r.status === "VIEWED").length;
            const total = recipients.length;
            let overallStatus: "ALL_VIEWED" | "PARTIALLY_VIEWED" | "DELIVERED" | "TRANSMITTED" = "DELIVERED";
            if (total > 0 && viewedCount === total) {
              overallStatus = "ALL_VIEWED";
            } else if (viewedCount > 0) {
              overallStatus = "PARTIALLY_VIEWED";
            }

            results.push({
              id: d.id,
              organizationId: d.organization_id,
              senderUserId: d.sender_user_id,
              senderName: d.sender_name,
              senderEmail: d.sender_email,
              fileName: d.file_name,
              fileType: d.file_type,
              fileExtension: d.file_extension,
              fileSize: d.file_size,
              fileHash: d.file_hash,
              storagePath: d.storage_path,
              storageProvider: d.storage_provider,
              batchId: d.batch_id,
              isArchived: d.is_archived,
              createdAt: d.created_at,
              updatedAt: d.updated_at,
              recipients,
              overallStatus,
              viewedCount,
              totalRecipientsCount: total,
            });
          }
          return results;
        }
      }
    } catch (_) {}
  }

  // SQLite fallback
  const docs = await db
    .select()
    .from(administrativeDocuments)
    .where(
      and(
        eq(administrativeDocuments.organizationId, organizationId),
        eq(administrativeDocuments.senderUserId, senderUserId),
        eq(administrativeDocuments.isArchived, false)
      )
    )
    .orderBy(desc(administrativeDocuments.createdAt));

  if (docs.length === 0) return [];

  const docIds = (docs as any[]).map((d: any) => d.id);
  const recpRows = await db
    .select()
    .from(administrativeDocumentRecipients)
    .where(inArray(administrativeDocumentRecipients.documentId, docIds));

  const recpByDoc = new Map<string, AdministrativeDocumentRecipient[]>();
  for (const r of recpRows) {
    const list = recpByDoc.get(r.documentId) || [];
    list.push(r);
    recpByDoc.set(r.documentId, list);
  }

  const results: TransmittedDocumentWithRecipients[] = [];
  for (const doc of docs) {
    const rawRecps = recpByDoc.get(doc.id) || [];
    const recipients: TransmittedRecipientInfo[] = rawRecps.map((r) => ({
      id: r.id,
      recipientUserId: r.recipientUserId,
      recipientName: r.recipientName,
      recipientEmail: r.recipientEmail,
      status: r.status as any,
      deliveredAt: r.deliveredAt,
      viewedAt: r.viewedAt,
      notificationEmailSent: r.notificationEmailSent,
      notificationEmailSentAt: r.notificationEmailSentAt,
      notificationEmailError: r.notificationEmailError,
    }));

    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      const matchFileName = doc.fileName.toLowerCase().includes(q);
      const matchRecipient = recipients.some(
        (r) =>
          r.recipientName?.toLowerCase().includes(q) ||
          r.recipientEmail?.toLowerCase().includes(q)
      );
      if (!matchFileName && !matchRecipient) continue;
    }

    const viewedCount = recipients.filter((r) => r.status === "VIEWED").length;
    const total = recipients.length;
    let overallStatus: "ALL_VIEWED" | "PARTIALLY_VIEWED" | "DELIVERED" | "TRANSMITTED" = "DELIVERED";
    if (total > 0 && viewedCount === total) {
      overallStatus = "ALL_VIEWED";
    } else if (viewedCount > 0) {
      overallStatus = "PARTIALLY_VIEWED";
    }

    results.push({
      ...doc,
      recipients,
      overallStatus,
      viewedCount,
      totalRecipientsCount: total,
    });
  }

  return results;
}

// 5. Authorize and fetch document metadata
export async function getDocumentByIdAndAuthorize(
  documentId: string,
  userId: string,
  organizationId: string,
  dbInstance?: any
): Promise<{
  document: AdministrativeDocument;
  isSender: boolean;
  recipientRecord: AdministrativeDocumentRecipient | null;
}> {
  const db = dbInstance || getDb();

  // Fetch document
  let doc: AdministrativeDocument | null = null;
  if (!dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        const { data: supaDoc } = await supabase
          .from("administrative_documents")
          .select("*")
          .eq("id", documentId)
          .eq("organization_id", organizationId)
          .maybeSingle();

        if (supaDoc) {
          doc = {
            id: supaDoc.id,
            organizationId: supaDoc.organization_id,
            senderUserId: supaDoc.sender_user_id,
            senderName: supaDoc.sender_name,
            senderEmail: supaDoc.sender_email,
            fileName: supaDoc.file_name,
            fileType: supaDoc.file_type,
            fileExtension: supaDoc.file_extension,
            fileSize: supaDoc.file_size,
            fileHash: supaDoc.file_hash,
            storagePath: supaDoc.storage_path,
            storageProvider: supaDoc.storage_provider,
            batchId: supaDoc.batch_id,
            isArchived: supaDoc.is_archived,
            createdAt: supaDoc.created_at,
            updatedAt: supaDoc.updated_at,
          };
        }
      }
    } catch (_) {}
  }

  if (!doc) {
    const [localDoc] = await db
      .select()
      .from(administrativeDocuments)
      .where(
        and(
          eq(administrativeDocuments.id, documentId),
          eq(administrativeDocuments.organizationId, organizationId)
        )
      )
      .limit(1);
    doc = localDoc || null;
  }

  if (!doc) {
    throw new Error("Document introuvable.");
  }

  const isSender = doc.senderUserId === userId;

  // Check if recipient
  let recipientRecord: AdministrativeDocumentRecipient | null = null;
  if (!dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        const { data: supaRecp } = await supabase
          .from("administrative_document_recipients")
          .select("*")
          .eq("document_id", documentId)
          .eq("recipient_user_id", userId)
          .maybeSingle();

        if (supaRecp) {
          recipientRecord = {
            id: supaRecp.id,
            documentId: supaRecp.document_id,
            organizationId: supaRecp.organization_id,
            recipientUserId: supaRecp.recipient_user_id,
            recipientName: supaRecp.recipient_name,
            recipientEmail: supaRecp.recipient_email,
            status: supaRecp.status,
            deliveredAt: supaRecp.delivered_at,
            viewedAt: supaRecp.viewed_at,
            notificationEmailSent: supaRecp.notification_email_sent,
            notificationEmailSentAt: supaRecp.notification_email_sent_at,
            notificationEmailError: supaRecp.notification_email_error,
            isArchived: supaRecp.is_archived,
            createdAt: supaRecp.created_at,
            updatedAt: supaRecp.updated_at,
          };
        }
      }
    } catch (_) {}
  }

  if (!recipientRecord) {
    const [localRecp] = await db
      .select()
      .from(administrativeDocumentRecipients)
      .where(
        and(
          eq(administrativeDocumentRecipients.documentId, documentId),
          eq(administrativeDocumentRecipients.recipientUserId, userId)
        )
      )
      .limit(1);
    recipientRecord = localRecp || null;
  }

  // Strict authorization: user must be sender OR a valid recipient
  if (!isSender && !recipientRecord) {
    throw new Error("Accès refusé : vous n'êtes ni l'expéditeur ni un destinataire de ce document.");
  }

  return {
    document: doc,
    isSender,
    recipientRecord,
  };
}

// 6. Mark a document as viewed by the authenticated recipient (turns checkmarks green)
export async function markDocumentAsViewed(
  documentId: string,
  recipientUserId: string,
  organizationId: string,
  dbInstance?: any
): Promise<{ success: boolean; viewedAt: number }> {
  const { recipientRecord } = await getDocumentByIdAndAuthorize(
    documentId,
    recipientUserId,
    organizationId,
    dbInstance
  );

  if (!recipientRecord) {
    throw new Error("Seul un destinataire autorisé peut accuser réception de ce document.");
  }

  const now = Date.now();
  const db = dbInstance || getDb();
  const supabase = !dbInstance ? getSafeSupabaseClient() : null;

  // If already viewed, keep original viewedAt timestamp
  if (recipientRecord.status === "VIEWED" && recipientRecord.viewedAt) {
    return { success: true, viewedAt: recipientRecord.viewedAt };
  }

  // Update in SQLite
  await db
    .update(administrativeDocumentRecipients)
    .set({
      status: "VIEWED",
      viewedAt: now,
      updatedAt: now,
    })
    .where(eq(administrativeDocumentRecipients.id, recipientRecord.id));

  // Update in Supabase
  if (supabase) {
    try {
      await supabase
        .from("administrative_document_recipients")
        .update({
          status: "VIEWED",
          viewed_at: now,
          updated_at: now,
        })
        .eq("id", recipientRecord.id);
    } catch (_) {}
  }

  return { success: true, viewedAt: now };
}

// 7. Get document file buffer for preview or download (with strict access control)
export async function getDocumentFileBuffer(
  documentId: string,
  userId: string,
  organizationId: string,
  options?: { isViewAction?: boolean; dbInstance?: any }
): Promise<{
  buffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
}> {
  const { document, isSender, recipientRecord } = await getDocumentByIdAndAuthorize(
    documentId,
    userId,
    organizationId,
    options?.dbInstance
  );

  // If this access is done by a recipient, mark it as viewed automatically
  if (recipientRecord && (!recipientRecord.viewedAt || recipientRecord.status !== "VIEWED")) {
    await markDocumentAsViewed(documentId, userId, organizationId, options?.dbInstance).catch(
      () => {}
    );
  }

  const fullPath = path.isAbsolute(document.storagePath)
    ? document.storagePath
    : path.join(process.cwd(), document.storagePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error("Fichier introuvable sur le serveur de stockage.");
  }

  const buffer = fs.readFileSync(fullPath);
  return {
    buffer,
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
  };
}

// 8. Resend email notification for a specific recipient
export async function resendRecipientNotification(params: {
  documentId: string;
  recipientId: string;
  senderUserId: string;
  organizationId: string;
  companyName?: string;
  appOrigin?: string;
  dbInstance?: any;
}): Promise<{ success: boolean; error?: string }> {
  const { document, isSender } = await getDocumentByIdAndAuthorize(
    params.documentId,
    params.senderUserId,
    params.organizationId,
    params.dbInstance
  );

  if (!isSender) {
    throw new Error("Seul l'expéditeur du document peut relancer les notifications.");
  }

  const db = params.dbInstance || getDb();
  const supabase = !params.dbInstance ? getSafeSupabaseClient() : null;

  // Find recipient record
  const [recipient] = await db
    .select()
    .from(administrativeDocumentRecipients)
    .where(
      and(
        eq(administrativeDocumentRecipients.id, params.recipientId),
        eq(administrativeDocumentRecipients.documentId, params.documentId)
      )
    )
    .limit(1);

  if (!recipient) {
    throw new Error("Destinataire introuvable pour ce document.");
  }

  const appOrigin = params.appOrigin || resolveAppOrigin();
  const viewUrl = `${appOrigin}/admin/exchanges?docId=${document.id}`;
  const now = Date.now();

  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(document.createdAt));

  const emailData = generateAdministrativeDocumentNotificationEmail({
    recipientName: recipient.recipientName,
    senderName: document.senderName,
    companyName: params.companyName || "RKonekte",
    documentNames: [document.fileName],
    transmissionDate: formattedDate,
    viewUrl,
  });

  const emailResult = await sendEmail({
    to: recipient.recipientEmail,
    subject: emailData.subject,
    html: emailData.html,
    text: emailData.text,
  });

  if (emailResult.success) {
    await db
      .update(administrativeDocumentRecipients)
      .set({
        notificationEmailSent: true,
        notificationEmailSentAt: now,
        notificationEmailError: null,
        updatedAt: now,
      })
      .where(eq(administrativeDocumentRecipients.id, recipient.id));

    if (supabase) {
      try {
        await supabase
          .from("administrative_document_recipients")
          .update({
            notification_email_sent: true,
            notification_email_sent_at: now,
            notification_email_error: null,
            updated_at: now,
          })
          .eq("id", recipient.id);
      } catch (_) {}
    }

    return { success: true };
  } else {
    const errorMsg = emailResult.error || "Échec d'envoi de la notification";
    await db
      .update(administrativeDocumentRecipients)
      .set({
        notificationEmailSent: false,
        notificationEmailError: errorMsg,
        updatedAt: now,
      })
      .where(eq(administrativeDocumentRecipients.id, recipient.id));

    return { success: false, error: errorMsg };
  }
}

// 8. Delete administrative document
export async function deleteAdministrativeDocument(
  documentId: string,
  userId: string,
  organizationId: string,
  dbInstance?: any
): Promise<{ success: boolean; documentId: string }> {
  const db = dbInstance || getDb();

  // 1. Authorize: fetch document and check ownership
  const { document, isSender } = await getDocumentByIdAndAuthorize(
    documentId,
    userId,
    organizationId,
    dbInstance
  );

  if (!isSender) {
    throw new Error("Seul l'expéditeur de ce document est autorisé à le supprimer.");
  }

  // 2. Remove from Supabase if connected
  if (!dbInstance) {
    try {
      const supabase = getSafeSupabaseClient();
      if (supabase) {
        await supabase
          .from("administrative_document_recipients")
          .delete()
          .eq("document_id", documentId)
          .eq("organization_id", organizationId);

        await supabase
          .from("administrative_documents")
          .delete()
          .eq("id", documentId)
          .eq("organization_id", organizationId);
      }
    } catch (_) {}
  }

  // 3. Remove from SQLite local
  await db
    .delete(administrativeDocumentRecipients)
    .where(
      and(
        eq(administrativeDocumentRecipients.documentId, documentId),
        eq(administrativeDocumentRecipients.organizationId, organizationId)
      )
    );

  await db
    .delete(administrativeDocuments)
    .where(
      and(
        eq(administrativeDocuments.id, documentId),
        eq(administrativeDocuments.organizationId, organizationId)
      )
    );

  // 4. Clean up file on disk
  try {
    if (document.storagePath && fs.existsSync(document.storagePath)) {
      fs.unlinkSync(document.storagePath);
    }
  } catch (_) {}

  return { success: true, documentId };
}

