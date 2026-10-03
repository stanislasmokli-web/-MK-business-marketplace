import { notConfiguredProvider } from "./not-configured.js";
import type { PaymentProvider } from "./types.js";

// Point d'entrée unique vers le prestataire de paiement.
//
// Pour brancher un vrai prestataire (agrégateur ou API Flooz / T-Money) :
// 1. créer un fichier server/payments/<prestataire>.ts qui implémente PaymentProvider ;
// 2. y lire les identifiants avec Netlify.env.get(...) — jamais dans index.html ;
// 3. définir ces variables dans Netlify (Configuration du site > Variables d'environnement),
//    ainsi que PAYMENT_PROVIDER=<prestataire> ;
// 4. ajouter le cas correspondant ci-dessous.
export function getPaymentProvider(): PaymentProvider {
  const provider = Netlify.env.get("PAYMENT_PROVIDER");

  switch (provider) {
    // case "<prestataire>":
    //   return createXxxProvider();
    default:
      return notConfiguredProvider;
  }
}

export type * from "./types.js";
