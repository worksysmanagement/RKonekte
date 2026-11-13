import { describe, it, expect, beforeEach } from "vitest";
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  listBankTransactions,
  createBankTransaction,
  deleteBankTransaction,
  getBankSummaryStats,
} from "@/lib/services/bank-operations";

describe("Bank Operations Service (Opérations Financières)", () => {
  const testOrgId = "test-org-bank-999";

  it("lists active bank accounts and creates a new account with custom bank name and initialBalanceDate", async () => {
    const newAccount = await createBankAccount(testOrgId, {
      bankName: "Banque Nationale de Crédit",
      accountName: "Compte Recettes",
      accountNumber: "201-9988-123456",
      currency: "HTG",
      initialBalance: 50000,
      initialBalanceDate: "2026-01-15",
      branchName: "Succursale Sud",
    });

    expect(newAccount.id).toBeDefined();
    expect(newAccount.bankName).toBe("Banque Nationale de Crédit");
    expect(newAccount.currency).toBe("HTG");
    expect(newAccount.currentBalance).toBe(50000);
    expect(newAccount.initialBalanceDate).toBe("2026-01-15");
    expect(newAccount.branchId).toBeNull();
    expect(newAccount.branchName).toBe("Compte de l'entreprise");

    const allAccounts = await listBankAccounts(testOrgId);
    expect(allAccounts.some((a) => a.id === newAccount.id && a.initialBalanceDate === "2026-01-15")).toBe(true);
  });

  it("records a deposit (versement) and automatically increases the bank account balance", async () => {
    const acc = await createBankAccount(testOrgId, {
      bankName: "Sogebank",
      accountName: "Trésorerie Centrale",
      accountNumber: "300-4455-778899",
      currency: "HTG",
      initialBalance: 100000,
    });

    const tx = await createBankTransaction(
      testOrgId,
      {
        type: "DEPOSIT",
        bankAccountId: acc.id,
        amount: 25000,
        referenceNumber: "BOR-2026-8899",
        reason: "Versement recettes du jour",
        date: "2026-10-29",
      },
      {
        name: "Administrateur Test",
        employeeNumber: "ADM-01",
        role: "ORGANIZATION_ADMIN",
      }
    );

    expect(tx.id.startsWith("DEP-")).toBe(true);
    expect(tx.amount).toBe(25000);
    expect(tx.referenceNumber).toBe("BOR-2026-8899");
    expect(tx.authorName).toBe("Administrateur Test");
    expect(tx.delegateName).toBeUndefined(); // Délégué de dépôt facultatif
    expect(tx.receiptDataUrl).toBeUndefined(); // Justificatif facultatif

    // Record another deposit with an optional delegateName
    const delegatedTx = await createBankTransaction(
      testOrgId,
      {
        type: "DEPOSIT",
        bankAccountId: acc.id,
        amount: 10000,
        referenceNumber: "BOR-2026-8900",
        reason: "Versement via coursier",
        date: "2026-10-30",
        delegateName: "Marc-Antoine Jean",
      },
      {
        name: "Administrateur Test",
        employeeNumber: "ADM-01",
        role: "ORGANIZATION_ADMIN",
      }
    );
    expect(delegatedTx.delegateName).toBe("Marc-Antoine Jean");

    // Record a deposit without a bordereau number (referenceNumber is optional)
    const noRefDeposit = await createBankTransaction(
      testOrgId,
      {
        type: "DEPOSIT",
        bankAccountId: acc.id,
        amount: 5000,
        reason: "Versement sans numéro de bordereau",
        date: "2026-10-31",
      },
      {
        name: "Administrateur Test",
        employeeNumber: "ADM-001",
        role: "ORGANIZATION_ADMIN",
      }
    );
    expect(noRefDeposit.referenceNumber).toBe("N/A");
    expect(noRefDeposit.authorMatricule).toBe("ADM-001");

    const listedTxs = await listBankTransactions(testOrgId);
    expect(
      listedTxs.some((t) => t.id === delegatedTx.id && t.delegateName === "Marc-Antoine Jean")
    ).toBe(true);

    // Verify account balance updated (100000 + 25000 + 10000 + 5000)
    const accounts = await listBankAccounts(testOrgId);
    const updatedAcc = accounts.find((a) => a.id === acc.id);
    expect(updatedAcc?.currentBalance).toBe(140000);
  });

  it("records a withdrawal (décaissement) and automatically decreases the bank account balance", async () => {
    const acc = await createBankAccount(testOrgId, {
      bankName: "Unibank",
      accountName: "Compte Opérations",
      accountNumber: "400-1122-334455",
      currency: "USD",
      initialBalance: 5000,
    });

    const tx = await createBankTransaction(
      testOrgId,
      {
        type: "WITHDRAWAL",
        bankAccountId: acc.id,
        amount: 1500,
        referenceNumber: "CHQ-00129",
        reason: "Paiement fournisseur équipement",
        date: "2026-10-29",
        receiptDataUrl: "data:image/png;base64,sample-receipt", // Justificatif optionnel fourni
      },
      {
        name: "Responsable Trésorerie",
        employeeNumber: "FIN-02",
        role: "FINANCIAL_MANAGER",
      }
    );

    expect(tx.id.startsWith("RET-")).toBe(true);
    expect(tx.amount).toBe(1500);
    expect(tx.receiptDataUrl).toBeDefined();

    // Verify account balance decreased
    const accounts = await listBankAccounts(testOrgId);
    const updatedAcc = accounts.find((a) => a.id === acc.id);
    expect(updatedAcc?.currentBalance).toBe(3500);
  });

  it("deleting a bank transaction reverses the account balance correctly", async () => {
    const acc = await createBankAccount(testOrgId, {
      bankName: "Banque Populaire",
      accountName: "Compte Réserve",
      accountNumber: "500-7788-990011",
      currency: "HTG",
      initialBalance: 80000,
    });

    const deposit = await createBankTransaction(
      testOrgId,
      {
        type: "DEPOSIT",
        bankAccountId: acc.id,
        amount: 20000,
        referenceNumber: "BOR-TEST-DEL",
        reason: "Versement erroné à annuler",
      },
      { name: "Admin" }
    );

    let accounts = await listBankAccounts(testOrgId);
    expect(accounts.find((a) => a.id === acc.id)?.currentBalance).toBe(100000);

    // Delete deposit
    const deleted = await deleteBankTransaction(testOrgId, deposit.id);
    expect(deleted).toBe(true);

    // Balance should revert back to 80000
    accounts = await listBankAccounts(testOrgId);
    expect(accounts.find((a) => a.id === acc.id)?.currentBalance).toBe(80000);
  });

  it("calculates summary statistics for the administrator consolidated report", async () => {
    const stats = await getBankSummaryStats(testOrgId);
    expect(stats).toBeDefined();
    expect(typeof stats.totalDepositsHtg).toBe("number");
    expect(typeof stats.totalWithdrawalsHtg).toBe("number");
    expect(typeof stats.netHtg).toBe("number");
    expect(typeof stats.transactionsCount).toBe("number");
    expect(stats.activeAccountsCount).toBeGreaterThan(0);
  });

  it("isolates organizations strictly without leaking default demo balances and reconciles exact totals", async () => {
    const freshOrgId = `test-org-isolated-${Date.now()}`;
    const emptyAccounts = await listBankAccounts(freshOrgId);
    expect(emptyAccounts).toEqual([]);

    const emptyTxs = await listBankTransactions(freshOrgId);
    expect(emptyTxs).toEqual([]);

    const htgAcc = await createBankAccount(freshOrgId, {
      bankName: "Sogebank",
      accountName: "Compte Courant HTG",
      accountNumber: "111-222-333",
      currency: "htg",
      initialBalance: 100000,
    });
    const usdAcc = await createBankAccount(freshOrgId, {
      bankName: "Unibank",
      accountName: "Compte USD",
      accountNumber: "444-555-666",
      currency: "usd",
      initialBalance: 2500,
    });

    await createBankTransaction(
      freshOrgId,
      {
        type: "DEPOSIT",
        bankAccountId: htgAcc.id,
        amount: 45000.5,
        reason: "Dépôt test",
      },
      { name: "Admin Test", employeeNumber: "ADM-001" }
    );
    await createBankTransaction(
      freshOrgId,
      {
        type: "WITHDRAWAL",
        bankAccountId: htgAcc.id,
        amount: 15000.25,
        referenceNumber: "CHQ-100",
        reason: "Retrait test",
      },
      { name: "Admin Test", employeeNumber: "ADM-001" }
    );

    const listed = await listBankAccounts(freshOrgId);
    const updatedHtg = listed.find((a) => a.id === htgAcc.id);
    const updatedUsd = listed.find((a) => a.id === usdAcc.id);
    expect(updatedHtg?.currentBalance).toBe(130000.25);
    expect(updatedHtg?.currency).toBe("HTG");
    expect(updatedUsd?.currentBalance).toBe(2500);
    expect(updatedUsd?.currency).toBe("USD");

    await deleteBankAccount(freshOrgId, htgAcc.id);
    const afterDeleteTxs = await listBankTransactions(freshOrgId);
    expect(afterDeleteTxs.some((t) => t.bankAccountId === htgAcc.id)).toBe(false);
    await deleteBankAccount(freshOrgId, usdAcc.id);
  });
});
