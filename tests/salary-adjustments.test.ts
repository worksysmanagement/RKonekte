import { describe, it, expect, beforeEach } from "vitest";
import {
  listSalaryAdjustments,
  createSalaryAdjustment,
  resendSalaryNotification,
  deleteSalaryAdjustment,
} from "@/lib/services/salary-adjustments";
import { buildWhatsAppSalaryRevisionMessage, generateWhatsAppDirectLink } from "@/lib/notifications/whatsapp";
import { generateSalaryRevisionEmail } from "@/lib/notifications/email";

describe("Salary Adjustment & Notification System", () => {
  const testOrgId = "test-org-salary-101";

  it("lists existing salary adjustments", async () => {
    const list = await listSalaryAdjustments();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(0);
  });

  it("builds formatted WhatsApp message and direct wa.me link with salary details", () => {
    const message = buildWhatsAppSalaryRevisionMessage({
      employeeFirstName: "Jean",
      reference: "SAL-2026-003",
      previousSalary: "50 000",
      newSalary: "70 000",
      currency: "HTG",
      effectiveDate: "2026-11-01",
      reason: "Promotion Responsable Équipe",
      companyName: "RKonekte",
    });

    expect(message).toContain("Bonjour Jean");
    expect(message).toContain("50 000 HTG");
    expect(message).toContain("70 000 HTG");
    expect(message).toContain("SAL-2026-003");
    expect(message).toContain("Promotion Responsable Équipe");

    const link = generateWhatsAppDirectLink("+509 3700 1234", message);
    expect(link).toContain("https://wa.me/50937001234?text=");
    expect(link).toContain(encodeURIComponent("SAL-2026-003"));
  });

  it("generates structured HTML email for salary revision notification", () => {
    const { subject, html } = generateSalaryRevisionEmail({
      reference: "SAL-2026-003",
      employeeName: "Jean Kouassi",
      previousSalary: "50 000",
      newSalary: "70 000",
      currency: "HTG",
      effectiveDate: "2026-11-01",
      reason: "Promotion Responsable Équipe",
      decidedBy: "Direction Générale",
    });

    expect(subject).toContain("RÉVISION SALARIALE");
    expect(subject).toContain("SAL-2026-003");
    expect(html).toContain("Jean Kouassi");
    expect(html).toContain("70 000");
    expect(html).toContain("50 000");
    expect(html).toContain("Promotion Responsable Équipe");
  });

  it("creates a new salary adjustment with WhatsApp and Email tracking", async () => {
    const created = await createSalaryAdjustment(
      testOrgId,
      {
        employeeName: "Marc Bamba",
        employeeNumber: "TEC-888",
        department: "Réseaux",
        branch: "Succursale Delmas",
        phone: "+509 3888 9999",
        email: "marc.bamba@example.com",
        previousSalary: "60 000",
        newSalary: "80 000",
        currency: "HTG",
        effectiveDate: "2026-11-01",
        reason: "Revalorisation annuelle",
        sendWhatsApp: true,
        sendEmail: true,
      },
      "Direction Générale"
    );

    expect(created.id).toMatch(/^SAL-\d{4}-\d{3}$/);
    expect(created.employeeName).toBe("Marc Bamba");
    expect(created.newSalary).toBe("80 000");
    expect(created.whatsappDirectUrl).toBeDefined();
    expect(created.whatsappDirectUrl).toContain("https://wa.me/50938889999");

    // Resend notification
    const resendRes = await resendSalaryNotification(testOrgId, created.id, "whatsapp");
    expect(resendRes.success).toBe(true);

    // Delete
    const deleted = await deleteSalaryAdjustment(testOrgId, created.id);
    expect(deleted).toBe(true);
  });
});
