import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, type OrderItem } from "../db/schema.js";
import { CATALOG } from "./catalog.js";
import type { OrderStatus, PaymentMethod, PaymentStatusUpdate } from "./payments/types.js";

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  flooz: "Flooz",
  tmoney: "T-Money",
};

const MAX_QUANTITY = 99;
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Référence unique et difficile à deviner, ex : MKB-261003-7KQ2M9XA
export function createOrderReference(now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const bytes = randomBytes(8);
  let suffix = "";
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `MKB-${date}-${suffix}`;
}

export function isValidReference(reference: string): boolean {
  return /^MKB-\d{6}-[A-Z0-9]{8}$/.test(reference);
}

// Numéro togolais : 8 chiffres commençant par 7 ou 9, avec ou sans indicatif +228.
// Retourne le format international sans « + » (ex : 22890123456) ou null.
export function normalizeTogoPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00228")) digits = digits.slice(5);
  else if (digits.startsWith("228") && digits.length === 11) digits = digits.slice(3);
  if (!/^[79]\d{7}$/.test(digits)) return null;
  return `228${digits}`;
}

export function buildOrderItems(rawItems: unknown): { items: OrderItem[]; total: number } | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) return null;

  const merged = new Map<string, number>();
  for (const raw of rawItems) {
    const id = typeof raw?.id === "string" ? raw.id : "";
    const qty = Number(raw?.qty);
    if (!CATALOG[id] || !Number.isInteger(qty) || qty < 1) return null;
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }

  const items: OrderItem[] = [];
  let total = 0;
  for (const [id, quantity] of merged) {
    if (quantity > MAX_QUANTITY) return null;
    const product = CATALOG[id];
    items.push({ id, name: product.name, unitPrice: product.price, quantity });
    total += product.price * quantity;
  }

  return { items, total };
}

// Transitions autorisées. Un paiement confirmé par le prestataire est toujours
// enregistré, même si la commande avait été annulée entre-temps (l'argent a été débité).
const ALLOWED_PREVIOUS: Record<OrderStatus, OrderStatus[]> = {
  pending: [],
  paid: ["pending", "failed", "cancelled"],
  failed: ["pending"],
  cancelled: ["pending"],
};

export async function applyStatusUpdate(update: PaymentStatusUpdate) {
  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: update.status,
      statusMessage: update.message ?? null,
      updatedAt: now,
      ...(update.providerReference ? { providerReference: update.providerReference } : {}),
      ...(update.status === "paid" ? { paidAt: now } : {}),
    })
    .where(and(eq(orders.reference, update.reference), inArray(orders.status, ALLOWED_PREVIOUS[update.status])))
    .returning();
  return updated ?? null;
}

export async function findOrder(reference: string) {
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  return order ?? null;
}

// Données renvoyées au navigateur : pas d'adresse ni de téléphone complet.
export function toPublicOrder(order: typeof orders.$inferSelect) {
  return {
    reference: order.reference,
    status: order.status as OrderStatus,
    statusMessage: order.statusMessage,
    items: order.items,
    totalAmount: order.totalAmount,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentPhoneMasked: order.paymentPhone.replace(/^(\d{3})\d+(\d{2})$/, "+$1 •• •• •• $2"),
    customerName: order.customerName,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
