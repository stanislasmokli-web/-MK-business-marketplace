import { json, fail, safeEq, getOrder, saveOrder, publicOrder, checkIdentifier, markPaid, log } from './_lib.mjs';

// Suivi côté client. Le statut « payé » n'est posé QUE si PayGate le confirme à notre serveur.
export default async (req) => {
  if (req.method !== 'GET') return fail('Méthode non autorisée', 405);
  const u = new URL(req.url);
  const order = await getOrder(String(u.searchParams.get('id') || ''));
  if (!order || !safeEq(order.token, u.searchParams.get('token'))) return fail('Commande introuvable', 404);

  const p = order.payment || {};
  if (order.status === 'pending' && p.identifiers?.length && ['initiated', 'initiating'].includes(p.state)
      && Date.now() - (p.checked_at || 0) > 2500) {
    p.checked_at = Date.now();
    try {
      const last = p.identifiers[p.identifiers.length - 1];
      const { code, reference } = await checkIdentifier(last);
      if (code === 0) await markPaid(order, reference || last);
      else if (code === 4 || code === 6) {
        p.state = code === 4 ? 'expired' : 'cancelled';
        log(order, code === 4 ? 'Paiement expiré' : 'Paiement annulé par le client');
        await saveOrder(order);
      } else await saveOrder(order);
    } catch (e) { console.error('status erreur', order.id, e.message); }
  }
  return json(publicOrder(order));
};
export const config = { path: '/api/order-status' };
