import { describe, it, expect } from "vitest";
import {
  listSignatureAuthRequests,
  createSignatureAuthRequest,
  updateSignatureAuthRequest,
  deleteSignatureAuthRequest,
} from "@/lib/services/signature-auth";

describe("Signature Authorization Server Service", () => {
  it("loads signature authorization requests from database", async () => {
    const list = await listSignatureAuthRequests();
    expect(Array.isArray(list)).toBe(true);
  });

  it("creates a new signature authorization request with generated SIG ID and PENDING status", async () => {
    const newReq = await createSignatureAuthRequest({
      applicantName: "Jean Dupont",
      applicantRole: "Ingénieur Test",
      employeeNumber: "EB-TEST-999",
      branch: "Siège Test",
      pdfFileName: "Bon_Commande_Test.pdf",
      pdfFileSize: "120 Ko",
      description: "Achat fournitures de test",
    });

    expect(newReq.id).toMatch(/^SIG-2026-\d{3}$/);
    expect(newReq.status).toBe("PENDING");
    expect(newReq.pdfFileName).toBe("Bon_Commande_Test.pdf");

    // Check it appears in listing
    const list = await listSignatureAuthRequests();
    expect(list.some((r) => r.id === newReq.id)).toBe(true);

    // Update status to APPROVED
    const updated = await updateSignatureAuthRequest(newReq.id, {
      status: "APPROVED",
      authorizedBy: "Directeur Général",
      signatureUrl: "data:image/svg+xml;utf8,<svg></svg>",
    });
    expect(updated?.status).toBe("APPROVED");
    expect(updated?.authorizedBy).toBe("Directeur Général");

    // Delete request
    const deleted = await deleteSignatureAuthRequest(newReq.id);
    expect(deleted).toBe(true);
    const finalList = await listSignatureAuthRequests();
    expect(finalList.some((r) => r.id === newReq.id)).toBe(false);
  });

  it("permanently deletes an item from the database so it never returns on subsequent list calls", async () => {
    const req = await createSignatureAuthRequest({
      applicantName: "A Supprimer",
      applicantRole: "Stagiaire",
      employeeNumber: "EB-DEL-001",
      branch: "Siège Test",
      pdfFileName: "A_Supprimer.pdf",
      pdfFileSize: "10 Ko",
      description: "Demande temporaire à supprimer définitivement",
    });

    let list = await listSignatureAuthRequests();
    expect(list.some((r) => r.id === req.id)).toBe(true);

    const success = await deleteSignatureAuthRequest(req.id);
    expect(success).toBe(true);

    list = await listSignatureAuthRequests();
    expect(list.some((r) => r.id === req.id)).toBe(false);

    // Simulate page refresh
    const refreshedList = await listSignatureAuthRequests();
    expect(refreshedList.some((r) => r.id === req.id)).toBe(false);
  });
});
