import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export type OrderItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

// Statuts possibles d'une commande / d'un paiement :
// pending   -> commande créée, paiement en attente de confirmation
// paid      -> paiement confirmé par le prestataire
// failed    -> paiement refusé ou en erreur
// cancelled -> paiement annulé par le client ou expiré
export const orders = pgTable(
  "orders",
  {
    id: serial().primaryKey(),
    reference: text().notNull().unique(),
    status: text().notNull().default("pending"),
    items: jsonb().$type<OrderItem[]>().notNull(),
    totalAmount: integer("total_amount").notNull(),
    currency: text().notNull().default("XOF"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerCity: text("customer_city").notNull(),
    customerAddress: text("customer_address").notNull(),
    paymentMethod: text("payment_method").notNull(),
    paymentPhone: text("payment_phone").notNull(),
    providerReference: text("provider_reference"),
    statusMessage: text("status_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [index("orders_status_idx").on(table.status), index("orders_provider_reference_idx").on(table.providerReference)],
);
