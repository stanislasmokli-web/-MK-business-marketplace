import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orders } from "../../db/schema.js";
import {
  PAYMENT_METHODS,
  applyStatusUpdate,
  buildOrderItems,
  createOrderReference,
  jsonError,
  normalizeTogoPhone,
  toPublicOrder,
} from "../../server/orders.js";
import { getPaymentProvider, type PaymentMethod } from "../../server/payments/index.js";

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Point de départ du paiement : crée la commande puis demande le paiement au prestataire.
export default async (req: Request, context: Context) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Requête invalide.", 400);
  }

  const built = buildOrderItems(body?.items);
  if (!built) return jsonError("Le panier est vide ou contient un produit invalide.", 400);

  const method = body?.paymentMethod as PaymentMethod;
  if (typeof method !== "string" || !Object.hasOwn(PAYMENT_METHODS, method)) return jsonError("Choisis Flooz ou T-Money.", 400);

  const customer = body?.customer ?? {};
  const fullName = cleanText(customer.fullName, 120);
  const city = cleanText(customer.city, 80);
  const address = cleanText(customer.address, 300);
  const customerPhone = cleanText(customer.phone, 30);
  if (fullName.length < 2 || city.length < 2 || address.length < 3 || customerPhone.replace(/\D/g, "").length < 8) {
    return jsonError("Les informations de livraison sont incomplètes.", 400);
  }

  const paymentPhone = normalizeTogoPhone(cleanText(body?.paymentPhone, 30));
  if (!paymentPhone) return jsonError("Numéro Mobile Money togolais invalide (8 chiffres).", 400);

  const reference = createOrderReference();

  const [order] = await db
    .insert(orders)
    .values({
      reference,
      status: "pending",
      items: built.items,
      totalAmount: built.total,
      currency: "XOF",
      customerName: fullName,
      customerPhone,
      customerCity: city,
      customerAddress: address,
      paymentMethod: method,
      paymentPhone,
    })
    .returning();

  const siteUrl = new URL(req.url).origin;
  const provider = getPaymentProvider();

  try {
    const result = await provider.initiatePayment({
      reference,
      amount: built.total,
      currency: "XOF",
      method,
      payerPhone: paymentPhone,
      customerName: fullName,
      description: `Commande ${reference} - MK_Business`,
      callbackUrl: `${siteUrl}/api/payments/webhook`,
      returnUrl: `${siteUrl}/?commande=${encodeURIComponent(reference)}`,
    });

    const current =
      result.status === "pending"
        ? await applyPendingDetails(reference, result.providerReference, result.customerMessage)
        : await applyStatusUpdate({
            reference,
            status: result.status,
            providerReference: result.providerReference,
            message: result.customerMessage,
          });

    return Response.json(
      {
        order: toPublicOrder(current ?? order),
        payment: { live: result.live, redirectUrl: result.redirectUrl ?? null, message: result.customerMessage },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`[checkout] ${provider.name} a échoué pour ${reference} (requête ${context.requestId})`, error);
    const failed = await applyStatusUpdate({
      reference,
      status: "failed",
      message: "Le prestataire de paiement est indisponible. Réessaie dans quelques instants.",
    });
    return Response.json(
      {
        order: toPublicOrder(failed ?? order),
        payment: { live: provider.live, redirectUrl: null, message: failed?.statusMessage ?? null },
      },
      { status: 502 },
    );
  }
};

async function applyPendingDetails(reference: string, providerReference: string | undefined, message: string) {
  const [updated] = await db
    .update(orders)
    .set({ providerReference: providerReference ?? null, statusMessage: message, updatedAt: new Date() })
    .where(eq(orders.reference, reference))
    .returning();
  return updated ?? null;
}

export const config: Config = {
  path: "/api/checkout",
  method: "POST",
};
