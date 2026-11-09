import { json, fail, readJson, safeEq, getOrder, saveOrder, paygate, log, ORDER_ID_RE, getCatalogue } from './_lib.mjs';

// Lance le paiement Flooz / T-Money. Le montant et le numéro viennent de la commande stockée, pas du navigateur.
export default async (req) => {
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const b = await readJson(req);
  const id = String(b?.id || '');
  if (!ORDER_ID_RE.test(id)) return fail('Commande invalide');
  const order = await getOrder(id);
  if (!order || !safeEq(order.token, b?.token)) return fail('Commande introuvable', 404);

  if (order.status === 'paid' || order.status === 'delivered') return json({ ok: true, status: order.status });
  if (order.status !== 'pending' || !['FLOOZ', 'TMONEY'].includes(order.method))
    return fail('Cette commande ne se paie pas en ligne.', 409);
  if (!(process.env.PAYGATE_AUTH_TOKEN || process.env.PAYGATE_API_KEY))
    return fail('Le paiement en ligne n’est pas encore activé. Écris-nous sur WhatsApp avec ton numéro de commande.', 503);

  const p = order.payment;
  const now = Date.now();
  // Anti double-paiement : un seul paiement à la fois, 150 s de délai avant une nouvelle tentative.
  if ((p.state === 'initiating' || p.state === 'initiated') && now - (p.started_at || 0) < 150000)
    return fail('Un paiement est déjà en cours. Valide-le sur ton téléphone.', 409);
  if (p.attempts >= 5) return fail('Trop de tentatives. Écris-nous sur WhatsApp.', 429);

  // Le stock doit encore être là.
  const cat = await getCatalogue();
  for (const it of order.items) {
    const prod = cat.find((x) => x.id === it.id);
    if (!prod || !prod.active || prod.stock < it.quantity) return fail(`${it.name} n’est plus disponible en quantité suffisante.`, 409);
  }

  const identifier = `${order.id}-${p.attempts + 1}`;
  p.attempts += 1;
  p.state = 'initiating';
  p.started_at = now;
  p.identifiers = [...(p.identifiers || []), identifier];
  await saveOrder(order); // verrou posé AVANT l'appel PayGate

  try {
    const { ok, data } = await paygate('/v1/pay', {
      phone_number: order.pay_phone, amount: order.total, description: `Commande ${order.id}`,
      identifier, network: order.method,
    });
    if (ok && data.status === 0) {
      p.state = 'initiated';
      p.tx_reference = data.tx_reference || null;
      log(order, `Paiement ${order.method} lancé (tentative ${p.attempts})`);
      await saveOrder(order);
      return json({ ok: true, status: 'pending' });
    }
    p.state = 'failed';
    log(order, `PayGate a refusé la demande (code ${data?.status ?? 'inconnu'})`);
    await saveOrder(order);
    console.error('PayGate pay refusé', order.id, JSON.stringify(data));
    return fail('Le paiement n’a pas pu être lancé. Vérifie le numéro puis réessaie.', 502);
  } catch (e) {
    p.state = 'failed';
    log(order, 'Erreur réseau PayGate');
    await saveOrder(order);
    console.error('PayGate pay erreur', order.id, e.message);
    return fail('Service de paiement indisponible. Réessaie dans un instant.', 502);
  }
};
export const config = { path: '/api/pay' };
