import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations, branches } from "../src/db/schema";
import { customerFeedback, customerFeedbackQr } from "../src/lib/services/customer-feedback-schema";
import {
  ensureCustomerFeedbackSqliteTables,
  listCustomerQrCodes,
  generateBranchQrCode,
  toggleCustomerQrStatus,
  deleteCustomerQrCode,
  resolvePublicQrByToken,
  submitPublicFeedback,
  listCustomerFeedback,
  toggleCustomerFeedbackFavorite,
  deleteCustomerFeedback,
  QrAlreadyExistsError,
  CustomerFeedbackDomainError,
} from "../src/lib/services/customer-feedback";
import { checkRateLimit } from "../src/lib/security/rate-limit";

describe("Module Espace Client — QR Codes uniques & Avis Clients", () => {
  let db: any;
  const orgA = "org-welj";
  const orgB = "org-other";
  const branchPap = "br-welj-pap";
  const branchCap = "br-welj-cap";
  const branchOtherOrg = "br-other-1";

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
    await ensureCustomerFeedbackSqliteTables(db);

    const now = Date.now();

    await db.insert(organizations).values([
      {
        id: orgA,
        name: "Welj Express Services",
        slug: "welj-express",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: orgB,
        name: "Autre Société SA",
        slug: "autre-societe",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(branches).values([
      {
        id: branchPap,
        organizationId: orgA,
        name: "Port-au-Prince",
        city: "Port-au-Prince",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: branchCap,
        organizationId: orgA,
        name: "Cap-Haïtien",
        city: "Cap-Haïtien",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: branchOtherOrg,
        organizationId: orgB,
        name: "Succursale Concurrente",
        city: "Gonaïves",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  it("1. Génère un QR Code unique pour une succursale et respecte strictement 1 succursale = 1 QR Code", async () => {
    const qr1 = await generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db);

    expect(qr1.branchId).toBe(branchPap);
    expect(qr1.branchName).toBe("Port-au-Prince");
    expect(qr1.isActive).toBe(true);
    expect(qr1.uniqueToken.length).toBe(32);
    expect(qr1.publicUrl).toBe(`https://ebiznis.ht/avis/${qr1.uniqueToken}`);

    // Tentative de créer un deuxième QR Code sur la même succursale (active) -> refusée
    await expect(
      generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db)
    ).rejects.toThrow(QrAlreadyExistsError);

    // Même après désactivation du QR Code -> toujours interdit d'en générer un deuxième
    await toggleCustomerQrStatus(orgA, qr1.id, false, db);
    await expect(
      generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db)
    ).rejects.toThrow(QrAlreadyExistsError);

    // Contrainte UNIQUE(branch_id) au niveau de la base de données
    await expect(
      db.insert(customerFeedbackQr).values({
        id: "qr-dup-sql",
        organizationId: orgA,
        branchId: branchPap,
        uniqueToken: "dup-token-12345678",
        publicUrl: "/avis/dup-token-12345678",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    ).rejects.toThrow();

    // Une autre succursale de la même entreprise peut avoir son propre QR Code
    const qr2 = await generateBranchQrCode(orgA, branchCap, "https://ebiznis.ht", db);
    expect(qr2.branchId).toBe(branchCap);
    expect(qr2.uniqueToken).not.toBe(qr1.uniqueToken);

    const list = await listCustomerQrCodes(orgA, db);
    expect(list).toHaveLength(2);
  });

  it("2. Résout automatiquement l'entreprise et la succursale côté serveur sans intervention du client", async () => {
    const qr = await generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db);

    const resolved = await resolvePublicQrByToken(qr.uniqueToken, db);
    expect(resolved.found).toBe(true);
    expect(resolved.active).toBe(true);
    expect(resolved.organizationId).toBe(orgA);
    expect(resolved.organizationName).toBe("Welj Express Services");
    expect(resolved.branchId).toBe(branchPap);
    expect(resolved.branchName).toBe("Port-au-Prince");

    // Token inconnu ou trop court -> introuvable
    const unknown = await resolvePublicQrByToken("jeton-inexistant-999999", db);
    expect(unknown.found).toBe(false);
    expect(unknown.active).toBe(false);

    const shortToken = await resolvePublicQrByToken("abc", db);
    expect(shortToken.found).toBe(false);
  });

  it("3. Enregistre un avis anonyme ou nommé, accepte les critiques constructives, et bloque un QR désactivé", async () => {
    const qr = await generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db);

    // Avis anonyme sans catégorie + critique constructive -> accepté avec isFavorite = false
    const anonResult = await submitPublicFeedback(
      qr.uniqueToken,
      {
        customerName: "   ",
        category: "",
        comment: "Le temps d'attente au guichet était trop long ce matin, merci d'améliorer cela.",
      },
      db
    );

    expect(anonResult.organizationName).toBe("Welj Express Services");
    expect(anonResult.branchName).toBe("Port-au-Prince");
    expect(anonResult.feedback.customerName).toBeNull();
    expect(anonResult.feedback.category).toBeNull();
    expect(anonResult.feedback.isFavorite).toBe(false);
    expect(anonResult.feedback.branchId).toBe(branchPap);

    // Avis nommé avec catégorie -> enregistré correctement
    const namedResult = await submitPublicFeedback(
      qr.uniqueToken,
      {
        customerName: "Jean Marc",
        category: "Expérience de livraison",
        comment: "Colis reçu rapidement et personnel courtois.",
      },
      db
    );
    expect(namedResult.feedback.customerName).toBe("Jean Marc");
    expect(namedResult.feedback.category).toBe("Expérience de livraison");
    expect(namedResult.feedback.isFavorite).toBe(false);

    // Anti-spam honeypot rempli -> rejeté
    await expect(
      submitPublicFeedback(
        qr.uniqueToken,
        {
          comment: "Spam bot",
          website: "http://spam.invalid",
        },
        db
      )
    ).rejects.toThrow(CustomerFeedbackDomainError);

    // Commentaire vide / trop court -> rejeté
    await expect(
      submitPublicFeedback(qr.uniqueToken, { comment: "ok" }, db)
    ).rejects.toThrow(CustomerFeedbackDomainError);

    // Désactivation du QR Code -> page publique & soumission immédiatement bloquées
    await toggleCustomerQrStatus(orgA, qr.id, false, db);

    const resolvedDisabled = await resolvePublicQrByToken(qr.uniqueToken, db);
    expect(resolvedDisabled.found).toBe(true);
    expect(resolvedDisabled.active).toBe(false);

    await expect(
      submitPublicFeedback(
        qr.uniqueToken,
        { comment: "Tentative après désactivation" },
        db
      )
    ).rejects.toThrow(/désactivé/i);
  });

  it("4. Calcule les statistiques réelles, gère les filtres dynamiques (année, mois, succursale, recherche, favoris)", async () => {
    const qrPap = await generateBranchQrCode(orgA, branchPap, undefined, db);
    const qrCap = await generateBranchQrCode(orgA, branchCap, undefined, db);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Insertion directe avec dates contrôlées dans le mois actuel, un autre mois et une année précédente
    const prevYearDate = new Date(currentYear - 1, 2, 15, 10, 30).getTime(); // Mars année précédente
    const otherMonthIndex = now.getMonth() === 0 ? 5 : 0; // Janvier ou Juin de l'année actuelle
    const sameYearOtherMonthDate = new Date(currentYear, otherMonthIndex, 10, 14, 15).getTime();
    const currentMonthDate = now.getTime();

    await db.insert(customerFeedback).values([
      {
        id: "fb-1",
        organizationId: orgA,
        branchId: branchPap,
        qrCodeId: qrPap.id,
        customerName: "Marie Paul",
        category: "Accueil et service client",
        comment: "Service rapide à Port-au-Prince.",
        isFavorite: true,
        createdAt: currentMonthDate,
      },
      {
        id: "fb-2",
        organizationId: orgA,
        branchId: branchCap,
        qrCodeId: qrCap.id,
        customerName: null,
        category: "Temps d'attente",
        comment: "Un peu d'attente mais équipe aimable.",
        isFavorite: false,
        createdAt: sameYearOtherMonthDate,
      },
      {
        id: "fb-3",
        organizationId: orgA,
        branchId: branchPap,
        qrCodeId: qrPap.id,
        customerName: "Luc Pierre",
        category: "Personnel",
        comment: "Très bonne assistance l'an dernier.",
        isFavorite: false,
        createdAt: prevYearDate,
      },
    ]);

    // Vue complète sans filtre -> statistiques exactes
    const full = await listCustomerFeedback(orgA, {}, db);
    expect(full.stats.totalCount).toBe(3);
    expect(full.stats.currentMonthCount).toBe(1);
    expect(full.stats.favoritesCount).toBe(1);
    expect(full.availableYears).toEqual([currentYear, currentYear - 1]);

    // Filtre par année précédente -> uniquement fb-3 et mois dynamique [3]
    const prevYearRes = await listCustomerFeedback(orgA, { year: currentYear - 1 }, db);
    expect(prevYearRes.feedback).toHaveLength(1);
    expect(prevYearRes.feedback[0].id).toBe("fb-3");
    expect(prevYearRes.availableMonths).toEqual([3]);

    // Filtre par succursale Cap-Haïtien
    const capRes = await listCustomerFeedback(orgA, { branchId: branchCap }, db);
    expect(capRes.feedback).toHaveLength(1);
    expect(capRes.feedback[0].customerName).toBeNull();

    // Filtre favoris uniquement
    const favRes = await listCustomerFeedback(orgA, { favoritesOnly: true }, db);
    expect(favRes.feedback).toHaveLength(1);
    expect(favRes.feedback[0].id).toBe("fb-1");

    // Recherche par nom client
    const searchName = await listCustomerFeedback(orgA, { search: "marie" }, db);
    expect(searchName.feedback).toHaveLength(1);
    expect(searchName.feedback[0].id).toBe("fb-1");

    // Recherche par contenu commentaire
    const searchContent = await listCustomerFeedback(orgA, { search: "aimable" }, db);
    expect(searchContent.feedback).toHaveLength(1);
    expect(searchContent.feedback[0].id).toBe("fb-2");

    // Filtre par mois courant + année courante
    const curMonthRes = await listCustomerFeedback(
      orgA,
      { year: currentYear, month: currentMonth },
      db
    );
    expect(curMonthRes.feedback.some((f) => f.id === "fb-1")).toBe(true);
  });

  it("5. Permet d'ajouter/retirer des favoris et de supprimer définitivement un commentaire avec mise à jour des stats", async () => {
    const qr = await generateBranchQrCode(orgA, branchPap, undefined, db);
    const { feedback: created } = await submitPublicFeedback(
      qr.uniqueToken,
      { customerName: "Client Test", comment: "Très bon service." },
      db
    );

    expect(created.isFavorite).toBe(false);

    // Ajout aux favoris
    const favOn = await toggleCustomerFeedbackFavorite(orgA, created.id, true, db);
    expect(favOn.isFavorite).toBe(true);

    let listing = await listCustomerFeedback(orgA, {}, db);
    expect(listing.stats.favoritesCount).toBe(1);

    // Retrait des favoris (toggle automatique)
    const favOff = await toggleCustomerFeedbackFavorite(orgA, created.id, undefined, db);
    expect(favOff.isFavorite).toBe(false);

    listing = await listCustomerFeedback(orgA, {}, db);
    expect(listing.stats.favoritesCount).toBe(0);

    // Suppression définitive
    const del = await deleteCustomerFeedback(orgA, created.id, db);
    expect(del.deleted).toBe(true);

    listing = await listCustomerFeedback(orgA, {}, db);
    expect(listing.feedback).toHaveLength(0);
    expect(listing.stats.totalCount).toBe(0);
    expect(listing.stats.currentMonthCount).toBe(0);

    // Suppression d'un avis inexistant -> 404
    await expect(deleteCustomerFeedback(orgA, created.id, db)).rejects.toThrow(
      CustomerFeedbackDomainError
    );
  });

  it("6. Applique strictement l'isolation multi-tenant entre entreprises", async () => {
    const qrA = await generateBranchQrCode(orgA, branchPap, undefined, db);
    const { feedback: fbA } = await submitPublicFeedback(
      qrA.uniqueToken,
      { customerName: "Client Welj", comment: "Avis confidentiel Welj." },
      db
    );

    // Org B ne peut pas générer un QR sur une succursale de Org A
    await expect(
      generateBranchQrCode(orgB, branchPap, undefined, db)
    ).rejects.toThrow(CustomerFeedbackDomainError);

    // Org B ne voit ni le QR ni les avis de Org A
    const qrListB = await listCustomerQrCodes(orgB, db);
    expect(qrListB).toHaveLength(0);

    const fbListB = await listCustomerFeedback(orgB, {}, db);
    expect(fbListB.feedback).toHaveLength(0);
    expect(fbListB.stats.totalCount).toBe(0);

    // Org B ne peut ni activer/désactiver le QR de Org A, ni favoriser/supprimer l'avis de Org A
    await expect(toggleCustomerQrStatus(orgB, qrA.id, false, db)).rejects.toThrow(
      CustomerFeedbackDomainError
    );
    await expect(toggleCustomerFeedbackFavorite(orgB, fbA.id, true, db)).rejects.toThrow(
      CustomerFeedbackDomainError
    );
    await expect(deleteCustomerFeedback(orgB, fbA.id, db)).rejects.toThrow(
      CustomerFeedbackDomainError
    );
  });

  it("7. Vérifie le mécanisme anti-spam par limitation de débit sur les soumissions répétées", () => {
    const key = `avis_test_rate_${Date.now()}_${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 300).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 5, 300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("8. Refuse la suppression d'un QR Code actif, mais permet de supprimer un QR Code inactif tout en conservant les avis reçus", async () => {
    const qr = await generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db);
    await submitPublicFeedback(
      qr.uniqueToken,
      { customerName: "Alice", comment: "Accueil chaleureux !" },
      db
    );

    // Tant que le QR Code est actif, sa suppression est refusée
    await expect(deleteCustomerQrCode(orgA, qr.id, db)).rejects.toThrow(
      /actif/i
    );

    // Org B ne peut pas supprimer le QR Code de Org A même après désactivation
    await toggleCustomerQrStatus(orgA, qr.id, false, db);
    await expect(deleteCustomerQrCode(orgB, qr.id, db)).rejects.toThrow(
      CustomerFeedbackDomainError
    );

    // Une fois inactif, Org A peut le supprimer
    const res = await deleteCustomerQrCode(orgA, qr.id, db);
    expect(res.deleted).toBe(true);

    const remainingQrs = await listCustomerQrCodes(orgA, db);
    expect(remainingQrs).toHaveLength(0);

    // Les avis clients déjà reçus restent conservés dans l'historique
    const feedbackAfter = await listCustomerFeedback(orgA, {}, db);
    expect(feedbackAfter.feedback).toHaveLength(1);
    expect(feedbackAfter.feedback[0].customerName).toBe("Alice");
    expect(feedbackAfter.feedback[0].qrCodeId).toBeNull();

    // Un nouveau QR Code peut être généré ensuite pour cette succursale
    const newQr = await generateBranchQrCode(orgA, branchPap, "https://ebiznis.ht", db);
    expect(newQr.id).not.toBe(qr.id);
    expect(newQr.branchId).toBe(branchPap);
  });
});
