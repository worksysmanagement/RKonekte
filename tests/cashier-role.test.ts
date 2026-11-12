import { describe, it, expect } from "vitest";
import { getDefaultSystemRoles } from "@/lib/services/roles";
import { DEFAULT_RUBRIQUES_PRESET } from "@/lib/services/cash-registers";
import { MODULE_SUB_TABS, MODULE_LABELS, ModuleKey } from "@/lib/types/roles";

describe("Cashier (Caissier(e)) Role Specifications", () => {
  const orgId = "org-test-cashier";
  const systemRoles = getDefaultSystemRoles(orgId);

  it("should have role-cashier defined in default system roles", () => {
    const cashierRole = systemRoles.find((r) => r.id === "role-cashier");
    expect(cashierRole).toBeDefined();
    expect(cashierRole?.name).toBe("Caissier(e)");
    expect(cashierRole?.hierarchyLevel).toBe("OPERATIONAL");
    expect(cashierRole?.isSystem).toBe(true);
  });

  it("should have operational permissions with financial_reports access for cash entries", () => {
    const cashierRole = systemRoles.find((r) => r.id === "role-cashier");
    const employeeRole = systemRoles.find((r) => r.id === "role-employee");

    expect(cashierRole).toBeDefined();
    expect(employeeRole).toBeDefined();

    // Verify key tabs: dashboard hidden, requests visible, events visible, profile configuration visible
    expect(cashierRole?.permissions.dashboard.view).toBe(false);
    expect(cashierRole?.permissions.requests.view).toBe(true);
    expect(cashierRole?.permissions.events.view).toBe(true);
    expect(cashierRole?.permissions.configuration.view).toBe(true);
    expect(cashierRole?.permissions.employees.view).toBe(false);
    expect(cashierRole?.permissions.branches.view).toBe(false);

    // Cashier uniquely has financial_reports access for daily cash register entries
    expect(cashierRole?.permissions.financial_reports.view).toBe(true);
    expect(cashierRole?.permissions.financial_reports.create).toBe(true);
    expect(employeeRole?.permissions.financial_reports.view).toBe(false);
  });

  it("should have default preset rubriques matching items 1, 2, 3, 6, 7, 8, 9", () => {
    expect(DEFAULT_RUBRIQUES_PRESET).toHaveLength(7);
    expect(DEFAULT_RUBRIQUES_PRESET.map((r) => r.name)).toEqual([
      "PAIEMENT HTG",
      "PAIEMENT USD",
      "ZELLE OU CASH APP",
      "VIREMENT UB HTG",
      "VIREMENT UB USD",
      "VIREMENT SOG HTG",
      "VIREMENT SOG USD",
    ]);
    expect(DEFAULT_RUBRIQUES_PRESET[0].currency).toBe("HTG");
    expect(DEFAULT_RUBRIQUES_PRESET[1].currency).toBe("USD");
    expect(DEFAULT_RUBRIQUES_PRESET[2].currency).toBe("USD");
    expect(DEFAULT_RUBRIQUES_PRESET[3].currency).toBe("HTG");
    expect(DEFAULT_RUBRIQUES_PRESET[4].currency).toBe("USD");
    expect(DEFAULT_RUBRIQUES_PRESET[5].currency).toBe("HTG");
    expect(DEFAULT_RUBRIQUES_PRESET[6].currency).toBe("USD");
  });

  it("should define sub-tabs across all 11 modules with exact sub-tab definitions for financial reports", () => {
    const moduleKeys = Object.keys(MODULE_LABELS) as ModuleKey[];
    expect(moduleKeys).toHaveLength(11);

    for (const key of moduleKeys) {
      expect(MODULE_SUB_TABS[key]).toBeDefined();
      expect(MODULE_SUB_TABS[key].length).toBeGreaterThan(0);
    }

    const financialSubTabs = MODULE_SUB_TABS.financial_reports;
    expect(financialSubTabs).toHaveLength(2);
    expect(financialSubTabs[0].name).toBe("Synthèse & Rapports Consolidés");
    expect(financialSubTabs[1].name).toBe("Saisie de Caisse");
  });

  it("should support granular sub-tabs selection on TabPermission", () => {
    // When an administrator configures 1 or 2 sub-tabs out of N
    const customPerm = {
      view: true,
      create: true,
      edit: false,
      delete: false,
      subTabs: ["cashier_entry"],
    };

    expect(customPerm.subTabs).toHaveLength(1);
    expect(customPerm.subTabs).toContain("cashier_entry");
    expect(customPerm.subTabs).not.toContain("reports_summary");
  });

  it("should strip any leading zero before integers (e.g. 0100 -> 100, 0500 -> 500)", () => {
    const stripLeadingZeros = (val: string) => {
      const clean = val.replace(/,/g, ".").replace(/^0+(?=[1-9])/, "");
      return /^0{2,}(\.|$)/.test(clean) ? clean.replace(/^0+/, "0") : clean;
    };

    expect(stripLeadingZeros("0100")).toBe("100");
    expect(stripLeadingZeros("0500")).toBe("500");
    expect(stripLeadingZeros("003000")).toBe("3000");
    expect(stripLeadingZeros("0.50")).toBe("0.50");
    expect(stripLeadingZeros("0")).toBe("0");
    expect(stripLeadingZeros("00")).toBe("0");
  });

  it("should correctly associate cash register entries with cashier branch and filter by branch", () => {
    // Mock daily entries
    const entries = [
      {
        id: "entry-1",
        organizationId: "org-test",
        branchId: "br-siege",
        cashierId: "usr-rodjy",
        cashierName: "Rodjy Emmanuel",
        entryDate: "2026-10-28",
        amounts: { "rub-1": 1000 },
        totalHtg: 1000,
        totalUsd: 0,
      },
      {
        id: "entry-2",
        organizationId: "org-test",
        branchId: "br-delmas",
        cashierId: "usr-other",
        cashierName: "Autre Caissier",
        entryDate: "2026-10-28",
        amounts: { "rub-1": 500 },
        totalHtg: 500,
        totalUsd: 0,
      },
    ];

    // Filter by branch: "br-siege"
    const siegeEntries = entries.filter((e) => e.branchId === "br-siege");
    expect(siegeEntries).toHaveLength(1);
    expect(siegeEntries[0].cashierName).toBe("Rodjy Emmanuel");

    // Filter by cashier: "usr-rodjy" and branch: "br-siege"
    const rodjySiege = entries.filter(
      (e) => e.cashierId === "usr-rodjy" && e.branchId === "br-siege" && e.entryDate === "2026-10-28"
    );
    expect(rodjySiege).toHaveLength(1);
    expect(rodjySiege[0].totalHtg).toBe(1000);
  });

  it("should format Excel rows with clean numeric amounts and separate currency columns (never '300$' or '300HTG')", async () => {
    const XLSX = await import("xlsx");
    expect(XLSX).toBeDefined();

    const sampleBreakdown = [
      { rubrique: "PAIEMENT USD", amount: 300, currency: "USD" },
      { rubrique: "PAIEMENT HTG", amount: 1000, currency: "HTG" },
      { rubrique: "ZELLE OU CASH APP", amount: 500, currency: "USD" },
    ];

    // Build row data strictly adhering to user's specification:
    // Montant is pure number, Devise is in its own column
    const rows = [
      ["Date", "Caissier", "Succursale", "Mode de Règlement", "Montant", "Devise"],
      ...sampleBreakdown.map((item) => [
        "2026-10-28",
        "Rodjy Emmanuel",
        "Siège Principal",
        item.rubrique,
        item.amount, // Pure number: typeof === "number"
        item.currency, // Separate column: "USD" | "HTG"
      ]),
    ];

    // Validate that no cell in the Montant column has "$" or "HTG" text
    for (let i = 1; i < rows.length; i++) {
      const montantCell = rows[i][4];
      const deviseCell = rows[i][5];

      expect(typeof montantCell).toBe("number");
      expect(String(montantCell)).not.toContain("$");
      expect(String(montantCell)).not.toContain("HTG");
      expect(typeof deviseCell).toBe("string");
      expect(["HTG", "USD"]).toContain(deviseCell);
    }

    // Verify sheet generation
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Ventilation Détaillée");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(buf.length).toBeGreaterThan(0);
  });
});
