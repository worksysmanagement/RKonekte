export const APP_CONFIG = {
  // Nom officiel de l'application / de la plateforme
  name: "RKonekte",
  brandName: "RKonekte",
  logoPath: "/logo-rkonekte.png",
  version: "1.0.0",

  // Devises prises en charge
  currencies: [
    { code: "HTG", label: "Gourde Haïtienne (HTG)", symbol: "G" },
    { code: "USD", label: "Dollar Américain (USD)", symbol: "$" },
  ],

  // Banques et moyens de paiement disponibles
  financialAccounts: [
    { id: "unibank_htg", name: "Unibank HTG", currency: "HTG" },
    { id: "unibank_usd", name: "Unibank USD", currency: "USD" },
    { id: "sogebank_htg", name: "Sogebank HTG", currency: "HTG" },
    { id: "sogebank_usd", name: "Sogebank USD", currency: "USD" },
    { id: "bnc_htg", name: "BNC HTG", currency: "HTG" },
    { id: "bnc_usd", name: "BNC USD", currency: "USD" },
    { id: "ezipay", name: "EZIPAY", currency: "HTG" },
    { id: "wallet", name: "WALLET", currency: "HTG" },
  ],

  // Rôles utilisateurs stricts (3 types de comptes)
  roles: {
    SUPER_ADMIN: { label: "Super Administrateur", description: "Accès global plateforme & organisations" },
    ORGANIZATION_ADMIN: { label: "Administrateur", description: "Gestion complète de l'entreprise (tous les accès)" },
    EMPLOYEE: { label: "Employé / Collaborateur", description: "Accès restreint aux 5 onglets opérationnels" },
  },
};
