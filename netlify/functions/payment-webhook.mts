import type { Config } from "@netlify/functions";
import { applyStatusUpdate, findOrder, isValidReference, jsonError } from "../../server/orders.js";
import { getPaymentProvider } from "../../server/payments/index.js";

// Notification envoyée par le prestataire quand un paiement Flooz / T-Money change d'état.
// C'est la seule source de vérité pour passer une commande en « payée ».
export default async (req: Request) => {
  const provider = getPaymentProvider();
  if (!provider.live) return jsonError("Aucun prestataire de paiement n'est configuré.", 503);

  // L'adaptateur vérifie la signature et rejette (null) toute requête non authentique.
  const update = await provider.parseWebhook(req);
  if (!update) return jsonError("Notification non authentifiée.", 401);
  if (!isValidReference(update.reference)) return jsonError("Référence invalide.", 400);

  const order = await findOrder(update.reference);
  if (!order) return jsonError("Commande introuvable.", 404);

  if (update.status === "paid" && update.amount !== order.totalAmount) {
    console.error(`[payment-webhook] montant incohérent pour ${order.reference} : reçu ${update.amount}, attendu ${order.totalAmount}`);
    return jsonError("Montant incohérent.", 400);
  }

  if (update.status !== "pending") await applyStatusUpdate(update);

  return Response.json({ received: true });
};

export const config: Config = {
  path: "/api/payments/webhook",
  method: "POST",
};
