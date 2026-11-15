import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatSender,
  resolveAppOrigin,
  generateCompanyActivationEmail,
  generatePasswordResetEmail,
  generateEmployeeInvitationEmail,
  generateCompanyApprovedEmail,
  sendEmail,
} from "../src/lib/notifications/email";

describe("Email Deliverability & Password Setup Templates", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("formats sender headers cleanly across quoted, escaped, and bare addresses", () => {
    expect(formatSender('"\\"Rkonekte\\" <rkonekte509@gmail.com>"')).toEqual({
      name: "RKonekte",
      address: "rkonekte509@gmail.com",
    });

    expect(formatSender('"RKonekte" <noreply@rkonekte.com>')).toEqual({
      name: "RKonekte",
      address: "noreply@rkonekte.com",
    });

    expect(formatSender("support@rkonekte.com")).toEqual({
      name: "RKonekte",
      address: "support@rkonekte.com",
    });
  });

  it("resolves production APP_URL ahead of localhost headers, and prefers forwarded HTTPS host over localhost APP_URL", () => {
    process.env.APP_URL = "https://app.rkonekte.com/";
    const localHeaders = new Headers({ host: "localhost:3000" });
    expect(resolveAppOrigin(localHeaders)).toBe("https://app.rkonekte.com");

    process.env.APP_URL = "http://localhost:3000";
    const prodProxyHeaders = new Headers({
      host: "internal-worker:3000",
      "x-forwarded-host": "app.rkonekte.com",
      "x-forwarded-proto": "https",
    });
    expect(resolveAppOrigin(prodProxyHeaders)).toBe("https://app.rkonekte.com");

    const devHeaders = new Headers({ host: "localhost:3000" });
    expect(resolveAppOrigin(devHeaders)).toBe("http://localhost:3000");
  });

  it("generates spam-clean activation, reset, invitation, and approval emails without external stylesheets or promotional phrasing", () => {
    const activation = generateCompanyActivationEmail({
      recipientName: "Jeff & <Admin>",
      companyName: "Jeff Int",
      email: "jeff@company.com",
      activationUrl: "https://app.rkonekte.com/verify-company?token=abc-123",
    });

    const resetInitial = generatePasswordResetEmail({
      recipientName: "Marc Antoine",
      email: "marc@company.com",
      companyName: "Jeff Int",
      actionUrl: "https://app.rkonekte.com/verify-company?token=def-456",
      isInitialSetup: true,
    });

    const resetStandard = generatePasswordResetEmail({
      recipientName: "Marc Antoine",
      email: "marc@company.com",
      companyName: "Jeff Int",
      actionUrl: "https://app.rkonekte.com/reset-password?token=ghi-789",
      isInitialSetup: false,
      expiresInLabel: "1 heure",
    });

    const invite = generateEmployeeInvitationEmail({
      firstName: "Claire",
      lastName: "Louis",
      employeeNumber: "JEFF-001",
      companyName: "Jeff Int",
      email: "claire@company.com",
      inviteUrl: "https://app.rkonekte.com/reset-password?token=inv-000",
    });

    const approved = generateCompanyApprovedEmail({
      recipientName: "Jeff",
      companyName: "Jeff Int",
      email: "jeff@company.com",
      tempPassword: "Temp&Pass<123>",
      loginUrl: "https://app.rkonekte.com/login",
    });

    const templates = [
      { ...activation, expectedUrl: "https://app.rkonekte.com/verify-company?token=abc-123" },
      { ...resetInitial, expectedUrl: "https://app.rkonekte.com/verify-company?token=def-456" },
      { ...resetStandard, expectedUrl: "https://app.rkonekte.com/reset-password?token=ghi-789" },
      { ...invite, expectedUrl: "https://app.rkonekte.com/reset-password?token=inv-000" },
      { ...approved, expectedUrl: "https://app.rkonekte.com/login" },
    ];

    for (const tpl of templates) {
      expect(tpl.html).toContain('<html lang="fr">');
      expect(tpl.html).toContain('<table role="presentation"');
      expect(tpl.html).not.toContain("fonts.googleapis.com");
      expect(tpl.html).not.toContain("@import url(");
      expect(tpl.html).not.toContain("box-shadow");
      expect(tpl.html).not.toContain("Important (N.B.)");
      expect(tpl.html).not.toContain("Félicitations !");
      expect(tpl.html).toContain(tpl.expectedUrl);
      expect(tpl.text).toContain(tpl.expectedUrl);
      expect(tpl.subject).not.toMatch(/^\[RKonekte\]|\[Accès Officiel\]/);
    }

    // Verify XSS/HTML escaping on dynamic content
    expect(activation.html).toContain("Jeff &amp; &lt;Admin&gt;");
    expect(activation.html).not.toContain("<Admin>");
    expect(approved.html).toContain("Temp&amp;Pass&lt;123&gt;");
  });

  it("prefers Resend API when RESEND_API_KEY and a verified custom domain EMAIL_FROM are configured", async () => {
    process.env.RESEND_API_KEY = "re_live_test_key_12345";
    process.env.EMAIL_FROM = '"RKonekte" <noreply@rkonekte.com>';
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "rkonekte509@gmail.com";
    process.env.SMTP_PASS = "fallback-pass";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-msg-42" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendEmail({
      to: "user@gmail.com",
      subject: "Configuration de votre mot de passe RKonekte",
      html: "<p>Test HTML</p>",
      text: "Test plain",
    });

    expect(res.success).toBe(true);
    expect(res.id).toBe("resend-msg-42");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(init.body);
    expect(payload.from).toBe('RKonekte <noreply@rkonekte.com>');
    expect(payload.text).toBe("Test plain");
    expect(payload.headers["X-Entity-Ref-ID"]).toBeTruthy();
    expect(payload.headers["X-Auto-Response-Suppress"]).toBe("OOF, AutoReply");
  });

  it("sends SMTP transactional headers cleanly without injecting unsolicited replyTo", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "rkonekte509@gmail.com";
    process.env.SMTP_PASS = "test-pass";
    process.env.EMAIL_FROM = '"RKonekte" <rkonekte509@gmail.com>';

    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "<smtp-id-1@gmail.com>" });
    const nodemailerModule = await import("nodemailer");
    vi.spyOn(nodemailerModule.default, "createTransport").mockReturnValue({
      sendMail: sendMailMock,
    } as any);

    const res = await sendEmail({
      to: "recipient@gmail.com",
      subject: "Finalisez votre accès",
      html: "<p>Bonjour</p>",
      text: "Bonjour",
    });

    expect(res.success).toBe(true);
    expect(res.id).toBe("<smtp-id-1@gmail.com>");
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArg = sendMailMock.mock.calls[0][0];
    expect(mailArg.from).toEqual({ name: "RKonekte", address: "rkonekte509@gmail.com" });
    expect(mailArg.replyTo).toBeUndefined();
    expect(mailArg.text).toBe("Bonjour");
    expect(mailArg.headers["X-Entity-Ref-ID"]).toBeTruthy();
  });
});
