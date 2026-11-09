import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { SEED } from './_seed.mjs';

/* ---------- Réglages de la boutique (modifiables ici) ---------- */
export const CONFIG = {
  brand: 'MK_Business',
  whatsapp: process.env.MK_WHATSAPP || '22870537502',
  cities: ['Lomé', 'Kara', 'Sokodé', 'Atakpamé', 'Kpalimé', 'Tsévié', 'Aného', 'Dapaong', 'Autre ville'],
  // Frais de livraison par ville en F CFA. Absent = 0 (à confirmer par WhatsApp).
  deliveryFees: {},
  maxPerLine: 10,
};

export const METHODS = ['FLOOZ', 'TMONEY', 'COD'];
export const ORDER_ID_RE = /^MK-\d{6}-[A-Z0-9]{4}$/;

/* ---------- Réponses ---------- */
export const store = (name) => getStore({ name, consistency: 'strong' });
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
export const fail = (message, status = 400) => json({ error: message }, status);
export const readJson = async (req) => { try { return await req.json(); } catch { return null; } };
export const nowIso = () => new Date().toISOString();

/* ---------- Comparaison à temps constant ---------- */
export function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------- Authentification admin (cookie signé, expire en 8 h) ---------- */
const secret = () => process.env.MK_ADMIN_SECRET || '';
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('hex');
export const adminConfigured = () => secret().length >= 16 && !!process.env.MK_ADMIN_PASSWORD;

export function makeSession() {
  const raw = String(Date.now() + 8 * 3600 * 1000);
  return Buffer.from(`${raw}.${sign(raw)}`).toString('base64url');
}
export const sessionCookie = (v, maxAge = 28800) =>
  `mk_admin=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export function isAdmin(req) {
  if (!adminConfigured()) return false;
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)mk_admin=([^;]+)/);
  if (!m) return false;
  try {
    const [exp, sig] = Buffer.from(m[1], 'base64url').toString().split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    return safeEq(sig, sign(exp));
  } catch { return false; }
}
/** Admin connecté ; pour les écritures, exige aussi l'en-tête X-MK (protection CSRF). */
export function adminOk(req) {
  if (!isAdmin(req)) return false;
  if (req.method !== 'GET' && req.headers.get('x-mk') !== '1') return false;
  return true;
}

/* ---------- Limitation de débit simple ---------- */
export async function rateLimit(key, max, windowMs) {
  const s = store('ratelimit');
  const k = key.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 120);
  const now = Date.now();
  let r = null;
  try { r = await s.get(k, { type: 'json' }); } catch { /* pas encore de valeur */ }
  if (!r || now - r.start > windowMs) r = { start: now, count: 0 };
  r.count += 1;
  await s.setJSON(k, r);
  return r.count <= max;
}
export const clientIp = (context, req) =>
  context?.ip || (req.headers.get('x-nf-client-connection-ip') || 'unknown');

/* ---------- Catalogue ---------- */
export async function getCatalogue() {
  let d = null;
  try { d = await store('catalogue').get('all', { type: 'json' }); } catch { /* vide */ }
  if (!Array.isArray(d)) {
    d = SEED.map((p) => ({ ...p, created_at: nowIso() }));
    await store('catalogue').setJSON('all', d);
  }
  return d;
}
export const saveCatalogue = (d) => store('catalogue').setJSON('all', d);

export async function deductStock(order) {
  if (order.stock_deducted) return;
  const cat = await getCatalogue();
  let issue = false;
  for (const it of order.items) {
    const p = cat.find((x) => x.id === it.id);
    if (!p) { issue = true; continue; }
    if (p.stock < it.quantity) issue = true;
    p.stock = Math.max(0, p.stock - it.quantity);
  }
  await saveCatalogue(cat);
  order.stock_deducted = true;
  if (issue) order.stock_issue = true;
}
export async function restock(order) {
  if (!order.stock_deducted) return;
  const cat = await getCatalogue();
  for (const it of order.items) {
    const p = cat.find((x) => x.id === it.id);
    if (p) p.stock += it.quantity;
  }
  await saveCatalogue(cat);
  order.stock_deducted = false;
}

/* ---------- Commandes (une clé par commande) ---------- */
export function newOrderId() {
  const d = new Date();
  const ymd = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[b[i] % alphabet.length];
  return `MK-${ymd}-${s}`;
}
export async function getOrder(id) {
  if (!ORDER_ID_RE.test(id)) return null;
  try { return await store('orders').get(id, { type: 'json' }); } catch { return null; }
}
export const saveOrder = (o) => store('orders').setJSON(o.id, o);
export const publicOrder = (o) => ({
  id: o.id, status: o.status, method: o.method, total: o.total, subtotal: o.subtotal, delivery: o.delivery,
  payment_state: o.payment?.state || null,
  items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
  city: o.customer.city, name: o.customer.name,
});
export function log(o, text) { (o.history ||= []).push({ at: nowIso(), text }); }

/** Marque une commande payée (idempotent) et décrémente le stock une seule fois. */
export async function markPaid(order, reference) {
  if (order.status === 'paid' || order.status === 'delivered') return order;
  await deductStock(order);
  order.status = 'paid';
  order.paid_at = nowIso();
  order.payment = { ...(order.payment || {}), state: 'success', reference: reference || order.payment?.reference || null };
  log(order, reference === 'manuel' ? 'Marquée payée à la main par l’admin' : `Paiement confirmé (réf. ${reference || '—'})`);
  await saveOrder(order);
  return order;
}

/* ---------- PayGate Global ---------- */
export async function paygate(path, payload) {
  const token = (process.env.PAYGATE_AUTH_TOKEN || process.env.PAYGATE_API_KEY);
  if (!token) throw new Error('PAYGATE_AUTH_TOKEN manquant');
  const r = await fetch(`https://paygateglobal.com/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_token: token, ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
/** Interroge PayGate côté serveur : 0 = payé, 2 = en cours, 4 = expiré, 6 = annulé. */
export async function checkIdentifier(identifier) {
  const { ok, data } = await paygate('/v2/status', { identifier });
  if (!ok || typeof data.status !== 'number') return { code: null };
  return { code: data.status, reference: data.tx_reference || data.payment_reference || null };
}

/** Numéro togolais : 8 chiffres (retire +228 / 00228). */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('228') && d.length === 11) d = d.slice(3);
  return d;
}
export const deliveryFor = (city) => Number(CONFIG.deliveryFees[city] || 0);
