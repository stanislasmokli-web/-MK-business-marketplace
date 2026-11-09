import { json, fail, readJson, safeEq, makeSession, sessionCookie, isAdmin, adminConfigured, rateLimit, clientIp } from './_lib.mjs';
export default async (req, context) => {
  if (req.method === 'GET') return json({ authenticated: isAdmin(req), configured: adminConfigured() });
  if (req.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  if (!adminConfigured()) return fail('Admin non configuré : ajoute MK_ADMIN_PASSWORD et MK_ADMIN_SECRET (16 caractères min.) dans Netlify.', 503);
  if (!(await rateLimit(`login-${clientIp(context, req)}`, 8, 15 * 60 * 1000)))
    return fail('Trop de tentatives. Réessaie dans 15 minutes.', 429);
  const b = await readJson(req);
  if (!b || !safeEq(b.password, process.env.MK_ADMIN_PASSWORD)) return fail('Mot de passe incorrect.', 401);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(makeSession()) });
};
export const config = { path: '/api/auth' };
