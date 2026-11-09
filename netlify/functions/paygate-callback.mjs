import { json, fail, getOrder, checkIdentifier, markPaid, ORDER_ID_RE } from './_lib.mjs';

// Webhook PayGate. On NE FAIT PAS confiance au contenu reçu : on re-demande le statut à PayGate.
export default async (req) => {
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  let b = null;
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('json')) b = await req.json();
    else b = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch { /* ignoré */ }
  const identifier = String(b?.identifier || '');
  const orderId = identifier.replace(/-\d+$/, '');
  if (!ORDER_ID_RE.test(orderId)) return json({ ok: true });
  const order = await getOrder(orderId);
  if (!order || !(order.payment?.identifiers || []).includes(identifier)) return json({ ok: true });
  try {
    const { code, reference } = await checkIdentifier(identifier);
    if (code === 0) await markPaid(order, reference || identifier);
  } catch (e) { console.error('callback erreur', orderId, e.message); }
  return json({ ok: true });
};
export const config = { path: '/api/paygate-callback' };
