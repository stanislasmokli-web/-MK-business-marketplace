export type PaymentMethod = "flooz" | "tmoney";

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export type InitiatePaymentInput = {
  reference: string;
  amount: number; // en F CFA (XOF), entier
  currency: "XOF";
  method: PaymentMethod;
  payerPhone: string; // format international sans "+", ex : 22890000000
  customerName: string;
  description: string;
  callbackUrl: string; // URL du webhook à transmettre au prestataire
  returnUrl: string; // page de retour pour les prestataires qui redirigent le client
};

export type InitiatePaymentResult = {
  // false tant qu'aucun prestataire réel n'est branché
  live: boolean;
  status: OrderStatus;
  providerReference?: string;
  // Pour les prestataires qui demandent de rediriger le client vers leur page de paiement
  redirectUrl?: string;
  // Message affiché au client (ex : « Valide le paiement sur ton téléphone »)
  customerMessage: string;
};

export type PaymentStatusUpdate = {
  reference: string;
  status: OrderStatus;
  providerReference?: string;
  // Montant réellement payé selon le prestataire (contrôlé avant de valider la commande)
  amount?: number;
  message?: string;
};

export interface PaymentProvider {
  name: string;
  live: boolean;

  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  // Interroge le prestataire pour connaître l'état d'un paiement (secours si le webhook n'arrive pas).
  getPaymentStatus(reference: string, providerReference: string | null): Promise<PaymentStatusUpdate | null>;

  // Demande l'annulation d'un paiement en attente, si le prestataire le permet.
  cancelPayment(reference: string, providerReference: string | null): Promise<void>;

  // Vérifie l'authenticité de la notification (signature, secret partagé...) puis la traduit.
  // Doit retourner null si la requête n'est pas authentique.
  parseWebhook(req: Request): Promise<PaymentStatusUpdate | null>;
}
