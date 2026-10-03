import type { PaymentProvider } from "./types.js";

// Prestataire utilisé tant qu'aucune intégration réelle Flooz / T-Money n'est branchée.
// Aucune transaction n'est envoyée : la commande est enregistrée « en attente »
// et le client est informé que le paiement mobile n'est pas encore actif.
export const notConfiguredProvider: PaymentProvider = {
  name: "not-configured",
  live: false,

  async initiatePayment() {
    return {
      live: false,
      status: "pending",
      customerMessage:
        "Ta commande est enregistrée. Le paiement mobile Flooz / T-Money n'est pas encore activé : aucun montant n'a été débité.",
    };
  },

  async getPaymentStatus() {
    return null;
  },

  async cancelPayment() {},

  async parseWebhook() {
    return null;
  },
};
