import { json, fail, readJson, adminOk, getCatalogue, saveCatalogue, store, nowIso } from './_lib.mjs';

const okImg = (u) => typeof u === 'string' && (/^\/images\/[\w.-]+$/.test(u) || /^\/api\/img\?k=img-[a-z0-9-]{8,80}$/.test(u));

export default async (req) => {
  if (!adminOk(req)) return fail('Non autorisé', 401);
  if (req.method === 'GET') return json(await getCatalogue());
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);

  const b = await readJson(req);
  let cat = await getCatalogue();

  if (b?.action === 'save') {
    const name = String(b.name || '').trim().slice(0, 80);
    const price = Math.round(Number(b.price));
    const stock = Math.max(0, Math.floor(Number(b.stock) || 0));
    const images = (Array.isArray(b.images) ? b.images : []).filter(okImg).slice(0, 4);
    if (name.length < 2) return fail('Le nom est obligatoire.');
    if (!Number.isFinite(price) || price < 100 || price > 10000000) return fail('Prix invalide (minimum 100 F CFA).');
    const item = {
      id: /^[\w-]{3,40}$/.test(String(b.id || '')) ? String(b.id) : `mk${Date.now().toString(36)}`,
      name, price, stock, images,
      cat: String(b.cat || 'jeans').trim().toLowerCase().slice(0, 30) || 'jeans',
      description: String(b.description || '').trim().slice(0, 400),
      active: b.active !== false,
    };
    const i = cat.findIndex((x) => x.id === item.id);
    if (i < 0) cat.unshift({ ...item, created_at: nowIso() }); else cat[i] = { ...cat[i], ...item, updated_at: nowIso() };
  } else if (b?.action === 'delete') {
    const gone = cat.find((x) => x.id === b.id);
    cat = cat.filter((x) => x.id !== b.id);
    for (const u of gone?.images || []) { // nettoie les photos envoyées
      const m = u.match(/k=(img-[a-z0-9-]+)$/);
      if (m) await store('images').delete(m[1]).catch(() => {});
    }
  } else return fail('Action inconnue');

  await saveCatalogue(cat);
  return json(cat);
};
export const config = { path: '/api/admin/products' };
