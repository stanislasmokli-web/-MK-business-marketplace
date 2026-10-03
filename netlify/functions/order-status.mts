import type { Config, Context } from "@netlify/functions";
import { applyStatusUpdate, findOrder, isValidReference, jsonError, toPublicOrder } from "../../server/orders.js";
import { getPaymentProvider } from "../../server/payments/index.js";

// GET  /api/orders/:reference         -> état du paiement (utilisé pour le suivi en direct)
// POST /api/orders/:reference/cancel  -> le client annule un paiement encore en attente
export default async (req: Request, context: Context) => {
  const reference = (context.params.reference ?? "").toUpperCase();
  if (!isValidReference(reference)) return jsonError("Référence de commande invalide.", 400);

  let order = await findOrder(reference);
  if (!order) return jsonError("Commande introuvable.", 404);

  const provider = getPaymentProvider();
  const isCancel = new URL(req.url).pathname.endsWith("/cancel");

  if (isCancel) {
    if (req.method !== "POST") return jsonError("Méthode non autorisée.", 405);
    if (order.status !== "pending") return Response.json({ order: toPublicOrder(order) });

    try {
      await provider.cancelPayment(order.reference, order.providerReference);
    } catch (error) {
      console.error(`[order-status] annulation ${reference} refusée par ${provider.name}`, error);
      return jsonError("Impossible d'annuler ce paiement pour le moment.", 502);
    }

    order = (await applyStatusUpdate({ reference, status: "cancelled", message: "Paiement annulé." })) ?? order;
    return Response.json({ order: toPublicOrder(order) });
  }

  // Si le webhook n'est pas encore arrivé, on interroge le prestataire en secours.
  if (order.status === "pending" && provider.live) {
    try {
      const update = await provider.getPaymentStatus(order.reference, order.providerReference);
      if (update && update.status !== "pending" && (update.status !== "paid" || update.amount === order.totalAmount)) order = (await applyStatusUpdate(update)) ?? order;
    } catch (error) {
      console.error(`[order-status] vérification ${reference} impossible chez ${provider.name}`, error);
    }
  }

  return Response.json({ order: toPublicOrder(order), payment: { live: provider.live } });
};

export const config: Config = {
  path: ["/api/orders/:reference", "/api/orders/:reference/cancel"],
  method: ["GET", "POST"],
};
