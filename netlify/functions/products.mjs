import { json, fail, getCatalogue } from './_lib.mjs';
// Public : uniquement les produits actifs.
export default async (req) => {
  if (req.method !== 'GET') return fail('Méthode non autorisée', 405);
  const cat = await getCatalogue();
  const list = cat.filter((p) => p.active).map(({ id, name, price, cat, description, images, stock, created_at }) =>
    ({ id, name, price, cat, description, images, stock, created_at }));
  return json(list, 200, { 'Cache-Control': 'public, max-age=15' });
};
export const config = { path: '/api/products' };
