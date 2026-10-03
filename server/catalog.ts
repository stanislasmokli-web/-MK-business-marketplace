// Catalogue de référence côté serveur.
// Les prix envoyés par le navigateur ne sont jamais utilisés : le montant à payer
// est toujours recalculé ici. Garder ces données synchronisées avec index.html.
export type CatalogProduct = {
  id: string;
  name: string;
  price: number; // en F CFA (XOF)
};

export const CATALOG: Record<string, CatalogProduct> = {
  "pull-premium": { id: "pull-premium", name: "Pull Premium", price: 2500 },
  "jean-personnalise": { id: "jean-personnalise", name: "Jean personnalisé", price: 3500 },
  "sneakers-urban": { id: "sneakers-urban", name: "Sneakers Urban", price: 12000 },
  "ecouteurs-bluetooth": { id: "ecouteurs-bluetooth", name: "Écouteurs Bluetooth", price: 6500 },
};
