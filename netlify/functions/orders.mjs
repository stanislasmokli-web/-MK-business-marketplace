import crypto from 'node:crypto';
import {
  json, fail, readJson, CONFIG, METHODS, getCatalogue, newOrderId, saveOrder, deductStock, log,
  normalizePhone, deliveryFor, rateLimit, clientIp, nowIso,
} from './_lib.mjs';

// Création d'une commande. Les prix et le total sont TOUJOURS recalculés ici, jamais lus du navigateur.
export default async (req, context) => {
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  if (!(await rateLimit(`order-${clientIp(context, req)}`, 12, 60 * 60 * 1000)))
    return fail('Trop de commandes depuis cet appareil. Réessaie plus tard ou écris-nous sur WhatsApp.', 429);

  const b = await readJson(req);
  if (!b || typeof b !== 'object') return fail('Requête invalide');

  const c = b.customer || {};
  const name = String(c.name || '').trim().slice(0, 80);
  const phone = normalizePhone(c.phone);
  const city = String(c.city || '');
  const address = String(c.address || '').trim().slice(0, 200);
  const note = String(c.note || '').trim().slice(0, 300);
  const method = String(b.method || '');

  if (name.length < 2) return fail('Indique ton nom.');
  if (phone.length < 8 || phone.length > 15) return fail('Numéro de téléphone invalide.');
  if (!CONFIG.cities.includes(city)) return fail('Choisis ta ville.');
  if (address.length < 3) return fail('Indique ton quartier ou ton adresse.');
  if (!METHODS.includes(method)) return fail('Choisis un mode de paiement.');

  let payPhone = '';
  if (method !== 'COD') {
    payPhone = normalizePhone(b.pay_phone || c.phone);
    if (!/^\d{8}$/.test(payPhone)) return fail('Numéro Flooz / T-Money invalide (8 chiffres, ex. 90 12 34 56).');
  }

  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20) return fail('Ton panier est vide.');
  const qty = new Map();
  for (const it of b.items) {
    const q = Math.floor(Number(it?.quantity));
    if (!it?.id || !Number.isFinite(q) || q < 1) return fail('Panier invalide.');
    qty.set(String(it.id), (qty.get(String(it.id)) || 0) + q);
  }

  const cat = await getCatalogue();
  const items = [];
  let subtotal = 0;
  for (const [id, q] of qty) {
    const p = cat.find((x) => x.id === id && x.active);
    if (!p) return fail('Un article de ton panier n’est plus disponible.', 409);
    if (q > CONFIG.maxPerLine) return fail(`Maximum ${CONFIG.maxPerLine} exemplaires par article.`);
    if (p.stock < q) return fail(p.stock ? `Il ne reste que ${p.stock} × ${p.name}.` : `${p.name} est en rupture de stock.`, 409);
    items.push({ id: p.id, name: p.name, price: p.price, quantity: q, image: p.images?.[0] || '' });
    subtotal += p.price * q;
  }
  const delivery = deliveryFor(city);

  const order = {
    id: newOrderId(),
    token: crypto.randomBytes(16).toString('hex'),
    created_at: nowIso(),
    status: method === 'COD' ? 'cod' : 'pending',
    method,
    customer: { name, phone, city, address, note },
    pay_phone: payPhone,
    items, subtotal, delivery, total: subtotal + delivery,
    stock_deducted: false,
    payment: { state: null, attempts: 0, identifiers: [] },
    history: [],
  };
  log(order, method === 'COD' ? 'Commande créée — paiement à la livraison' : `Commande créée — paiement ${method} en attente`);
  if (method === 'COD') await deductStock(order);
  await saveOrder(order);

  return json({ id: order.id, token: order.token, status: order.status, method, total: order.total, subtotal, delivery });
};
export const config = { path: '/api/orders' };
