import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runMigrations } from "../scripts/migrate";
import { getDb } from "../src/lib/db/client";
import { organizations, users, administrativeDocuments, administrativeDocumentRecipients } from "../src/db/schema";
import { eq } from "drizzle-orm";
import * as emailNotifications from "../src/lib/notifications/email";
import {
  transmitAdministrativeDocuments,
  listReceivedDocuments,
  listSentDocuments,
  getDocumentFileBuffer,
  markDocumentAsViewed,
  listEligibleAdminRecipients,
  resendRecipientNotification,
  deleteAdministrativeDocument,
} from "../src/lib/services/administrative-exchanges";
import { hashPassword } from "../src/lib/auth/password";
import fs from "fs";
import path from "path";

describe("Administrative Exchanges Module (Échanges Administratifs)", () => {
  const db = getDb();
  const orgId = "org_test_exchanges_1";
  const now = Date.now();

  let adminA: any;
  let adminB: any;
  let adminC: any;
  let employee1: any;

  beforeEach(async () => {
    vi.spyOn(emailNotifications, "sendEmail").mockResolvedValue({
      success: true,
      id: "mock_email_123",
    });

    await runMigrations();

    // Clean up only our test records (child tables first to satisfy foreign keys)
    await db
      .delete(administrativeDocumentRecipients)
      .where(eq(administrativeDocumentRecipients.organizationId, orgId));
    await db
      .delete(administrativeDocuments)
      .where(eq(administrativeDocuments.organizationId, orgId));
    await db.delete(users).where(eq(users.organizationId, orgId));

    // Ensure test organization exists
    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!existingOrg) {
      await db.insert(organizations).values({
        id: orgId,
        name: "Entreprise Alpha SARL",
        slug: `alpha-sarl-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }

    const pwdHash = await hashPassword("Secret123!");

    // Create Admin A (PDG / Expéditeur)
    adminA = {
      id: "usr_admin_a",
      organizationId: orgId,
      name: "Alice Déclaration (PDG)",
      email: "alice@alpha.com",
      passwordHash: pwdHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(users).values(adminA);

    // Create Admin B (Directeur Général / Destinataire légitime)
    adminB = {
      id: "usr_admin_b",
      organizationId: orgId,
      name: "Bob Directeur",
      email: "bob@alpha.com",
      passwordHash: pwdHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(users).values(adminB);

    // Create Admin C (Autre Administrateur NON concerné)
    adminC = {
      id: "usr_admin_c",
      organizationId: orgId,
      name: "Charlie Tiers",
      email: "charlie@alpha.com",
      passwordHash: pwdHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(users).values(adminC);

    // Create Employee (Non administrateur)
    employee1 = {
      id: "usr_emp_1",
      organizationId: orgId,
      name: "David Caissier",
      email: "david@alpha.com",
      passwordHash: pwdHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(users).values(employee1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Lists only other active administrators in eligible recipients directory (excludes employees and self)", async () => {
    const recipients = await listEligibleAdminRecipients(orgId, adminA.id, db);
    const recipientIds = recipients.map((r) => r.id);

    expect(recipients).toHaveLength(2);
    expect(recipientIds).toContain(adminB.id);
    expect(recipientIds).toContain(adminC.id);
    expect(recipientIds).not.toContain(adminA.id); // Cannot send to self
    expect(recipientIds).not.toContain(employee1.id); // Ordinary employee excluded
  });

  it("2. Allows an administrator to transmit multiple documents to selected administrators", async () => {
    const file1 = {
      originalName: "Rapport_Trimestriel_T3.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Mock PDF Content For Administrative Transmission"),
    };
    const file2 = {
      originalName: "Budget_Previsionnel_2027.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("Mock Excel Binary Content For Administrative Transmission"),
    };

    const result = await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [file1, file2],
      companyName: "Entreprise Alpha SARL",
      dbInstance: db,
    });

    expect(result.count).toBe(2);
    expect(result.documents).toHaveLength(2);
    expect(result.batchId).toBeDefined();

    // Verify file written to disk
    const doc1 = result.documents[0];
    const fullStoragePath = path.join(process.cwd(), doc1.storagePath);
    expect(fs.existsSync(fullStoragePath)).toBe(true);

    // Verify stored content matches original buffer
    const savedBuffer = fs.readFileSync(fullStoragePath);
    expect(savedBuffer.equals(file1.buffer)).toBe(true);
  });

  it("3. Strict isolation: Admin B sees received documents; Admin C sees ZERO received documents", async () => {
    const file = {
      originalName: "Contrat_Confidentiel.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Confidential Contract Between Admin A and Admin B"),
    };

    await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [file],
      dbInstance: db,
    });

    // Admin B's inbox
    const bReceived = await listReceivedDocuments(orgId, adminB.id, { dbInstance: db });
    expect(bReceived).toHaveLength(1);
    expect(bReceived[0].fileName).toBe("Contrat_Confidentiel.pdf");
    expect(bReceived[0].senderName).toBe(adminA.name);
    expect(bReceived[0].isUnread).toBe(true);
    expect(bReceived[0].status).toBe("DELIVERED");

    // Admin C's inbox (Strict zero leak!)
    const cReceived = await listReceivedDocuments(orgId, adminC.id, { dbInstance: db });
    expect(cReceived).toHaveLength(0);
  });

  it("4. Strict isolation: Admin C is forbidden from downloading or viewing documents exchanged between A and B", async () => {
    const file = {
      originalName: "Secret_Comptable.xlsx",
      mimeType: "application/vnd.ms-excel",
      buffer: Buffer.from("Sensitive accounting formulas"),
    };

    const result = await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [file],
      dbInstance: db,
    });

    const docId = result.documents[0].id;

    // Admin B (authorized) can download
    const bDownload = await getDocumentFileBuffer(docId, adminB.id, orgId, { dbInstance: db });
    expect(bDownload.fileName).toBe("Secret_Comptable.xlsx");
    expect(bDownload.buffer.length).toBe(file.buffer.length);

    // Admin A (sender) can download a copy
    const aDownload = await getDocumentFileBuffer(docId, adminA.id, orgId, { dbInstance: db });
    expect(aDownload.fileName).toBe("Secret_Comptable.xlsx");

    // Admin C (not a participant) MUST be denied with an authorization error
    await expect(
      getDocumentFileBuffer(docId, adminC.id, orgId, { dbInstance: db })
    ).rejects.toThrow(/Accès refusé/);

    // Employee David MUST be denied
    await expect(
      getDocumentFileBuffer(docId, employee1.id, orgId, { dbInstance: db })
    ).rejects.toThrow(/Accès refusé/);
  });

  it("5. Accusé de réception (WhatsApp Checkmarks): evolutes from DELIVERED to VIEWED only after actual consultation", async () => {
    const file = {
      originalName: "Note_Interne_Strategique.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Internal Note Content"),
    };

    const result = await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [file],
      dbInstance: db,
    });

    const docId = result.documents[0].id;

    // Before B opens the document: Sent list shows DELIVERED (two grey checks)
    let sentDocs = await listSentDocuments(orgId, adminA.id, { dbInstance: db });
    expect(sentDocs).toHaveLength(1);
    expect(sentDocs[0].overallStatus).toBe("DELIVERED");
    expect(sentDocs[0].recipients[0].status).toBe("DELIVERED");
    expect(sentDocs[0].recipients[0].viewedAt).toBeNull();

    // Admin B explicitly views / downloads the document
    await markDocumentAsViewed(docId, adminB.id, orgId, db);

    // Now: Sent list shows ALL_VIEWED (two green checks) with exact timestamp
    sentDocs = await listSentDocuments(orgId, adminA.id, { dbInstance: db });
    expect(sentDocs[0].overallStatus).toBe("ALL_VIEWED");
    expect(sentDocs[0].recipients[0].status).toBe("VIEWED");
    expect(sentDocs[0].recipients[0].viewedAt).toBeGreaterThan(0);

    // Admin B's received item is now marked as not unread
    const bReceived = await listReceivedDocuments(orgId, adminB.id, { dbInstance: db });
    expect(bReceived[0].isUnread).toBe(false);
    expect(bReceived[0].status).toBe("VIEWED");
  });

  it("6. Rejects unauthorized file extensions (e.g. .exe or .html) and empty files", async () => {
    const badFile = {
      originalName: "malware.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ malicious executable header"),
    };

    await expect(
      transmitAdministrativeDocuments({
        organizationId: orgId,
        senderUser: { id: adminA.id, name: adminA.name, email: adminA.email },
        recipientIds: [adminB.id],
        files: [badFile],
        dbInstance: db,
      })
    ).rejects.toThrow(/n'est pas autorisé/);

    const emptyFile = {
      originalName: "vide.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(0),
    };

    await expect(
      transmitAdministrativeDocuments({
        organizationId: orgId,
        senderUser: { id: adminA.id, name: adminA.name, email: adminA.email },
        recipientIds: [adminB.id],
        files: [emptyFile],
        dbInstance: db,
      })
    ).rejects.toThrow(/est vide/);
  });

  it("7. Supports resending email notification without altering or losing the document", async () => {
    const file = {
      originalName: "Rapport_Audit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Audit Report Content"),
    };

    const result = await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: { id: adminA.id, name: adminA.name, email: adminA.email },
      recipientIds: [adminB.id],
      files: [file],
      dbInstance: db,
    });

    const docId = result.documents[0].id;
    const sent = await listSentDocuments(orgId, adminA.id, { dbInstance: db });
    const recpRecordId = sent[0].recipients[0].id;

    // Non-sender cannot trigger resend
    await expect(
      resendRecipientNotification({
        documentId: docId,
        recipientId: recpRecordId,
        senderUserId: adminB.id, // Bob is not sender
        organizationId: orgId,
        dbInstance: db,
      })
    ).rejects.toThrow(/Seul l'expéditeur/);

    // Sender can trigger resend successfully
    const resendRes = await resendRecipientNotification({
      documentId: docId,
      recipientId: recpRecordId,
      senderUserId: adminA.id,
      organizationId: orgId,
      dbInstance: db,
    });

    expect(resendRes.success).toBe(true);
  });

  it("8. Filters sent documents by recipient name or document name", async () => {
    // First transmit a document to Admin B (Bob)
    await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [
        {
          originalName: "Rapport_Trimestriel.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 Content"),
        },
      ],
      dbInstance: db,
    });

    // Search by recipient Bob's name
    const matchesBob = await listSentDocuments(orgId, adminA.id, {
      search: "Bob",
      dbInstance: db,
    });
    expect(matchesBob.length).toBeGreaterThan(0);
    expect(matchesBob.every((d) => d.recipients.some((r) => r.recipientName.includes("Bob")))).toBe(true);

    // Search by document name
    const matchesDoc = await listSentDocuments(orgId, adminA.id, {
      search: "Trimestriel",
      dbInstance: db,
    });
    expect(matchesDoc.length).toBeGreaterThan(0);

    // Search by non-existent name
    const matchesNone = await listSentDocuments(orgId, adminA.id, {
      search: "UtilisateurInexistantXYZ",
      dbInstance: db,
    });
    expect(matchesNone.length).toBe(0);
  });

  it("9. Allows an administrator to delete their sent document, removing recipient entries and physical storage", async () => {
    // Admin A sends document to Admin B
    const result = await transmitAdministrativeDocuments({
      organizationId: orgId,
      senderUser: {
        id: adminA.id,
        name: adminA.name,
        email: adminA.email,
      },
      recipientIds: [adminB.id],
      files: [
        {
          originalName: "Document_To_Delete.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 Temp Content To Delete"),
        },
      ],
      dbInstance: db,
    });

    const docId = result.documents[0].id;

    // Verify Admin B sees it
    const bReceivedBefore = await listReceivedDocuments(orgId, adminB.id, { dbInstance: db });
    expect(bReceivedBefore.some((d) => d.documentId === docId)).toBe(true);

    // Admin C (third-party) tries to delete -> should fail with Access Denied
    await expect(
      deleteAdministrativeDocument(docId, adminC.id, orgId, db)
    ).rejects.toThrow(/Accès refusé/);

    // Admin B (recipient, not sender) tries to delete -> should fail with Sender Only
    await expect(
      deleteAdministrativeDocument(docId, adminB.id, orgId, db)
    ).rejects.toThrow(/Seul l'expéditeur/);

    // Admin A (sender) deletes the document
    const deleteResult = await deleteAdministrativeDocument(docId, adminA.id, orgId, db);
    expect(deleteResult.success).toBe(true);
    expect(deleteResult.documentId).toBe(docId);

    // Verify Admin B NO LONGER sees it
    const bReceivedAfter = await listReceivedDocuments(orgId, adminB.id, { dbInstance: db });
    expect(bReceivedAfter.some((d) => d.documentId === docId)).toBe(false);

    // Verify Admin A NO LONGER sees it in sent documents
    const aSentAfter = await listSentDocuments(orgId, adminA.id, { dbInstance: db });
    expect(aSentAfter.some((d) => d.id === docId)).toBe(false);
  });
});
