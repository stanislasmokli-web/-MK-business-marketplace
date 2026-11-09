// Catalogue de départ (chargé une seule fois). Ensuite, tout se gère depuis /admin/.
const P = (id, name, description, image, active = true) => ({
  id, name, price: 3500, cat: 'jeans', description,
  images: image ? [`/images/${image}`] : [], stock: 10, active,
});

export const SEED = [
  P('mk001', 'Jean Drippy Smile Jaune x4', '4 smileys jaunes drippy, peinture main MK', 'drippy-smile-x4.jpg'),
  P('mk002', 'Jean HUSTLER Money Bag', 'HUSTLER JUST MAKE BILLIONS', ''),
  P('mk003', 'Jean JUST DO IT Cartoon Rouge', 'JUST DO IT + perso cartoon', 'just-do-it-cartoon.jpg'),
  P('mk004', 'Jean NO FAKE ZONE Skull', 'NO FAKE ZONE + DOG ZONE', 'no-fake-zone-skull.jpg'),
  P('mk005', 'Jean JUST DO IT Smile', 'JUST DO IT + smile', 'just-do-it-smile.jpg'),
  P('mk006', 'Jean NO FAKE ZONE Blue', 'NO FAKE ZONE bleu', ''),
  P('mk007', 'Jean Cartes K Poker', '3 Rois cartes + chaine', ''),
  P('mk008', 'Jean DOG ZONE Jaune', 'DOG ZONE / NO FAKE ZONE', ''),
  // Photo fournie mais pas dans ta liste : masqué tant que tu ne l'actives pas dans l'admin.
  P('mk009', 'Jean KODAK BLACK', 'KODAK BLACK + perso cartoon', 'kodak-black.jpg', false),
];
