import { json, fail, readJson, adminOk, store, getOrder, saveOrder, markPaid, restock, log, ORDER_ID_RE } from './_lib.mjs';

export default async (req) => {
  if (!adminOk(req)) return fail('Non autorisé', 401);

  if (req.method === 'GET') {
    const s = store('orders');
    const { blobs } = await s.list();
    const keys = blobs.map((b) => b.key).filter((k) => ORDER_ID_RE.test(k)).sort().reverse().slice(0, 300);
    const all = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }).catch(() => null)));
    const orders = all.filter(Boolean).map(({ token, ...o }) => o).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json(orders);
  }

  if (req.method === 'POST') {
    const b = await readJson(req);
    const order = await getOrder(String(b?.id || ''));
    if (!order) return fail('Commande introuvable', 404);

    if (b.action === 'paid') {
      await markPaid(order, 'manuel');
    } else if (b.action === 'delivered') {
      if (!['paid', 'cod'].includes(order.status)) return fail('Seule une commande payée (ou à payer à la livraison) peut être livrée.', 409);
      order.status = 'delivered'; order.delivered_at = new Date().toISOString();
      log(order, 'Marquée livrée'); await saveOrder(order);
    } else if (b.action === 'cancel') {
      if (order.status === 'delivered') return fail('Une commande livrée ne peut pas être annulée.', 409);
      await restock(order);
      order.status = 'cancelled'; log(order, 'Annulée (stock remis)'); await saveOrder(order);
    } else return fail('Action inconnue');

    const { token, ...safe } = order;
    return json(safe);
  }
  return fail('Méthode non autorisée', 405);
};
export const config = { path: '/api/admin/orders' };
